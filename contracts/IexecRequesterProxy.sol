pragma solidity ^0.5.8;
pragma experimental ABIEncoderV2;

import "iexec-doracle-base/contracts/IexecInterface.sol";
import "iexec-solidity/contracts/ERC20_Token/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract IexecRequesterProxy is IexecInterface, ERC20, Ownable
{
	IERC20 public baseToken;

	using IexecODBLibOrders for bytes32;
	using IexecODBLibOrders for IexecODBLibOrders.RequestOrder;

	struct OrderDetail
	{
		uint256 maxprice;
		uint256 volume;
		address requester;
	}
	mapping(bytes32 => OrderDetail) m_orderDetails;
	mapping(bytes32 =>        bool) m_unlocked;

	// Use _iexecHubAddr to force use of custom iexechub, leave 0x0 for autodetect
	constructor(address _iexecHubAddr)
		public IexecInterface(_iexecHubAddr)
	{
		baseToken = iexecClerk.token();
	}

	function destructor(address payable beneficiary)
		external onlyOwner
	{
		// require(iexecClerk.viewAccount(address(this)).locked == 0); // Needed ?
		iexecClerk.withdraw(iexecClerk.viewAccount(address(this)).stake);
		baseToken.transfer(beneficiary, baseToken.balanceOf(address(this)));
		selfdestruct(beneficiary);
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
		external returns (bool)
	{
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
		uint256 lock = maxprice
			.mul(_order.volume);

		// lock price from requester
		_transfer(msg.sender, address(this), lock);

		// record details for refund of unspent tokens
		bytes32             rohash    = _order.hash().toEthTypedStructHash(iexecClerk.EIP712DOMAIN_SEPARATOR());
		OrderDetail storage rodetails = m_orderDetails[rohash];

		require(rodetails.requester == address(0));
		rodetails.maxprice  = maxprice;
		rodetails.volume    = _order.volume;
		rodetails.requester = msg.sender;

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
		bytes32            rohash    = _order.hash().toEthTypedStructHash(iexecClerk.EIP712DOMAIN_SEPARATOR());
		OrderDetail memory rodetails = m_orderDetails[rohash];

		// only requester can cancel
		require(msg.sender == rodetails.requester);

		// compute the non consumed part of the order
		uint256 canceled = rodetails.volume.sub(iexecClerk.viewConsumed(rohash));
		uint256 refund   = rodetails.maxprice.mul(canceled);

		// refund the non consumed part
		_transfer(address(this), rodetails.requester, refund);

		// cancel the order
		require(iexecClerk.cancelRequestOrder(_order));
	}

	function unlockClaim(bytes32 _rohash, uint256 _botFirst, uint256 _idx)
		public
	{
		// compute the dealid & taskid
		bytes32 dealid = keccak256(abi.encodePacked(_rohash, _botFirst));
		bytes32 taskid = keccak256(abi.encodePacked(dealid, _idx));

		// only refund failled tasks one time
		require(!m_unlocked[taskid], "task-already-claimed");
		m_unlocked[taskid] = true;

		// get deal and order details
		OrderDetail          memory rodetails = m_orderDetails[_rohash];
		IexecODBLibCore.Deal memory deal      = iexecClerk.viewDeal(dealid);
		IexecODBLibCore.Task memory task      = iexecHub.viewTask(taskid);

		// check that the claim is valid
		require(task.status == IexecODBLibCore.TaskStatusEnum.FAILLED, "status-not-failled");

		// compute the price actually paid
		uint256 actualprice = deal.app.price
			.add(deal.dataset.price)
			.add(deal.workerpool.price);

		// refund the difference
		_transfer(address(this), rodetails.requester, actualprice); // task <=> volume == 1
	}

	function unlockUnspent(bytes32 _rohash, uint256 _botFirst)
		public
	{
		// compute the dealid
		bytes32 dealid = keccak256(abi.encodePacked(_rohash, _botFirst));

		// only refund the difference one time
		require(!m_unlocked[dealid], "deal-already-processed");
		m_unlocked[dealid] = true;

		// get deal and order details
		OrderDetail          memory rodetails = m_orderDetails[_rohash];
		IexecODBLibCore.Deal memory deal      = iexecClerk.viewDeal(dealid);

		// compute the price actually paid
		uint256 actualprice = deal.app.price
			.add(deal.dataset.price)
			.add(deal.workerpool.price);

		// compute the difference between the lock and the price paid
		uint256 delta = rodetails.maxprice
			.sub(actualprice);

		// refund the difference
		_transfer(address(this), rodetails.requester, delta.mul(deal.botSize));
		// burn the rest
		_burn(address(this), actualprice.mul(deal.botSize));
	}

}
