pragma solidity ^0.5.8;

import "./CounterfactualFactoryBase.sol";

contract CounterfactualFactory is CounterfactualFactoryBase
{
	event contractCreated(address contractAddress);

	constructor()
	public
	{
	}

	function createContract(bytes calldata _code, bytes32 _salt)
	external returns(address)
	{
		address contractAddress = _create2(_code, _salt);
		emit contractCreated(contractAddress);
		return contractAddress;
	}
}
