pragma solidity ^0.5.8;
pragma experimental ABIEncoderV2;

import "iexec-doracle-base/contracts/IexecInterface.sol";
import "iexec-solidity/contracts/ERC20_Token/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract IexecRequesterProxy is IexecInterface, SignatureVerifier, ERC20, Ownable
{
	IERC20  public baseToken;
	address public authorizedApp;
	address public authorizedDataset;
	address public authorizedWorkerpool;

	// Use _iexecHubAddr to force use of custom iexechub, leave 0x0 for autodetect
	constructor(address _iexecHubAddr)
		public IexecInterface(_iexecHubAddr)
	{
		baseToken = iexecClerk.token();
	}

	function _iexecDoracleUpdateSettings(address _authorizedApp, address _authorizedDataset, address _authorizedWorkerpool)
		external onlyOwner
	{
		authorizedApp        = _authorizedApp;
		authorizedDataset    = _authorizedDataset;
		authorizedWorkerpool = _authorizedWorkerpool;
	}

	function destructor(address payable beneficiary)
		external onlyOwner
	{
		require(iexecClerk.viewAccount(address(this)).locked == 0); // Needed to ensure no tokens are burned
		iexecClerk.withdraw(iexecClerk.viewAccount(address(this)).stake);
		baseToken.transfer(beneficiary, baseToken.balanceOf(address(this)));
		selfdestruct(beneficiary);
	}

	function deposit(uint256 _amount)
		external onlyOwner returns (bool)
	{
		require(baseToken.transferFrom(msg.sender, address(this), _amount));
		require(baseToken.approve(address(iexecClerk), _amount));
		require(iexecClerk.deposit(_amount));

		_mint(msg.sender, _amount);
		return true;
	}

	function depositFor(uint256 _amount, address _target)
		external onlyOwner returns (bool)
	{
		require(baseToken.transferFrom(msg.sender, address(this), _amount));
		require(baseToken.approve(address(iexecClerk), _amount));
		require(iexecClerk.deposit(_amount));

		_mint(_target, _amount);
		return true;
	}

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
		bytes32 dealid = iexecClerk.signRequestOrder(_requestorder);
		IexecODBLibCore.Deal memory deal = iexecClerk.viewDeal(dealid);

		// pay for deal
		uint256 dealprice = deal.app.add(deal.dataset).add(deal.workerpool).mul(deal.botSize);
		_transfer(msg.sender, address(this), dealprice);

		// prevent extra usage of requestorder
		if (deal.botSize < _requestorder.volume)
		{
			iexecClerk.cancelOrder(_requestorder);
		}

		return dealid;
	}
}
