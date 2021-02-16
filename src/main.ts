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

//time in ms
const SECONDS = 1000
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES

const MONITORING_PORT = 7001

const hostname = os.hostname()
const prodMode = false
network.setCurrent(prodMode ? "mainnet" : "testnet")
const CONTRACT_ID = prodMode ? "meta.pool.near" : "meta.pool.testnet"
const OPERATOR_ACCOUNT = "operator." + CONTRACT_ID;

const StarDateTime = new Date()
let TotalCalls = {
  beats: 0
}

class RequestResponseErrData {
  public request_id: string = "";
  public err: string = "";
  public data: any = null;
}


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
            <tr><td>Total Calls</td><td>${util.inspect(TotalCalls)}</td></tr>    
          </table>

          <table>
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
    this.ends_dtm = new Date(last_block_time + this.duration_ms * HOURS)
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

//---------------------------------------------------
//check for pending tasks in the SC and execute them
//---------------------------------------------------
async function beat() {

  TotalCalls.beats++;
  console.log("-".repeat(80))
  console.log(new Date().toString());
  console.log("BEAT " + TotalCalls.beats);

  let env_epoch_height: string = await metaPool.get_env_epoch_height();
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
        try {
          await near.call(pool.account_id, "ping", {}, OPERATOR_ACCOUNT, credentials.private_key, 200);
          //calculates rewards now in the meta for that pool
          //pub fn distribute_rewards(&mut self, sp_inx: u16) -> void 
          console.log(`meta.DISTR`)
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

//------------------------------------------------------------------
// START
//------------------------------------------------------------------
async function main() {

  // Get signing credentials
  //-----------------------
  console.log(process.cwd())
  const homedir = os.homedir()
  const CREDENTIALS_FILE = path.join(homedir, ".near-credentials/default/" + OPERATOR_ACCOUNT + ".json")
  try {
    let credentialsString = fs.readFileSync(CREDENTIALS_FILE).toString();
    credentials = JSON.parse(credentialsString)
  } catch (ex) {
    console.error(ex.message);
  }
  if (!credentials.private_key) {
    console.error("INVALID CREDENTIALS FILE. no priv.key")
  }

  //create contract proxy
  metaPool = new MetaPool(CONTRACT_ID, OPERATOR_ACCOUNT, credentials.private_key);

  // get global info
  await getGlobalInfo()

  //UTILITY MODE, rebuild stakes
  if (process.argv.includes("rebuild")) {
      await rebuild_stakes();
      process.exit(1);
  }

  //Start Web Server
  //-----------------
  //We start a barebones minimal web server to monitor meta-pool-heartbeat stats
  //When a request arrives, it will call appHandler(urlParts, request, response)
  server = new BareWebServer('public_html', appHandler, MONITORING_PORT)
  server.start()

  //start loop calling heartbeat 
  heartLoop();
}

main();

