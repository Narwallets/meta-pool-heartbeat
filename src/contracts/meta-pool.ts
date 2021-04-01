import * as near from '../near-api/near-rpc.js';
import {ntoy} from '../near-api/near-rpc.js';
import { SmartContract } from './base-smart-contract.js';

import type {ContractState,StakingPoolJSONInfo,VLoanInfo,GetAccountInfoResult, LiquidUnstakeResult, RemoveLiquidityResult} from "./meta-pool-structs.js"
import type {ContractInfo} from "./NEP129.js"

function checkInteger(n:number){
    if (n<0||n>10000||n!=Math.trunc(n)) throw Error("invalid integer: "+n)
}

type U128String = string;
export class MetaPool extends SmartContract {

    async get_env_epoch_height():Promise<string>{ //U64String
        return this.view("get_env_epoch_height");
    }

    //----------------------------
    //staking pool list management
    async get_staking_pool_list() :Promise<Array<StakingPoolJSONInfo>>{
        return this.view("get_staking_pool_list");
    }
    async set_staking_pool_weight(inx:number, weight_basis_points:number):Promise<void>{
        checkInteger(inx);
        checkInteger(weight_basis_points);
        return this.call("set_staking_pool_weight",{inx:inx, weight_basis_points:weight_basis_points});
    }
    async set_staking_pool(account_id:string, weight_basis_points:number):Promise<void>{
        checkInteger(weight_basis_points);
        return this.call("set_staking_pool",{account_id:account_id, weight_basis_points:weight_basis_points});
    }
    async sum_staking_pool_list_weight_basis_points():Promise<number>{
        return this.view("sum_staking_pool_list_weight_basis_points",{});
    }
    //----------------------------
          
    /// returns JSON string according to [NEP-129](https://github.com/nearprotocol/NEPs/pull/129)
    get_contract_info() : Promise<ContractInfo> {
        return this.view("get_contract_info")
    }

    get_contract_state() : Promise<ContractState> {
        return this.view("get_contract_state")
    }

    //get account info from current connected user account
    get_account_info(accountId:string) : Promise<GetAccountInfoResult> {
        return this.view("get_account_info",{account_id:accountId }) 
    }

    deposit(nearsToDeposit:number) : Promise<void> {
        return this.call("deposit", {}, 25, ntoy(nearsToDeposit))
    }
    withdraw(nearsToWithdraw:number) : Promise<void> {
        return this.call("withdraw", {amount:ntoy(nearsToWithdraw)})
    }

    deposit_and_stake(nearsToDeposit:number) : Promise<void> {
        return this.call("deposit_and_stake", {}, 50, ntoy(nearsToDeposit))
    }

    stake(amount:number) : Promise<void> {
        return this.call("stake", {"amount":ntoy(amount)})
    }

    unstake(amount:number) : Promise<void> {
        return this.call("unstake", {"amount":ntoy(amount)})
    }

    unstake_all() : Promise<void> {
        return this.call("unstake_all",{})
    }

    //return withdrew amount
    finish_unstake() : Promise<string> {
        return this.call("finnish_unstake",{})
    }

    //buy stnear/stake
    buy_stnear_stake(amount:number) : Promise<void> {
        return this.call("buy_stnear_stake", {"amount":ntoy(amount)})
    }

    //return potential NEARs to receive
    get_near_amount_sell_stnear(stnearToSell:number) : Promise<U128String> {
        return this.view("get_near_amount_sell_stnear", {"stnear_to_sell":ntoy(stnearToSell)})
    }

    //sell stnear & return NEARs received
    liquid_unstake(stnearToBurn:number, minExpectedNear:number) : Promise<LiquidUnstakeResult> {
        return this.call("liquid_unstake", {"stnear_to_burn":ntoy(stnearToBurn), "min_expected_near":ntoy(minExpectedNear)}, 75,"1")
    }

    //current fee for liquidity providers
    nslp_get_discount_basis_points(stnearToSell:number) : Promise<number> {
        return this.view("nslp_get_discount_basis_points", {"stnear_to_sell":ntoy(stnearToSell)})
    }
    
    //add liquidity
    nslp_add_liquidity(amount:number) : Promise<number> {
        return this.call("nslp_add_liquidity", {}, 75, ntoy(amount))
    }

    //remove liquidity
    nslp_remove_liquidity(amount:number) : Promise<RemoveLiquidityResult> {
        return this.call("nslp_remove_liquidity", {"amount":ntoy(amount)}, 100)
    }

    //--------------
    //VLOAN REQUESTS
    //--------------
    get_vloan_request(account_id:string): Promise<VLoanInfo> {
        return this.view("get_vloan_request",{account_id:account_id})
    }

    set_vloan_request(amount_requested:number, staking_pool_account_id:string, 
                committed_fee:number, committed_fee_duration:number, 
                information_url: String): Promise<void> 
        {
        return this.call("set_vloan_request",{
            amount_requested:ntoy(amount_requested), 
            staking_pool_account_id:staking_pool_account_id,
            committed_fee:committed_fee*100,  //send in basis points
            committed_fee_duration:committed_fee_duration, 
            information_url: information_url });
    }

    vloan_activate(feeNears:number): Promise<void> {
        return this.call("vloan_activate",{}, 25,ntoy(feeNears))
    }
    vloan_convert_back_to_draft(): Promise<void> {
        return this.call("vloan_convert_back_to_draft",{})
    }
    vloan_take(): Promise<void> {
        return this.call("vloan_take",{})
    }
    vloan_delete(): Promise<void> {
        return this.call("vloan_delete",{})
    }

}