var RLC                  = artifacts.require("../node_modules/rlc-faucet-contract/contracts/RLC.sol");
var IexecHub             = artifacts.require("../node_modules/iexec-poco/contracts/IexecHub.sol");
var IexecClerk           = artifacts.require("../node_modules/iexec-poco/contracts/IexecClerk.sol");
var AppRegistry          = artifacts.require("../node_modules/iexec-poco/contracts/AppRegistry.sol");
var DatasetRegistry      = artifacts.require("../node_modules/iexec-poco/contracts/DatasetRegistry.sol");
var WorkerpoolRegistry   = artifacts.require("../node_modules/iexec-poco/contracts/WorkerpoolRegistry.sol");
var App                  = artifacts.require("../node_modules/iexec-poco/contracts/App.sol");
var Dataset              = artifacts.require("../node_modules/iexec-poco/contracts/Dataset.sol");
var Workerpool           = artifacts.require("../node_modules/iexec-poco/contracts/Workerpool.sol");
var IexecRequesterProxy  = artifacts.require("./IexecRequesterProxy.sol");

const { shouldFail } = require('openzeppelin-test-helpers');
const   multiaddr    = require('multiaddr');
const   constants    = require('../../utils/constants');
const   odbtools     = require('../../utils/odb-tools');
const   wallets      = require('../../utils/wallets');

function extractEvents(txMined, address, name)
{
	return txMined.logs.filter((ev) => { return ev.address == address && ev.event == name });
}

contract('IexecRequesterProxy - Transfer Admin', async (accounts) => {

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

	let RLCInstance                 = null;
	let IexecHubInstance            = null;
	let IexecClerkInstance          = null;
	let IexecRequesterProxyInstance = null;

	let rlc_deposit = web3.utils.toBN(1000000);

	/***************************************************************************
	 *                        Environment configuration                        *
	 ***************************************************************************/
	before("configure", async () => {
		console.log("# web3 version:", web3.version);

		RLCInstance        = await RLC.deployed();
		IexecHubInstance   = await IexecHub.deployed();
		IexecClerkInstance = await IexecClerk.deployed();

		RLCInstance.transfer(user, 1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED })
	});

	beforeEach("configure", async () => {
		IexecRequesterProxyInstance = await IexecRequesterProxy.new(IexecHubInstance.address);

		await RLCInstance.approve(IexecRequesterProxyInstance.address, 2*rlc_deposit, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED });
		await IexecRequesterProxyInstance.depositFor(rlc_deposit, iexecAdmin, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED });
		await IexecRequesterProxyInstance.depositFor(rlc_deposit, user,       { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED });
	});

	it("Proxy Transfer Admin - success admin → user (by admin)", async () => {
		let rlc_before = await RLCInstance.balanceOf(iexecAdmin);
		let rlc_move   = rlc_deposit.div(web3.utils.toBN(10));
		let _2         = web3.utils.toBN(2);

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");

		await IexecRequesterProxyInstance.transferAdmin(iexecAdmin, user, rlc_move, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED });

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.sub(rlc_move).toString(),    "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.add(rlc_move).toString(),    "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");
	});

	it("Proxy Transfer Admin - success user → admin (by admin)", async () => {
		let rlc_before = await RLCInstance.balanceOf(iexecAdmin);
		let rlc_move   = rlc_deposit.div(web3.utils.toBN(10));
		let _2         = web3.utils.toBN(2);

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");

		await IexecRequesterProxyInstance.transferAdmin(user, iexecAdmin, rlc_move, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED });

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.add(rlc_move).toString(),    "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.sub(rlc_move).toString(),    "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");
	});

	it("Proxy Transfer Admin - failure (to address 0)", async () => {
		let rlc_before = await RLCInstance.balanceOf(iexecAdmin);
		let rlc_move   = rlc_deposit.div(web3.utils.toBN(10));
		let _2         = web3.utils.toBN(2);

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");

		await shouldFail.reverting(IexecRequesterProxyInstance.transferAdmin(iexecAdmin, "0x0000000000000000000000000000000000000000", rlc_move, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }));

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");
	});

	it("Proxy Transfer Admin - failure (too much)", async () => {
		let rlc_before = await RLCInstance.balanceOf(iexecAdmin);
		let rlc_move   = rlc_deposit.mul(web3.utils.toBN(10)); // too much
		let _2         = web3.utils.toBN(2);

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");

		await shouldFail.reverting(IexecRequesterProxyInstance.transferFrom(iexecAdmin, user, rlc_move, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }));

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");
	});

	it("Proxy Transfer Admin - failure (no mint)", async () => {
		let rlc_before = await RLCInstance.balanceOf(iexecAdmin);
		let rlc_move   = rlc_deposit.div(web3.utils.toBN(1));
		let _2         = web3.utils.toBN(2);

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");

		await shouldFail.reverting(IexecRequesterProxyInstance.transferFrom("0x0000000000000000000000000000000000000000", iexecAdmin, rlc_move, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }));

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");
	});

	it("Proxy Transfer Admin - failure (restricted)", async () => {
		let rlc_before = await RLCInstance.balanceOf(iexecAdmin);
		let rlc_move   = rlc_deposit.div(web3.utils.toBN(1));
		let _2         = web3.utils.toBN(2);

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");

		await shouldFail.reverting(IexecRequesterProxyInstance.transferFrom(iexecAdmin, user, rlc_move, { from: user, gas: constants.AMOUNT_GAS_PROVIDED }));

		assert.equal    (await RLCInstance.balanceOf(iexecAdmin),                                   rlc_before.toString(),                   "check admin's RLC balance");
		assert.equal    (await RLCInstance.balanceOf(IexecRequesterProxyInstance.address),          0,                                       "check proxy's RLC balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(user),                         rlc_deposit.toString(),                  "check user's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.balanceOf(iexecAdmin),                   rlc_deposit.toString(),                  "check admin's proxy balance");
		assert.equal    (await IexecRequesterProxyInstance.totalSupply(),                           rlc_deposit.mul(_2).toString(),          "check proxy total supply");
		assert.deepEqual(await IexecClerkInstance.viewAccount(IexecRequesterProxyInstance.address), [ rlc_deposit.mul(_2).toString(), "0" ], "check proxy's account on clerk");
	});

});
