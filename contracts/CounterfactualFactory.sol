pragma solidity ^0.5.8;

contract CounterfactualFactory
{
	event contractCreated(address contractAddress);

	constructor()
	public
	{
	}

	function createContract(bytes calldata _code, bytes32 _salt)
	external returns(address)
	{
		address contractAddress;
		bytes memory code = _code;
		bytes32      salt = _salt;

		// solium-disable-next-line security/no-inline-assembly
		assembly
		{
			contractAddress := create2(0, add(code, 0x20), mload(code), salt)
			if iszero(extcodesize(contractAddress)) { revert(0, 0) }
		}

		emit contractCreated(contractAddress);

		return contractAddress;
	}
}
