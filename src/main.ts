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
import { ContractState, StakingPoolJSONInfo } from './contracts/meta-pool-structs.js';
import { formatLargeNumbers } from './util/format-near.js';
import { ytonFull } from './near-api/utils/json-rpc.js';

//time in ms
const SECONDS = 1000
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES

const NUM_EPOCHS_TO_UNLOCK = 4n

const MONITORING_PORT = 7000

const hostname = os.hostname()
const prodMode = false
network.setCurrent(prodMode ? "mainnet" : "testnet")
const CONTRACT_ID = prodMode ? "meta.pool.near" : "meta.pool.testnet"
const OPERATOR_ACCOUNT = "operator." + CONTRACT_ID;
const OWNER_ACCOUNT = "lucio." + network.current;

const TEN_TGAS = 10000000000000n;

const StarDateTime = new Date()
let TotalCalls = {
  beats: 0,
  stake: 0,
  unstake: 0,
  ping: 0,
  distribute_rewards: 0,
  retrieve: 0
}

class PersistentData {
  public beatCount: number = 0;
}
let globalPersistentData = new PersistentData()

//------------------------------------------
function showWho(resp: http.ServerResponse) {
  resp.write(`<div class="top-info">Network:<b>${network.current}</b> - contract: <b>${CONTRACT_ID}</b></div>`)
}

function asHM(durationHours: number) {
  return Math.trunc(durationHours) + "h " + Math.round((durationHours - Math.trunc(durationHours)) * 60) + "m"
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
    else if (urlParts.pathname === '/epoch') {
      resp.setHeader("Access-Control-Allow-Origin", "*")
      resp.end(JSON.stringify(epoch));
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
            <tr><td>Total Calls</td><td>${util.inspect(TotalCalls)}  Accum:${globalPersistentData.beatCount}</td></tr>    
          </table>

          <table>
            <tr><td>Contract State Epoch</td><td>${globalContractState.env_epoch_height}<tr><td>
            <tr><td>Prev epoch duration</td><td>${asHM(epoch.duration_ms / HOURS)}<tr><td>
            <tr><td>Epoch start height </td><td>${epoch.start_block_height}<tr><td>
            <tr><td>last_block_height</td><td>${globalLastBlock.header.height}<tr><td>
            <tr><td>Epoch blocks elapsed </td><td>${globalLastBlock.header.height - epoch.start_block_height}<tr><td>
            <tr><td>Epoch advance </td><td>${Math.round((globalLastBlock.header.height - epoch.start_block_height) / epoch.length * 100)}%<tr><td>
            
            <tr><td>Epoch started</td><td>${epoch.start_dtm.toString()} => ${asHM(hoursFromStart)} ago</td></tr>
            <tr><td>Epoch ends</td><td>${epoch.ends_dtm.toString()} => in ${asHM(hoursToEnd)}<tr><td>
          </table>

          <div class="progress">
            <div class="elapsed" style="width:${hoursFromStartPct}%">
            ${asHM(hoursFromStart)}
            </div>
            <div class="remaining" style="width:${100 - hoursFromStartPct}%">
            ${asHM(hoursToEnd)}
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

      //close </html> response page
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
let epoch: EpochInfo;
let globalContractState:ContractState;
let globalLastBlock: near.BlockInfo;
//-------------------------------------

class EpochInfo {
  public length: number;
  public duration_ms: number;
  public prev_timestamp: number;
  public start_block_height: number;
  public start_timestamp: number;
  public last_block_timestamp: number;
  public start_dtm: Date;
  public advance: number; //0-1
  public duration_till_now_ms: number;
  public ends_dtm: Date;

  constructor(prevBlock: near.BlockInfo, startBlock: near.BlockInfo, lastBlock: near.BlockInfo) {

    this.prev_timestamp = Math.round(prevBlock.header.timestamp / 1e6)
    this.start_block_height = startBlock.header.height
    this.start_timestamp = Math.round(startBlock.header.timestamp / 1e6)
    this.last_block_timestamp = Math.round(lastBlock.header.timestamp / 1e6)

    if (this.start_timestamp < new Date().getTime() - 48 * HOURS) { //genesis or hard-fork
      this.start_timestamp = new Date().getTime() - 6 * HOURS
    }
    if (this.prev_timestamp < new Date().getTime() - 48 * HOURS) { //genesis or hard-fork
      this.prev_timestamp = new Date().getTime() - 12 * HOURS
    }

    let noPrevBloc = startBlock.header.height == prevBlock.header.height;
    this.length = startBlock.header.height - prevBlock.header.height
    if (this.length == 0) { //!prevBlock, genesis or hard-fork
      this.length = 43200;
      this.duration_ms = 12 * HOURS;
      //estimated start & prev timestamps
      this.advance = Math.round(Number(((BigInt(lastBlock.header.height) - BigInt(this.start_block_height)) * BigInt(1000000)) / BigInt(this.length))) / 1000000;
      this.start_timestamp = this.last_block_timestamp - this.duration_ms * this.advance
      this.prev_timestamp = this.start_timestamp - this.duration_ms
    }
    else {
      this.duration_ms = this.start_timestamp - this.prev_timestamp
    }

    this.start_dtm = new Date(this.start_timestamp)
    this.ends_dtm = new Date(this.start_timestamp + this.duration_ms)
    this.duration_till_now_ms = this.last_block_timestamp - this.start_timestamp
    this.advance = this.update(lastBlock);

  }

  update(lastBlock: near.BlockInfo): number {
    this.last_block_timestamp = Math.round(lastBlock.header.timestamp / 1e6)
    const duration_till_now_ms = this.last_block_timestamp - this.start_timestamp
    const advance = Math.round(Number(((BigInt(lastBlock.header.height) - BigInt(this.start_block_height)) * BigInt(1000000)) / BigInt(this.length))) / 1000000;
    if (advance > 0.1) {
      this.ends_dtm = new Date(this.start_timestamp + duration_till_now_ms + duration_till_now_ms * (1 - advance))
    }
    this.duration_till_now_ms = duration_till_now_ms;
    this.advance = advance;
    return advance;
  }

  proportion(blockNum: number) {
    return (blockNum - this.start_block_height) / this.length;
  }

  block_dtm(blockNum: number): Date {
    return new Date(this.start_timestamp + this.duration_ms * this.proportion(blockNum))
  }

  hours_from_start(): number {
    return Math.round((new Date().getTime() - this.start_timestamp) / HOURS * 100) / 100;
  }

  hours_to_end(): number {
    return Math.round((this.start_timestamp + this.duration_ms - new Date().getTime()) / HOURS * 100) / 100;
  }
}

//-----------------------
//Get global info
//-----------------------
async function getGlobalInfo() {

  //genesisConfig = await near.getGenesisConfig();
  //console.log(util.inspect(genesisConfig)); //epoch_length, num_blocks_per_year
  await computeCurrentEpoch();
  globalContractState = await metaPool.get_contract_state();
}

async function computeCurrentEpoch() {

  const lastBlock = await near.latestBlock();
  const firstBlock = await near.block(lastBlock.header.next_epoch_id); //next_epoch_id looks like "current" epoch_id
  const prevBlock = await near.block(lastBlock.header.epoch_id) //epoch_id looks like "prev" epoch_id

  epoch = new EpochInfo(prevBlock, firstBlock, lastBlock);
  console.log("estimated epoch duration in hours:", epoch.duration_ms / HOURS)
  console.log("Epoch started:", epoch.start_dtm.toString(), " => ", asHM(epoch.hours_from_start()), "hs ago")
  console.log("Epoch ends:", epoch.ends_dtm.toString(), " => in ", asHM(epoch.hours_to_end()), "hs")
}

//utility
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//---------------------------------------------------
//check for pending work in the SC and turn the crank
//---------------------------------------------------
async function beat() {

  TotalCalls.beats++;
  console.log("-".repeat(80))
  console.log(new Date().toString());
  console.log(`BEAT ${TotalCalls.beats} (${globalPersistentData.beatCount})`);

  globalLastBlock = await near.latestBlock()
  epoch.update(globalLastBlock);

  console.log(`-------------------------------`)
  console.log(`last_block:${globalLastBlock.header.height}`)

  //if the epoch ended, compute the new one
  if (new Date().getTime() >= epoch.ends_dtm.getTime()) {
    //epoch ended
    console.log("COMPUTING NEW EPOCH")
    await computeCurrentEpoch();
    console.log(JSON.stringify(epoch));
  }

  //refresh contract state
  globalContractState = await metaPool.get_contract_state();

  console.log("Epoch:", globalContractState.env_epoch_height);
  console.log("delta stake:", yton(globalContractState.total_for_staking) - yton(globalContractState.total_actually_staked));
  console.log("total_actually_unstaked_and_retrieved:", yton(globalContractState.total_actually_unstaked_and_retrieved));
  console.log(JSON.stringify(globalContractState));

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
  // get all the pools
  let pools = await metaPool.get_staking_pool_list();
  //for each pool, ping and compute rewards
  for (let inx = 0; inx < pools.length; inx++) {
    const pool = pools[inx];

    if ((near.yton(pool.staked) > 0 || near.yton(pool.unstaked) > 0) && pool.last_asked_rewards_epoch_height != globalContractState.env_epoch_height) {
      //if the epoch is recently started -- ping the pools so they compute rewards and do the same in the meta-pool
      if ((epoch.hours_from_start() > 0.25 && epoch.hours_from_start() < 5.5) || debugMode) {
          //ping on the pool so it calculates rewards
        console.log(`about to call PING & DISTRIBUTE on pool[${inx}]:${JSON.stringify(pool)}`)
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
  }

  //for each pool 
  // RETRIEVE UNSTAKED FUNDS
  for (let inx = 0; inx < pools.length; inx++) {
    const pool = pools[inx];
    //only the the amount unstaked justified tx-cost, only if amount > 10Tgas
    if (BigInt(pool.unstaked) > TEN_TGAS && pool.unstaked_requested_epoch_height != "0") {
      const now = BigInt(globalContractState.env_epoch_height);
      let whenRequested = BigInt(pool.unstaked_requested_epoch_height);
      if (whenRequested>now) whenRequested = 0n; //it was bad data or there was a hard-fork
      if (now >= whenRequested+NUM_EPOCHS_TO_UNLOCK) {
        //try RETRIEVE UNSTAKED FUNDS
        console.log(`about to try RETRIEVE UNSTAKED FUNDS on pool[${inx}]:${JSON.stringify(pool)}`)
        TotalCalls.retrieve++;
        try {
          console.log("first sync_unstaked_balance")
          await metaPool.sync_unstaked_balance(inx);
          //now retrieve unstaked
          let result = await metaPool.retrieve_funds_from_a_pool(inx);
          if (result == undefined) {
            console.log(`RESULT is undefined`)
          }
          else {
            console.log(`RESULT:${yton(result)}N`)
          }
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
    console.log("ERR", ex.message)
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


function getCredentials(accountId: string) {
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

  //Start Web Server
  //-----------------
  //We start a bare-bones minimal web server to monitor meta-pool-heartbeat stats
  //When a request arrives, it will call appHandler(urlParts, request, response)
  server = new BareWebServer('../public_html', appHandler, MONITORING_PORT)
  server.start()

  globalPersistentData = loadJSON()
  if (!globalPersistentData.beatCount) globalPersistentData.beatCount = 0;

  //start loop calling heartbeat 
  heartLoop();
}

main();

