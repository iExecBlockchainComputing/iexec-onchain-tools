pragma solidity ^0.5.8;
pragma experimental ABIEncoderV2;

import "iexec-doracle-base/contracts/IexecInterface.sol";
import "iexec-solidity/contracts/ERC20_Token/ERC20.sol";
import "iexec-solidity/contracts/ERC20_Token/ERC20Detailed.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract IexecRequesterProxy is IexecInterface, SignatureVerifier, ERC20, ERC20Detailed, Ownable
{
	using SafeMath for uint256;

	IERC20  public baseToken;
	address public authorizedApp;
	address public authorizedDataset;
	address public authorizedWorkerpool;

	event DealRequested(bytes32 dealid);

	// Use _iexecHubAddr to force use of custom iexechub, leave 0x0 for autodetect
	constructor(address _iexecHubAddr)
		public
		IexecInterface(_iexecHubAddr)
		ERC20Detailed("Proxy RLC", "pRLC", 9)
	{
		baseToken = iexecClerk.token();
	}

	function viewAccount(address _user)
		external view returns (IexecODBLibCore.Account memory account)
	{
		return IexecODBLibCore.Account(balanceOf(_user), 0);
	}

	// match orders
	function matchOrders(
		IexecODBLibOrders.AppOrder        memory _apporder,
		IexecODBLibOrders.DatasetOrder    memory _datasetorder,
		IexecODBLibOrders.WorkerpoolOrder memory _workerpoolorder,
		IexecODBLibOrders.RequestOrder    memory _requestorder)
		public returns (bytes32)
	{
		// check whitelist
		require(authorizedApp        == address(0) || checkIdentity(authorizedApp,        _apporder.app,               iexecClerk.GROUPMEMBER_PURPOSE()), "unauthorized-app");
		require(authorizedDataset    == address(0) || checkIdentity(authorizedDataset,    _datasetorder.dataset,       iexecClerk.GROUPMEMBER_PURPOSE()), "unauthorized-dataset");
		require(authorizedWorkerpool == address(0) || checkIdentity(authorizedWorkerpool, _workerpoolorder.workerpool, iexecClerk.GROUPMEMBER_PURPOSE()), "unauthorized-workerpool");

		// force requester
		_requestorder.requester = address(this);

		// sign order
		require(iexecClerk.signRequestOrder(_requestorder));

		// match and retreive deal
		bytes32 dealid = iexecClerk.matchOrders(_apporder, _datasetorder, _workerpoolorder, _requestorder);
		IexecODBLibCore.Deal memory deal = iexecClerk.viewDeal(dealid);

		// pay for deal
		uint256 dealprice = deal.app.price.add(deal.dataset.price).add(deal.workerpool.price).mul(deal.botSize);
		_burn(msg.sender, dealprice);

		// prevent extra usage of requestorder
		if (deal.botSize < _requestorder.volume)
		{
			iexecClerk.cancelRequestOrder(_requestorder);
		}

		emit DealRequested(dealid);

		return dealid;
	}

	// admin control
	function updateSettings(address _authorizedApp, address _authorizedDataset, address _authorizedWorkerpool)
		external onlyOwner
	{
		authorizedApp        = _authorizedApp;
		authorizedDataset    = _authorizedDataset;
		authorizedWorkerpool = _authorizedWorkerpool;
	}

	// admin token operations
	function transferAdmin(address _from, address _to, uint256 _amount)
		external onlyOwner returns (bool)
	{
		_transfer(_from, _to, _amount);
		return false;
	}

	function deposit(uint256 _amount)
		external onlyOwner returns (bool)
	{
		_deposit(msg.sender, _amount);
		_mint(msg.sender, _amount);
		return true;
	}

	function depositFor(uint256 _amount, address _target)
		external onlyOwner returns (bool)
	{
		_deposit(msg.sender, _amount);
		_mint(_target, _amount);
		return true;
	}

	function withdraw(uint256 _amount)
		external onlyOwner returns (bool)
	{
		_burn(msg.sender, _amount);
		_withdraw(msg.sender, _amount);
		return true;
	}

	function withdrawFrom(uint256 _amount, address _target)
		external onlyOwner returns (bool)
	{
		_burn(_target, _amount);
		_withdraw(msg.sender, _amount);
		return true;
	}

	// reclaim locked funds
	function reclaim()
		external onlyOwner returns (bool)
	{
		_mint(msg.sender, iexecClerk.viewAccount(address(this)).stake.sub(totalSupply()));
		return true;
	}

	// destructor
	function destructor(address payable beneficiary)
		external onlyOwner
	{
		require(iexecClerk.viewAccount(address(this)).locked == 0); // Needed to ensure no tokens are burned
		// don't use withdraw (or force reclaim first)
		iexecClerk.withdraw(iexecClerk.viewAccount(address(this)).stake);
		baseToken.transfer(beneficiary, baseToken.balanceOf(address(this)));
		selfdestruct(beneficiary);
	}

	// internal methods
	function _deposit(address _from, uint256 _amount)
		internal
	{
		require(baseToken.transferFrom(_from, address(this), _amount));
		require(baseToken.approve(address(iexecClerk), _amount));
		require(iexecClerk.deposit(_amount));
	}

	function _withdraw(address _to, uint256 _amount)
		internal
	{
		iexecClerk.withdraw(_amount);
		baseToken.transfer(_to, _amount);
	}

}
