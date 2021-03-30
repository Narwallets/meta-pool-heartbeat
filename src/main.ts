import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as util from 'util';

import * as http from 'http';
import * as url from 'url';
import { BareWebServer, respond_error } from './bare-web-server.js';

import { tail } from "./util/tail.js"
import * as near from './near-api/near-rpc.js';
import * as network from './near-api/network.js';
import { yton } from './near-api/near-rpc.js';

import { MetaPool } from './contracts/meta-pool.js'
import { loadJSON, saveJSON } from './util/save-load-JSON.js';
import { SmartContract } from './contracts/base-smart-contract.js';
import { StakingPoolJSONInfo } from './contracts/meta-pool-structs.js';

//time in ms
const SECONDS = 1000
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES

const MONITORING_PORT = 7000

const hostname = os.hostname()
const prodMode = false
network.setCurrent(prodMode ? "mainnet" : "testnet")
const CONTRACT_ID = prodMode ? "meta.pool.near" : "meta.pool.testnet"
const OPERATOR_ACCOUNT = "operator." + CONTRACT_ID;
const OWNER_ACCOUNT = "lucio." + network.current;

const StarDateTime = new Date()
let TotalCalls = {
  beats: 0,
  stake:0,
  unstake:0,
  ping:0,
  distribute_rewards:0,
  retrieve:0
}

class PersistentData {
  public beatCount: number = 0;
}
let globalPersistentData = new PersistentData()

//------------------------------------------
function showWho(resp: http.ServerResponse) {
  resp.write(`<div class="top-info">Network:<b>${network.current}</b> - contract: <b>${CONTRACT_ID}</b></div>`)
}

//------------------------------------------
//Main HTTP-Request Handler - stats server
//------------------------------------------
export function appHandler(server: BareWebServer, urlParts: url.UrlWithParsedQuery, req: http.IncomingMessage, resp: http.ServerResponse) {

  resp.on("error", (err) => { console.error(err) })

  //urlParts: the result of nodejs [url.parse] (http://nodejs.org/docs/latest/api/url.html)
  //urlParts.query: the result of nodejs [querystring.parse] (http://nodejs.org/api/querystring.html)

  try {
    if (urlParts.pathname === '/favicon.ico') {
      respond_error(404, "", resp)
    }
    else if (urlParts.pathname === '/index.css') {
      server.writeFileContents('index.css', resp);
    }
    else if (urlParts.pathname === '/ping') {
      resp.end("pong");
    }
    else if (urlParts.pathname === '/shutdown') {
      resp.end("shutdown");
      process.exit(1);
    }
    else {
      //--------------
      //HTML RESPONSE
      //--------------

      //base header
      server.writeFileContents('index1-head.html', resp, { hostname: hostname });

      //config info
      showWho(resp)

      //base center
      server.writeFileContents('index2-center.html', resp);

      //GET / (root) adds stats
      if (urlParts.pathname === '/') { //stats

        const hoursFromStart = epoch.hours_from_start()
        const hoursToEnd = epoch.hours_to_end()
        const hoursFromStartPct = hoursFromStart / (epoch.duration_ms / HOURS) * 100;
        resp.write(`
          <table>
            <tr><td>Server Started</td><td>${StarDateTime.toString()}</td></tr>    
            <tr><td>Total Calls</td><td>${util.inspect(TotalCalls)}  Acum:${globalPersistentData.beatCount}</td></tr>    
          </table>

          <table>
            <tr><td>env::epoch_height</td><td>${env_epoch_height}<tr><td>
            <tr><td>Epoch start height </td><td>${epoch.start_height}<tr><td>
            <tr><td>last_block_height seen</td><td>${near.lastBlockHeightSeen()}<tr><td>
            <tr><td>Epoch blocks elapsed </td><td>${near.lastBlockHeightSeen() - epoch.start_height}<tr><td>
            <tr><td>Epoch advance </td><td>${Math.round((near.lastBlockHeightSeen() - epoch.start_height)/epoch.length*100)}%<tr><td>
            
            <tr><td>Epoch started</td><td>${epoch.init_dtm.toString()} => ${hoursFromStart}hs ago</td></tr>
            <tr><td>Epoch ends</td><td>${epoch.ends_dtm.toString()} => in ${hoursToEnd}hs<tr><td>
          </table>

          <div class="progress">
            <div class="elapsed" style="width:${hoursFromStartPct}%">
            ${hoursFromStart}hs
            </div>
            <div class="remaining" style="width:${100 - hoursFromStartPct}%">
            ${hoursToEnd}hs
            </div>
          </div>
          `);
      }

      //GET /log show process log
      else if (urlParts.pathname === '/log') {
        resp.write("<pre>");
        resp.write(tail("main.log"));
        resp.write("</pre>");
        server.writeFileContents('index3-footer.html', resp);
      }
      else {
        // GET /yyy
        resp.write(`<p>invalid path ${urlParts.pathname}</p>`);
      }

      //close </html> reposnse page
      server.writeFileContents('index3-footer.html', resp);
    }

    resp.end();

  }

  catch (ex) {
    try {
      respond_error(505, ex.message, resp)
    }
    catch { }
    console.log(ex)
  }

  return true;
};


//--------------
// GLOBAL VARS
//--------------
let debugMode = process.argv.includes("test");

let credentials = { account_id: "", private_key: "" };

let server: BareWebServer;

let metaPool: MetaPool;

let env_epoch_height: string="";

let validators: any;
let chainStatus: any;
let genesisConfig: any;
let epoch: EpochInfo;

class EpochInfo {
  public epochs_per_day: number;
  public duration_ms: number;
  public init_dtm: Date;
  public ends_dtm: Date;
  //public data:Record<string,any>; //to store epoch-related data
  constructor(
    public length: number,
    public blocks_per_year: number,
    public start_height: number,
    latest_block_height: number,
    last_block_dtm: Date) {
    this.epochs_per_day = blocks_per_year / length / 365;
    this.duration_ms = 24 * HOURS / this.epochs_per_day;
    const elapsed_proportion = this.proportion(latest_block_height);
    const elapsed_ms = this.duration_ms * elapsed_proportion;
    const last_block_time = last_block_dtm.getTime();
    this.init_dtm = new Date(last_block_time - elapsed_ms)
    this.ends_dtm = new Date(last_block_time - elapsed_ms + this.duration_ms)
  }

  proportion(blockNum: number) {
    return (blockNum - this.start_height) / this.length;
  }

  block_dtm(blockNum: number): Date {
    return new Date(this.init_dtm.getTime() + this.duration_ms * this.proportion(blockNum))
  }

  hours_to_block(blockNum: number): number {
    return Math.round((this.block_dtm(blockNum).getTime() - this.init_dtm.getTime()) / HOURS * 10) / 10;
  }

  hours_from_start(): number {
    return Math.round((new Date().getTime() - this.init_dtm.getTime()) / HOURS * 10) / 10;
  }

  hours_to_end(): number {
    return Math.round((this.init_dtm.getTime() + this.duration_ms - new Date().getTime()) / HOURS * 10) / 10;
  }
}

//-----------------------
//Get global chain info
//-----------------------
async function getGlobalInfo() {

  genesisConfig = await near.getGenesisConfig();
  //console.log(util.inspect(genesisConfig)); //epoch_length, num_blocks_per_year

  await computeCurrentEpoch();
}

async function computeCurrentEpoch() {

  validators = await near.getValidators();
  //console.log(util.inspect(validators));

  chainStatus = await near.getStatus();
  // .sync_info.latest_block_height: 36635572,
  // .sync_info.latest_state_root: 'EJxjn91jSiLRrZx5etR7ePGvDuhEWXxLJQhLmGgdi3zA',
  // .sync_info.latest_block_time: '2021-02-15T23:25:52.892650145Z',
  //console.log(util.inspect(status));

  console.log("validators.epoch_start_height", validators.epoch_start_height)
  //console.log("genesisConfig.epoch_length",genesisConfig.epoch_length)
  //console.log("genesisConfig.num_blocks_per_year",genesisConfig.num_blocks_per_year)
  epoch = new EpochInfo(
    genesisConfig.epoch_length,
    genesisConfig.num_blocks_per_year,
    validators.epoch_start_height,
    chainStatus.sync_info.latest_block_height,
    new Date(chainStatus.sync_info.latest_block_time)
  );
  console.log("estimated epoch duration in hours:", epoch.duration_ms / HOURS)
  console.log("Epoch started:", epoch.init_dtm.toString(), " => ", epoch.hours_from_start(), "hs ago")
  console.log("Epoch ends:", epoch.ends_dtm.toString(), " => in ", epoch.hours_to_end(), "hs")

}

//utility
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function epoch_difference(epochA: string, epochB: string): number {
  //string massage u64 to subtract within 1e15 js number precision
  epochA = epochA.padStart(20, "0")
  epochB = epochB.padStart(20, "0")
  let i = 0;
  for (; i < 20 && epochA[i] != epochB[i]; i++);
  if (i <= 5) return 1e15; //overflow
  return Number(epochA.slice(i)) - Number(epochB.slice(i))
}

//
// UTILITY: rebuild_stakes after contract data deletion
//
async function rebuild_stakes() {
  //rebuild_stake_from_pool_information
  let pools = await metaPool.get_staking_pool_list();
  for (let inx = 0; inx < pools.length; inx++) {
    const pool = pools[inx];
    console.log(`about to REBUILD STAKE INFO on pool[${inx}]:${JSON.stringify(pool)}`)
    try {
      await metaPool.call("rebuild_stake_from_pool_information", { sp_inx: inx });
      //distribute_rewards es -> void
    }
    catch (ex) {
      console.error(ex);
    }
  }
}

// ---------------
// UTILITY: list validators
// compose a list of sane validators and some points to compute percentages
// ---------------
type PoolInfo = {
  name: string;
  slashed: boolean;
  stake_millions: number,
  stake: bigint,
  uptime: number,
  fee: number,
  ourStake?: bigint,
  currentPct?:number;
  points:number;
  bp?:number;
}

//sort validators
function sortCompare(a:PoolInfo, b:PoolInfo) {
  if (a.stake > b.stake) return -1;
  return 1;
}
// ---------------
async function list_validators(updateList:boolean) {

  //make initial pool-list based on current_validators
  const MILLION=BigInt(10**6)

  let sumStakes = BigInt(0);

  const initialList:PoolInfo[] = []
  for (let item of validators.current_validators) {

    const uptime = Math.round(item.num_produced_blocks / item.num_expected_blocks * 100)
    const stake = BigInt(item.stake)

    //only include uptime>95 && stake>2 MILLION
    if (uptime>95 && stake > 2n*MILLION ) {

      sumStakes+=stake;

      initialList.push({
          name: item.account_id,
          slashed: item.is_slashed,
          stake_millions: Math.round(yton(item.stake))/1e6,
          stake: stake,
          uptime: uptime,
          fee:10,
          points:0
      })
    }

  }

  initialList.sort(sortCompare);

  let stakingPool = new SmartContract("", OPERATOR_ACCOUNT, credentials.private_key)

  const newList:PoolInfo[] = []
  //query fees to refine the list more
  for (let item of initialList) {
    stakingPool.contract_account = item.name;
    try {
      const rewardFeeFraction = await stakingPool.view("get_reward_fee_fraction")
      item.fee = rewardFeeFraction.numerator * 100 / rewardFeeFraction.denominator;
    }
    catch(ex){
      //Validator is not a staking-pool contract
      console.log(item.name + " did not respond to get_reward_fee_fraction")
      continue;
    }
    
    try {
      const ourStake = await stakingPool.view("get_account_total_balance",{account_id:CONTRACT_ID})
      item.ourStake= BigInt(ourStake )
    }
    catch(ex){
      //Validator is not a staking-pool contract
      console.log(item.name + " did not respond to get_account_total_balance")
      continue;
    }

    const MAX_FEE=10
    if (item.fee>MAX_FEE){
      console.log(`${item.name} has a fee>${MAX_FEE}, ${item.fee}`)
      continue;
    }

    newList.push(item);

  }

  //compute % based on our stake
  const contractState = await metaPool.get_contract_state();
  const totalStake = BigInt(contractState.total_actually_staked);

  //use fee & order (stake) to determine points
  let order=0;
  let totalPoints = 0 
  for (let item of newList) {
    item.points = 1000-Number(item.stake*1000n/sumStakes) + 1000-(item.fee*100)
    totalPoints+=item.points ;
    if (item.ourStake) item.currentPct = Math.round(Number(item.ourStake/totalStake*10000n))/100;
    order++;
  }

  //use points to determine pct
  let sumbp=0;
  for (let item of newList) {
    item.bp = Math.round(item.points/totalPoints*10000);
    sumbp+=item.bp
  }
  //mak the sum 100%
  let lastItem = newList[newList.length-1]
  lastItem.bp = 10000-(sumbp-(lastItem.bp||0));

  console.log(newList);

  //check sum
  sumbp=0;
  for (let item of newList) {
    sumbp += item.bp||0
  }
  if(sumbp!=10000) throw Error("sum!=100%");

  //end list construction

  if (updateList) {

      //UPDATE contract list
      console.log("-------------------")
      console.log("-- UPDATING LIST --")
      console.log("-------------------")

      getCredentials(OWNER_ACCOUNT);
      metaPool.signer = credentials.account_id;
      metaPool.signer_private_key = credentials.private_key;

      const actual:Array<StakingPoolJSONInfo> = await metaPool.get_staking_pool_list();
      for( let listed of newList){
        if (listed.bp==undefined) continue;

        const foundSp = actual.find(e => e.account_id==listed.name);
        if (!foundSp ) { //new one
          console.log(`[new] ${listed.name}, ${listed.bp/100}%`)
          await metaPool.set_staking_pool(listed.name,listed.bp)
        }
        else { //found
          if (foundSp.weight_basis_points!=listed.bp) {
            //update
            console.log(`[${foundSp.inx}] change BP, ${foundSp.account_id}  ${foundSp.weight_basis_points/100}% -> ${listed.bp/100}%`)
            await metaPool.set_staking_pool_weight(foundSp.inx,listed.bp);
          }
          else {
            console.log(`[${foundSp.inx}] no change ${foundSp.account_id}  ${foundSp.weight_basis_points/100}%`)
          }
        }
      }

      //set bp=0 for the ones no longer validating or on the list
      for(let sp of actual){
        const foundListed = newList.find(e => e.name == sp.account_id);
        if (!foundListed){
            //not listed
            console.log(`[${sp.inx}] not-listed so BP->0, ${sp.account_id}  ${sp.weight_basis_points/100}% -> 0%`)
            await metaPool.set_staking_pool_weight(sp.inx,0);
        }
      }


  }

  //check sum of bp
  const checkbp = await metaPool.sum_staking_pool_list_weight_basis_points()
  console.log(`sum bp = ${checkbp}`)
  if(checkbp!=10000) throw Error("sum bp expected to be 10000, but it is "+checkbp)


}
// ---------------
// END UTILITY: list validators
// ---------------


//---------------------------------------------------
//check for pending tasks in the SC and execute them
//---------------------------------------------------
async function beat() {

  TotalCalls.beats++;
  console.log("-".repeat(80))
  console.log(new Date().toString());
  console.log(`BEAT ${TotalCalls.beats} (${globalPersistentData.beatCount})`);

  env_epoch_height = await metaPool.get_env_epoch_height();
  console.log(`-------------------------------`)
  console.log(`env_epoch_height:${env_epoch_height}`)

  //if the epoch eneded, compute the new one
  if (new Date().getTime() >= epoch.ends_dtm.getTime()) {
    //epoch ended
    console.log("COMPUTING NEW EPOCH")
    await computeCurrentEpoch();
    console.log(JSON.stringify(epoch));
  }

  const contract_state = await metaPool.get_contract_state();
  console.log(JSON.stringify(contract_state))

  // STAKE or UNSTAKE
  //if the epoch is ending, stake-unstake
  if (epoch.hours_to_end() < 0.5 || debugMode) {
    //epoch about to end
    //loop staking
    for (let i = 0; i < 50; i++) {
      console.log("CALL distribute_staking")
      TotalCalls.stake++;
      try {
        let result = await metaPool.call("distribute_staking", {});
        console.log("more Staking to do? ", result);
        if (result != true) break;
      }
      catch (ex) {
        console.error(ex);
      }
      await sleep(5 * SECONDS)
    }
    //loop unstaking 
    for (let i = 0; i < 50; i++) {
      console.log("CALL distribute_unstaking")
      TotalCalls.unstake++;
      try {
        let result = await metaPool.call("distribute_unstaking", {});
        console.log("more Unstaking to do? ", result);
        if (result != true) break;
      }
      catch (ex) {
        console.error(ex);
      }
      await sleep(5 * SECONDS)
    }
  }


  // COMPUTE REWARDS
  //if the epoch is recently started -- ping the pools so they compute rewards and do the same in the meta-pool
  if ((epoch.hours_from_start() > 0.5 && epoch.hours_from_start() < 1.5) || debugMode) {
    let pools = await metaPool.get_staking_pool_list();
    for (let inx = 0; inx < pools.length; inx++) {
      const pool = pools[inx];
      if ((near.yton(pool.staked) > 0 || near.yton(pool.unstaked) > 0) && pool.last_asked_rewards_epoch_height != env_epoch_height) {
        //ping on the pool so it calculates rewards
        console.log(`about to call PING & DISTRIB on pool[${inx}]:${JSON.stringify(pool)}`)
        console.log(`pool.PING`)
        TotalCalls.ping++;
        try {
          await near.call(pool.account_id, "ping", {}, OPERATOR_ACCOUNT, credentials.private_key, 200);
          //calculates rewards now in the meta for that pool
          //pub fn distribute_rewards(&mut self, sp_inx: u16) -> void 
          console.log(`meta.DISTR`)
          TotalCalls.distribute_rewards++;
          await metaPool.call("distribute_rewards", { sp_inx: inx });
          //distribute_rewards es -> void
        }
        catch (ex) {
          console.error(ex);
        }
        await sleep(5 * SECONDS)
      }
    }

    // RETRIEVE UNSTK FUNDS
    for (let inx = 0; inx < pools.length; inx++) {
      const pool = pools[inx];
      if (near.yton(pool.unstaked) > 0 && pool.unstaked_requested_epoch_height != "0" && epoch_difference(env_epoch_height, pool.unstaked_requested_epoch_height) >= 0) {
        //ping on the pool so it calculates rewards
        console.log(`about to call RETRIEVE UNSTK FUNDS on pool[${inx}]:${JSON.stringify(pool)}`)
        TotalCalls.retrieve++;
        try {
          let result = await metaPool.call("retrieve_funds_from_a_pool", { inx: inx });
          console.log(`RESULT:${yton(result)}N`)
        }
        catch (ex) {
          console.error(ex);
        }
        await sleep(5 * SECONDS)
      }
    }
  }

  globalPersistentData.beatCount++;
  saveJSON(globalPersistentData);

}

//-----------------------
// heartLoop
// Loops checking for pending work
//-----------------------
const INTERVAL = 5 * MINUTES
let loopsExecuted = 0;

async function heartLoop() {

  try {
    await beat();
  }
  catch (ex) {
    console.error("ERR", ex.message)
  }

  loopsExecuted++;
  if (loopsExecuted * INTERVAL >= 4 * HOURS) {
    //4 hs loops cycle finished- gracefully end process, pm2 will restart it
    server.close()
    return;
  }
  else {
    //check again in 30 min
    setTimeout(heartLoop, INTERVAL)
  }

}


function getCredentials(accountId:string){
  const homedir = os.homedir()
  const CREDENTIALS_FILE = path.join(homedir, ".near-credentials/default/" + accountId + ".json")
  try {
    let credentialsString = fs.readFileSync(CREDENTIALS_FILE).toString();
    credentials = JSON.parse(credentialsString)
  } catch (ex) {
    console.error(ex.message);
  }
  if (!credentials.private_key) {
    console.error("INVALID CREDENTIALS FILE. no priv.key")
  }
}

//------------------------------------------------------------------
// START
//------------------------------------------------------------------
async function main() {

  // Get signing credentials
  //-----------------------
  console.log(process.cwd())

  getCredentials(OPERATOR_ACCOUNT);

  //create contract proxy
  metaPool = new MetaPool(CONTRACT_ID, OPERATOR_ACCOUNT, credentials.private_key);

  // get global info
  await getGlobalInfo()

  //validate arguments
  for (const arg of process.argv){
    if (arg.endsWith("/node")) continue;
    if (arg.endsWith("/main")) continue;
    if (!["rebuild","list","update"].includes(arg)) throw Error("invalid argument: "+arg)
  }

  //UTILITY MODE, rebuild stakes
  if (process.argv.includes("rebuild")) {
      await rebuild_stakes();
      process.exit(1);
  }
  //UTILITY MODE, list
  if (process.argv.includes("list")) {
    await list_validators( process.argv.includes("update") );
    process.exit(1);
  }

  //Start Web Server
  //-----------------
  //We start a barebones minimal web server to monitor meta-pool-heartbeat stats
  //When a request arrives, it will call appHandler(urlParts, request, response)
  server = new BareWebServer('../public_html', appHandler, MONITORING_PORT)
  server.start()

  globalPersistentData = loadJSON()
  if (!globalPersistentData.beatCount) globalPersistentData.beatCount=0;

  //start loop calling heartbeat 
  heartLoop();
}

main();

