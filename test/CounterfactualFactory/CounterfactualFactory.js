var App                   = artifacts.require("./App.sol");
var Dataset               = artifacts.require("./Dataset.sol");
var Workerpool            = artifacts.require("./Workerpool.sol");
var CounterfactualFactory = artifacts.require("./CounterfactualFactory.sol");

const { shouldFail } = require('openzeppelin-test-helpers');
const   multiaddr    = require('multiaddr');
const   constants    = require("../../utils/constants");
const   odbtools     = require('../../utils/odb-tools');
const   wallets      = require('../../utils/wallets');


function extractEvents(txMined, address, name)
{
	return txMined.logs.filter((ev) => { return ev.address == address && ev.event == name });
}

contract('CounterfactualFactory', async (accounts) => {

	assert.isAtLeast(accounts.length, 10, "should have at least 10 accounts");
	let iexecAdmin      = accounts[0];
	let sgxEnclave      = accounts[0];
	let appProvider     = accounts[1];
	let datasetProvider = accounts[2];
	let scheduler       = accounts[3];
	let worker1         = accounts[4];
	let worker2         = accounts[5];
	let worker3         = accounts[6];
	let worker4         = accounts[7];
	let worker5         = accounts[8];
	let user            = accounts[9];

	let factory = null;

	/***************************************************************************
	 *                        Environment configuration                        *
	 ***************************************************************************/
	before("configure", async () => {
		console.log("# web3 version:", web3.version);
		factory = await CounterfactualFactory.new();
	});

	it("Predicted address", async () => {

		const code = new web3.eth.Contract(App.abi).deploy({
			data: App.bytecode,
			arguments: [
				appProvider, // address _appOwner,
				"TestApp1",  // string  _appName,
				"NULL",      // string  _appType,
				"0x",        // bytes   _appMultiaddr,
				"0x",        // bytes32 _appChecksum,
				"0x",        // bytes   _appMREnclave
			]
		}).encodeABI();

		const init = "0x";
		const salt = web3.utils.keccak256(init) || "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

		const predictedAddress = web3.utils.toChecksumAddress(web3.utils.soliditySha3(
			{ t: 'bytes1',  v: '0xff'                     },
			{ t: 'address', v: factory.address            },
			{ t: 'bytes32', v: salt                       },
			{ t: 'bytes32', v: web3.utils.keccak256(code) },
		).slice(26));

		const tx = await factory.createContract(code, init);
		assert.equal(tx.logs[0].args.contractAddress, predictedAddress, "address do not match");

		const app = await App.at(predictedAddress);

		assert.equal(await app.owner(),          appProvider           );
		assert.equal(await app.m_appName(),      "TestApp1"            );
		assert.equal(await app.m_appType(),      "NULL"                );
		assert.equal(await app.m_appMultiaddr(), null                  );
		assert.equal(await app.m_appChecksum(),  constants.NULL.BYTES32);
		assert.equal(await app.m_appMREnclave(), null                  );
	});

	it("Avoid duplicate", async () => {

		const code = new web3.eth.Contract(App.abi).deploy({
			data: App.bytecode,
			arguments: [
				appProvider,            // address _appOwner
				"TestApp2",             // string  _appName
				"NULL",                 // string  _appType
				"0x",                   // bytes   _appMultiaddr
				constants.NULL.BYTES32, // bytes32 _appChecksum
				"0x",                   // bytes   _appMREnclave
			]
		}).encodeABI();

		const init = "0x";

		// new: ok
		await factory.createContract(code, init);

		// duplicate: fail
		await shouldFail.reverting(factory.createContract(code, init));
	});

});
