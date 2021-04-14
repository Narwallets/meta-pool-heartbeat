import * as fs from 'fs';
import * as http from 'http';
import { ContractState, StakingPoolJSONInfo } from './contracts/meta-pool-structs.js';

import {State} from './metapool-state.js'
import type {ComposedState} from './metapool-state.js'

export function saveStateLog(composedState:ComposedState) {
    fs.appendFile('state.log', "--SAMP " + JSON.stringify(composedState) + '\n', function (err) {
    if (err)
      console.error("ERR appending to state.log: " + err.message);
  });
}

//-------
  
export function yton(yoctos:string|bigint):string {
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
  
  
export function writeStateHTMLRow(step:number, code:string, data:State, resp:http.ServerResponse){
    resp.write(`
    <tr class="${code.trim()}">
    <td>${data.env_epoch_height||""}</td>
    <td>${step++}</td>
    <td></td>
    <td>${code}</td>
    <td></td>
  
    <td>${yton(data.contract_account_balance)}</td>
    <td>${yton(data.reserve_for_unstake_claims)}</td>
    <td>${yton(data.total_available)}</td>
  
    <td>${yton(data.epoch_stake_orders)}</td>
    <td>${yton(data.epoch_unstake_orders)}</td>
  
    <td>${yton(data.total_for_staking)}</td>
    <td>${yton(data.total_actually_staked)}</td>
    
    <td>${yton(data.to_stake_delta)}</td>
  
    <td>${yton(data.total_unstaked_and_waiting)}</td>
    <td>${yton(data.total_unstake_claims)}</td>	
    <td>${yton(data.reserve_for_unstake_claims)}</td>	
    
    <td>${yton(data.staked_in_pools)}</td>	
    <td>${yton(data.unstaked_in_pools)}</td>	
    <td>${yton(data.total_in_pools)}</td>
  
    <tr>
    `)
  
  }
  