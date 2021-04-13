import * as fs from 'fs';
import * as http from 'http';
import { ContractState, StakingPoolJSONInfo } from './contracts/meta-pool-structs.js';

type AdditionalStateInfo = {
    staked_in_pools: string;
    unstaked_in_pools: string;
    total_in_pools: string;
    to_stake_delta: string;
}

type ExtraStateInfo = ContractState & AdditionalStateInfo;

export function saveStateLog(contractBasicState: ContractState, pools: Array<StakingPoolJSONInfo>) {

  let sumStaked=0n;
  let sumUnstaked=0n;

  for (let inx = 0; inx < pools.length; inx++) {
    const pool = pools[inx];
    //only the the amount unstaked justified tx-cost, only if amount > 10Tgas
    sumStaked+=BigInt(pool.staked);
    sumUnstaked+=BigInt(pool.unstaked);
  }
  let additional:AdditionalStateInfo = {
    staked_in_pools: sumStaked.toString(),
    unstaked_in_pools: sumUnstaked.toString(),
    total_in_pools: (sumStaked+sumUnstaked).toString(),
    to_stake_delta: (BigInt(contractBasicState.total_for_staking) - BigInt(contractBasicState.total_actually_staked)).toString()
  }

  let extraStateInfo:ExtraStateInfo = Object.assign(contractBasicState,additional);

  fs.appendFile('state.log', "--SAMP " + JSON.stringify(extraStateInfo) + '\n', function (err) {
    if (err)
      console.error("ERR appending to state.log: " + err.message);
  });
}

//-------
export function jsonParseQuoteBigInt(s:string){
    //const quoteNumbers = s.replace(/([^"^[0-9])(-{0,1}[0-9]{1,90})([^"^[0-9]])/g, '$1"$2"$3');
    const quoteNumbers = s.replace(/([^"^\d])(-?\d{1,90})([^"^\d])/g, '$1"$2"$3');
    return JSON.parse(quoteNumbers);
  }
  
export function yton(yoctos?:string):string {
    if (yoctos==undefined||yoctos==null||yoctos==""||yoctos=="0") return "";
    yoctos=BigInt(yoctos).toString()
    if (yoctos.length < 25) yoctos = yoctos.padStart(25, '0')
    return addCommas( yoctos.slice(0, -24) + "." + yoctos.slice(-24,-20) )
  }
  
export function addCommas(str:string) {
    let pre;
    if (str.startsWith("-")) {
      str=str.slice(1);
      pre="-";
    }
    else {
      pre="";
    }
    let n = str.indexOf(".") - 4
    while (n >= 0) {
        str = str.slice(0, n + 1) + "," + str.slice(n + 1)
        n = n - 3
    }
    return pre+str;
  }
  
  
export type State = {
    env_epoch_height:string;
    contract_account_balance:string;
    reserve_for_withdraw: string;
    total_available: string;
    epoch_stake_orders: string;
    epoch_unstake_orders: string;
    total_for_staking: string;
    total_actually_staked: string;
    to_stake_delta: string;
    total_unstaked_and_waiting: string;
    unstake_claims: string;
    unstake_claims_available_sum: string;
    staked_in_pools: string;
    unstaked_in_pools: string;
    total_in_pools: string;
  }
  
//-----
export function parseState(serdeJsonString:string):State{
  return jsonParseQuoteBigInt(serdeJsonString) as State;
}

export function writeStateHTMLRow(step:number, code:string, data:State, resp:http.ServerResponse){
    resp.write(`
    <tr class="${code.trim()}">
    <td>${data.env_epoch_height||""}</td>
    <td>${step++}</td>
    <td></td>
    <td>${code}</td>
    <td></td>
  
    <td>${yton(data.contract_account_balance)}</td>
    <td>${yton(data.reserve_for_withdraw)}</td>
    <td>${yton(data.total_available)}</td>
  
    <td>${yton(data.epoch_stake_orders)}</td>
    <td>${yton(data.epoch_unstake_orders)}</td>
  
    <td>${yton(data.total_for_staking)}</td>
    <td>${yton(data.total_actually_staked)}</td>
    
    <td>${yton(data.to_stake_delta)}</td>
  
    <td>${yton(data.total_unstaked_and_waiting)}</td>
    <td>${yton(data.unstake_claims)}</td>	
    <td>${yton(data.unstake_claims_available_sum)}</td>	
    
    <td>${yton(data.staked_in_pools)}</td>	
    <td>${yton(data.unstaked_in_pools)}</td>	
    <td>${yton(data.total_in_pools)}</td>
  
    <tr>
    `)
  
  }
  