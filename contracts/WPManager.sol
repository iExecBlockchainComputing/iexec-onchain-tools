pragma solidity ^0.5.8;

library DataStores
{
	struct ASet
	{
		address[] content;
		mapping(address => uint256) index;
	}

	function size(ASet storage self)
		internal view returns (uint256)
	{
		return self.content.length:
	}

	function contains(ASet storage self, address entry)
		internal view returns (bool)
	{
		return self.index[entry] < self.content.length && self.content[self.index[entry]] == entry;
	}

	function add(ASet storage self, address entry)
		internal returns (bool)
	{
		if (!contains(self, entry))
		{
			self.index[entry] = self.content.length;
			self.content.push(entry);
			return true;
		}
		else
		{
			return false;
		}
	}

	function remove(ASet storage self, address entry)
		internal returns (bool)
	{
		if (contains(self, entry))
		{
			uint256 idx  = self.index[entry];
			uint256 last = self.content.length - 1;
			// last is now at position idx
			self.index[self.content[last]] = idx;
			// entry is no longer present
			self.index[entry] = 0;
			// move last entry to its new position
			self.content[idx] = self.content[last];
			// resize content
			self.content.length = last;
			return true;
		}
		else
		{
			return false;
		}
	}
}







contract WorkerpoolManager
{
	using DataStores for DataStores.ASet;

	DataStores.ASet m_workers;
	mapping(address => uint256) m_registrationDate;



	function register()
		public
	{
		require(m_workers.add(msg.sender));
		m_registrationDate[msg.sender] = now;
		// lock deposit ?
	}

	function unregister()
		public
	{
		require(m_workers.remove(msg.sender));
		m_registrationDate[msg.sender] = 0;
		// release deposit
	}

	function isRegistered(address _w)
		public view returns (bool)
	{
		return m_workers.contains(_w);
	}

	function allWorkers()
		public view returns (address[] memory)
	{
		return m_workers.content;
	}

	function workerDetails(address _w)
		public view returns (uint256)
	{
		return m_registrationDate[_w];
	}




	function difficulty()
		public pure returns (uint256)
	{
		// TODO: Make it dynamic based on m_workers.size()
		// → needs an insentive to force workers to unregister
		return 4; // 4 → difficultyMask value (accept with proba 2**-4)
	}

	function mask(uint256 i)
		public pure returns (bytes32)
	{
		return ~(bytes32(uint256(-1)) >> i);
	}

	function isValidSignature(bytes32 _data, bytes calldata _signature)
		external view returns (bool)
	{
		(address worker, bytes32 taskid) = abi.decode((address, bytes32, address), _signature);

		// signature must contain the order details
		require(_data == toEthSignedMessageHash(keccak256(abi.encodePacked(worker, taskid, address(0)))));
		// worker must be registered
		require(isRegistered(worker));
		// worker selection
		require(keccak256(abi.encodePacked(worker, taskid)) & mask(difficulty()) == bytes32(0));
		// must be registered for a certain time ?
		// m_registrationDate[worker] + 1 hour < now;
		// m_registrationDate[worker] < deal.startTime;
	}


}
