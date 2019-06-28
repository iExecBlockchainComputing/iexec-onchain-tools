pragma solidity ^0.5.8;

import "./CounterfactualFactoryBase.sol";

contract CounterfactualFactory is CounterfactualFactoryBase
{
	event contractCreated(address contractAddress);

	constructor()
	public
	{
	}

	function createContract(bytes calldata _code, bytes calldata _init)
	external returns(address)
	{
		bytes32 salt            = keccak256(_init);
		address contractAddress = _create2(_code, salt);
		if (_init.length > 0)
		{
			bool success;
			(success,) = contractAddress.call(_init);
			require(success, "initialization-failed");
		}
		emit contractCreated(contractAddress);
		return contractAddress;
	}
}
