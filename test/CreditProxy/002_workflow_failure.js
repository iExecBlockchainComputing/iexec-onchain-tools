var RLC                = artifacts.require("../node_modules/rlc-faucet-contract/contracts/RLC.sol");
var IexecHub           = artifacts.require("../node_modules/iexec-poco/contracts/IexecHub.sol");
var IexecClerk         = artifacts.require("../node_modules/iexec-poco/contracts/IexecClerk.sol");
var AppRegistry        = artifacts.require("../node_modules/iexec-poco/contracts/AppRegistry.sol");
var DatasetRegistry    = artifacts.require("../node_modules/iexec-poco/contracts/DatasetRegistry.sol");
var WorkerpoolRegistry = artifacts.require("../node_modules/iexec-poco/contracts/WorkerpoolRegistry.sol");
var App                = artifacts.require("../node_modules/iexec-poco/contracts/App.sol");
var Dataset            = artifacts.require("../node_modules/iexec-poco/contracts/Dataset.sol");
var Workerpool         = artifacts.require("../node_modules/iexec-poco/contracts/Workerpool.sol");
var CreditProxy        = artifacts.require("./CreditProxy.sol");

const { shouldFail } = require('openzeppelin-test-helpers');
const   multiaddr    = require('multiaddr');
const   constants    = require('../../utils/constants');
const   odbtools     = require('../../utils/odb-tools');
const   wallets      = require('../../utils/wallets');

function extractEvents(txMined, address, name)
{
	return txMined.logs.filter((ev) => { return ev.address == address && ev.event == name });
}

contract('CreditProxy', async (accounts) => {

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

	var RLCInstance                = null;
	var IexecHubInstance           = null;
	var IexecClerkInstance         = null;
	var AppRegistryInstance        = null;
	var DatasetRegistryInstance    = null;
	var WorkerpoolRegistryInstance = null;

	var AppInstance        = null;
	var DatasetInstance    = null;
	var WorkerpoolInstance = null;

	var apporder        = null;
	var workerpoolorder = null;
	var requestorder    = null;

	var CreditProxyInstance = null;

	var totalgas = 0;

	const result = web3.eth.abi.encodeParameters(['string'],['CreditProxy']);
	const workers = [
		{ address: worker1, enclave: constants.NULL.ADDRESS, determinism: web3.utils.keccak256(result), callback: result },
		{ address: worker2, enclave: constants.NULL.ADDRESS, determinism: web3.utils.keccak256(result), callback: result },
		{ address: worker3, enclave: constants.NULL.ADDRESS, determinism: web3.utils.keccak256(result), callback: result },
	];
	const trusttarget = 2 ** workers.length;


	/***************************************************************************
	 *                        Environment configuration                        *
	 ***************************************************************************/
	before("configure", async () => {
		console.log("# web3 version:", web3.version);

		/**
		 * Retreive deployed contracts
		 */
		RLCInstance                = await RLC.deployed();
		IexecHubInstance           = await IexecHub.deployed();
		IexecClerkInstance         = await IexecClerk.deployed();
		AppRegistryInstance        = await AppRegistry.deployed();
		DatasetRegistryInstance    = await DatasetRegistry.deployed();
		WorkerpoolRegistryInstance = await WorkerpoolRegistry.deployed();
		CreditProxyInstance        = await CreditProxy.deployed();

		odbtools.setup({
			name:              "iExecODB",
			version:           "3.0-alpha",
			chainId:           await web3.eth.net.getId(),
			verifyingContract: IexecClerkInstance.address,
		});

		/**
		 * Token distribution
		 */
		assert.equal(await RLCInstance.owner(), iexecAdmin, "iexecAdmin should own the RLC smart contract");
		txsMined = await Promise.all([
			RLCInstance.transfer(appProvider,     1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(datasetProvider, 1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(scheduler,       1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker1,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker2,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker3,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker4,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker5,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(user,            1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED })
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[7].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[8].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		let balances = await Promise.all([
			RLCInstance.balanceOf(appProvider),
			RLCInstance.balanceOf(datasetProvider),
			RLCInstance.balanceOf(scheduler),
			RLCInstance.balanceOf(worker1),
			RLCInstance.balanceOf(worker2),
			RLCInstance.balanceOf(worker3),
			RLCInstance.balanceOf(worker4),
			RLCInstance.balanceOf(worker5),
			RLCInstance.balanceOf(user)
		]);
		assert.equal(balances[0], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[1], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[2], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[3], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[4], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[5], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[6], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[7], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[8], 1000000000, "1000000000 nRLC here");

		txsMined = await Promise.all([
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: appProvider,     gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: datasetProvider, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: scheduler,       gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker1,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker2,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker3,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker4,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker5,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: user,            gas: constants.AMOUNT_GAS_PROVIDED })
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[7].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[8].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		txsMined = await Promise.all([
			IexecClerkInstance.deposit(100000, { from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker1,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker2,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker3,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker4,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker5,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: user,      gas: constants.AMOUNT_GAS_PROVIDED }),
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
	});

	it("App & Workerpool deployment", async () => {
		// CREATEAPP
		txMined = await AppRegistryInstance.createApp(
			appProvider,
			"R Clifford Attractors",
			"DOCKER",
			constants.MULTIADDR_BYTES,
			constants.NULL.BYTES32,
			"0x",
			{ from: appProvider, gas: constants.AMOUNT_GAS_PROVIDED }
		);
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, AppRegistryInstance.address, "CreateApp");
		AppInstance = await App.at(events[0].args.app);

		// CREATEWORKERPOOL
		txMined = await WorkerpoolRegistryInstance.createWorkerpool(
			scheduler,
			"A test workerpool",
			{ from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED }
		);
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, WorkerpoolRegistryInstance.address, "CreateWorkerpool");
		WorkerpoolInstance = await Workerpool.at(events[0].args.workerpool);

		txMined = await WorkerpoolInstance.changePolicy(/* worker stake ratio */ 35, /* scheduler reward ratio */ 5, { from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
	});

	it("Proxy Deposit", async () => {
		await RLCInstance.approve(CreditProxyInstance.address, 1000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
		await CreditProxyInstance.deposit(1000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED })
	});

	it("Check balances", async () => {
		assert.equal    (await RLCInstance.balanceOf(CreditProxyInstance.address),          0,                  "check proxy's RLC balance");
		assert.equal    (await CreditProxyInstance.balanceOf(iexecAdmin),                   1000000,            "check admin's proxy balance");
		assert.equal    (await CreditProxyInstance.balanceOf(user),                         0,                  "check user's proxy balance");
		assert.equal    (await CreditProxyInstance.totalSupply(),                           1000000,            "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(CreditProxyInstance.address), [ "1000000", "0" ], "check proxy's account on clerk");
	});

	it("Proxy Deposit", async () => {
		await CreditProxyInstance.transfer(user, 100000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED })
	});

	it("Check balances", async () => {
		assert.equal    (await RLCInstance.balanceOf(CreditProxyInstance.address),          0,                  "check proxy's RLC balance");
		assert.equal    (await CreditProxyInstance.balanceOf(iexecAdmin),                   900000,             "check admin's proxy balance");
		assert.equal    (await CreditProxyInstance.balanceOf(user),                         100000,             "check user's proxy balance");
		assert.equal    (await CreditProxyInstance.totalSupply(),                           1000000,            "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(CreditProxyInstance.address), [ "1000000", "0" ], "check proxy's account on clerk");
	});

	it("Orders", async () => {
		// Orders
		apporder = odbtools.signAppOrder(
			{
				app:                AppInstance.address,
				appprice:           10,
				volume:             1000,
				tag:                constants.NULL.BYTES32,
				datasetrestrict:    constants.NULL.ADDRESS,
				workerpoolrestrict: constants.NULL.ADDRESS,
				requesterrestrict:  constants.NULL.ADDRESS,
				salt:               web3.utils.randomHex(32),
				sign:               constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(appProvider)
		);
		workerpoolorder = odbtools.signWorkerpoolOrder(
			{
				workerpool:        WorkerpoolInstance.address,
				workerpoolprice:   100,
				volume:            1000,
				tag:               constants.NULL.BYTES32,
				category:          0,
				trust:             trusttarget,
				apprestrict:       constants.NULL.ADDRESS,
				datasetrestrict:   constants.NULL.ADDRESS,
				requesterrestrict: constants.NULL.ADDRESS,
				salt:              web3.utils.randomHex(32),
				sign:              constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(scheduler)
		);

		requestorder = {
			app:                AppInstance.address,
			appmaxprice:        1000,
			dataset:            constants.NULL.ADDRESS,
			datasetmaxprice:    0,
			workerpool:         constants.NULL.ADDRESS,
			workerpoolmaxprice: 1000,
			volume:             1,
			tag:                constants.NULL.BYTES32,
			category:           0,
			trust:              trusttarget,
			requester:          CreditProxyInstance.address,
			beneficiary:        user,
			callback:           constants.NULL.ADDRESS,
			params:             "<myparams>",
			salt:               web3.utils.randomHex(32),
			sign:               constants.NULL.SIGNATURE,
		};
	});

	it("Check balances", async () => {
		assert.equal    (await RLCInstance.balanceOf(CreditProxyInstance.address),          0,                  "check proxy's RLC balance");
		assert.equal    (await CreditProxyInstance.balanceOf(iexecAdmin),                   900000,             "check admin's proxy balance");
		assert.equal    (await CreditProxyInstance.balanceOf(user),                         100000,             "check user's proxy balance");
		assert.equal    (await CreditProxyInstance.totalSupply(),                           1000000,            "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(CreditProxyInstance.address), [ "1000000", "0" ], "check proxy's account on clerk");
	});

	it("Deal", async () => {
		// Deal on proxy
		txMined = await CreditProxyInstance.matchOrders(apporder, constants.NULL.DATAORDER, workerpoolorder, requestorder, { from: user, gasLimit: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		totalgas += txMined.receipt.gasUsed;

		deal = extractEvents(txMined, CreditProxyInstance.address, "DealRequested")[0].args.dealid;
	});

	it("Check balances", async () => {
		assert.equal    (await RLCInstance.balanceOf(CreditProxyInstance.address),          0,                   "check proxy's RLC balance");
		assert.equal    (await CreditProxyInstance.balanceOf(iexecAdmin),                   900000,              "check admin's proxy balance");
		assert.equal    (await CreditProxyInstance.balanceOf(user),                         99890,               "check user's proxy balance");
		assert.equal    (await CreditProxyInstance.totalSupply(),                           999890,              "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(CreditProxyInstance.address), [ "999890", "110" ], "check proxy's account on clerk");
	});

	it("Initialization", async () => {
		task = extractEvents(await IexecHubInstance.initialize(deal, 0, { from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED }), IexecHubInstance.address, "TaskInitialize")[0].args.taskid;
	});

	it("clock fast forward", async () => {
		target = Number((await IexecHubInstance.viewTask(task)).finalDeadline);
		await web3.currentProvider.send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [ target - (await web3.eth.getBlock("latest")).timestamp ], id: 0 }, () => {});
	});

	it("Finalize", async () => {
		txMined = await IexecHubInstance.claim(task, { from: user, gas: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, IexecHubInstance.address, "TaskClaimed");
		assert.equal(events[0].args.taskid, task, "check taskid");
	});

	it("Check balances", async () => {
		assert.equal    (await RLCInstance.balanceOf(CreditProxyInstance.address),          0,                  "check proxy's RLC balance");
		assert.equal    (await CreditProxyInstance.balanceOf(iexecAdmin),                   900000,             "check admin's proxy balance");
		assert.equal    (await CreditProxyInstance.balanceOf(user),                         99890,              "check user's proxy balance");
		assert.equal    (await CreditProxyInstance.totalSupply(),                           999890,             "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(CreditProxyInstance.address), [ "1000000", "0" ], "check proxy's account on clerk");
	});

	it("Check balances", async () => {
		await CreditProxyInstance.reclaim({ from: iexecAdmin });
	});

	it("Check balances", async () => {
		assert.equal    (await RLCInstance.balanceOf(CreditProxyInstance.address),          0,                  "check proxy's RLC balance");
		assert.equal    (await CreditProxyInstance.balanceOf(iexecAdmin),                   900110,             "check admin's proxy balance");
		assert.equal    (await CreditProxyInstance.balanceOf(user),                         99890,              "check user's proxy balance");
		assert.equal    (await CreditProxyInstance.totalSupply(),                           1000000,            "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(CreditProxyInstance.address), [ "1000000", "0" ], "check proxy's account on clerk");
	});

	it("Logs", async () => {
		console.log("total gas used:", totalgas)
	});

});
