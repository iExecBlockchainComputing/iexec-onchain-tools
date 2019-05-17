pragma solidity ^0.5.8;
pragma experimental ABIEncoderV2;

import "iexec-doracle-base/contracts/IexecInterface.sol";
import "iexec-solidity/contracts/ERC20_Token/ERC20.sol";

contract IexecRequesterProxy is IexecInterface, ERC20
{
	IERC20 public baseToken;

	using IexecODBLibOrders for bytes32;
	using IexecODBLibOrders for IexecODBLibOrders.RequestOrder;

	struct OrderDetail
	{
		uint256 maxprice;
		address requester;
	}
	mapping(bytes32 => OrderDetail) m_orderDetails;
	mapping(bytes32 =>        bool) m_dealUnlocked;

	// Use _iexecHubAddr to force use of custom iexechub, leave 0x0 for autodetect
	constructor(address _iexecHubAddr)
	public IexecInterface(_iexecHubAddr)
	{
		baseToken = iexecClerk.token();
	}

	function deposit(uint256 _amount)
		external returns (bool)
	{
		require(baseToken.transferFrom(msg.sender, address(this), _amount));
		require(baseToken.approve(address(iexecClerk), _amount));
		require(iexecClerk.deposit(_amount));

		_mint(msg.sender, _amount);
		return true;
	}

	function depositFor(uint256 _amount, address _target)
		public returns (bool)
	{
		require(_target != address(0));

		require(baseToken.transferFrom(msg.sender, address(this), _amount));
		require(baseToken.approve(address(iexecClerk), _amount));
		require(iexecClerk.deposit(_amount));

		_mint(_target, _amount);
		return true;
	}

	function submit(IexecODBLibOrders.RequestOrder memory _order)
		public
	{
		// compute order price and total necessary lock.
		uint256 maxprice = _order.appmaxprice
			.add(_order.datasetmaxprice)
			.add(_order.workerpoolmaxprice);
		uint256 lock = maxprice.mul(_order.volume);

		// lock price from requester
		_transfer(msg.sender, address(this), lock);

		// record details for refund of unspent tokens
		bytes32 requestorderHash = _order.hash().toEthTypedStructHash(iexecClerk.EIP712DOMAIN_SEPARATOR());

		OrderDetail storage od = m_orderDetails[requestorderHash];
		require(od.requester == address(0));
		od.maxprice  = maxprice;
		od.requester = msg.sender;

		// set requester
		_order.requester = address(this);

		// sign and broadcast
		require(iexecClerk.signRequestOrder(_order));
		iexecClerk.broadcastRequestOrder(_order);
	}

	function cancel(IexecODBLibOrders.RequestOrder memory _order)
		public
	{
		// get order details
		bytes32 requestorderHash = _order.hash().toEthTypedStructHash(iexecClerk.EIP712DOMAIN_SEPARATOR());
		OrderDetail storage od = m_orderDetails[requestorderHash];

		// only requester can cancel
		require(msg.sender == od.requester);

		// compute the non consumed part of the order
		uint256 consumed = iexecClerk.viewConsumed(requestorderHash);
		uint256 refund   = od.maxprice.mul(_order.volume.sub(consumed));

		// refund the non consumed part
		_transfer(address(this), od.requester, refund);

		// cancel the order
		require(iexecClerk.cancelRequestOrder(_order));
	}

	function unlockUnspent(bytes32 _requestorderhash, uint256 _botFirst)
		public
	{
		// compute the dealid
		bytes32 dealid = keccak256(abi.encodePacked(_requestorderhash, _botFirst));

		// only refund the difference one time
		require(!m_dealUnlocked[dealid], "deal-already-processed");
		m_dealUnlocked[dealid] = true;

		// get deal and order details
		IexecODBLibCore.Deal memory  deal = iexecClerk.viewDeal(dealid);
		OrderDetail          storage od   = m_orderDetails[_requestorderhash];

		// compute the price actually paid
		uint256 actualprice = deal.app.price
			.add(deal.dataset.price)
			.add(deal.workerpool.price);

		// compute the difference between the lock and the price paid
		uint256 delta = od.maxprice
			.sub(actualprice);

		// refund the difference
		_transfer(address(this), od.requester, delta.mul(deal.botSize));
		// burn the rest
		_burn(address(this), actualprice.mul(deal.botSize));
	}

}
