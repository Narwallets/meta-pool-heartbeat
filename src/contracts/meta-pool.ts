import * as near from '../near-api/near-rpc.js';
import {ntoy} from '../near-api/near-rpc.js';

import type {ContractInfo} from "./NEP129.js"

export type StakingPoolJSONInfo = {
    account_id: string,
    weight_basis_points: number,
    staked: string,//u128
    unstaked: string,//u128
    unstaked_requested_epoch_height: string, //U64String, 
    //EpochHeight where we asked the sp what were our staking rewards
    last_asked_rewards_epoch_height: string, //U64String,
}

//struct returned from get_account_info
export type GetAccountInfoResult = {
    account_id: string;
    /// The available balance that can be withdrawn
    available: string; //U128,
    /// The amount of stNEAR owned (computed from the shares owned)
    stnear: string; //U128,
    /// The amount of rewards (rewards = total_staked - stnear_amount) and (total_owned = stnear + rewards)
    unstaked: string; //U128,
    /// The epoch height when the unstaked was requested
    /// The fund will be locked for NUM_EPOCHS_TO_UNLOCK epochs
    /// unlock epoch = unstaked_requested_epoch_height + NUM_EPOCHS_TO_UNLOCK 
    unstaked_requested_epoch_height: string; //U64,
    ///if env::epoch_height()>=account.unstaked_requested_epoch_height+NUM_EPOCHS_TO_UNLOCK
    can_withdraw: boolean,
    /// total amount the user holds in this contract: account.availabe + account.staked + current_rewards + account.unstaked
    total: string; //U128,

    //-- STATISTICAL DATA --
    // User's statistical data
    // These fields works as a car's "trip meter". The user can reset them to zero.
    /// trip_start: (timpestamp in nanoseconds) this field is set at account creation, so it will start metering rewards
    trip_start: string, //U64,
    /// How many stnears the user had at "trip_start". 
    trip_start_stnear: string, //U128,
    /// how much the user staked since trip start. always incremented
    trip_accum_stakes: string, //U128,
    /// how much the user unstaked since trip start. always incremented
    trip_accum_unstakes: string, //U128,
    /// to compute trip_rewards we start from current_stnear, undo unstakes, undo stakes and finally subtract trip_start_stnear
    /// trip_rewards = current_stnear + trip_accum_unstakes - trip_accum_stakes - trip_start_stnear;
    /// trip_rewards = current_stnear + trip_accum_unstakes - trip_accum_stakes - trip_start_stnear;
    trip_rewards: string, //U128,

    ///NS liquidity pool shares, if the user is a liquidity provider
    nslp_shares: string, //U128,
    nslp_share_value: string, //U128,

    meta: string, //U128,
}

//JSON compatible struct returned from get_contract_state
export type ContractState = {

    /// This amount increments with deposits and decrements with for_staking
    /// increments with complete_unstake and decrements with user withdrawals from the contract
    /// withdrawals from the pools can include rewards
    /// since statking is delayed and in batches it only eventually matches env::balance()
    total_available: string, //U128,

    /// The total amount of tokens selected for staking by the users 
    /// not necessarily what's actually staked since staking can be done in batches
    total_for_staking: string, //U128,

    /// The total amount of tokens selected for unstaking by the users 
    /// not necessarily what's actually unstaked since unstaking can be done in batches
    total_for_unstaking: string, //U128,

    /// the staking pools will add rewards to the staked amount on each epoch
    /// here we store the accumulatred amount only for stats purposes. This amount can only grow
    accumulated_staked_rewards: string, 

    /// we remember how much we sent to the pools, so it's easy to compute staking rewards
    /// total_actually_staked: Amount actually sent to the staking pools and staked - NOT including rewards
    /// During distribute(), If !staking_paused && total_for_staking<total_actually_staked, then the difference gets staked in 100kN batches
    total_actually_staked: string, //U128, 

    /// The total amount of tokens actually unstaked (the tokens are in the staking pools)
    /// During distribute(), If !staking_paused && total_for_unstaking<total_actually_unstaked, then the difference gets unstaked in 100kN batches
    total_actually_unstaked: string, //U128,

    /// The total amount of tokens actually unstaked AND retrieved from the pools (the tokens are here)
    /// During distribute(), If sp.pending_withdrawal && sp.epoch_for_withdraw == env::epoch_height then all funds are retrieved from the sp
    /// When the funds are actually retrieved, total_actually_unstaked is decremented
    total_actually_unstaked_and_retrieved: string, //U128,

    // how many "shares" were minted. Everytime someone "stakes" he "buys pool shares" with the staked amount
    // the share price is computed so if he "sells" the shares on that moment he recovers the same near amount
    // staking produces rewards, so share_price = total_for_staking/total_shares
    // when someone "unstakes" she "burns" X shares at current price to recoup Y near
    total_stake_shares: string,

    total_meta : string, //U128,

    nslp_liquidity : string, //U128,
    /// Current discount for immediate unstake (sell stNEAR)
    nslp_current_discount_basis_points: number,

    accounts_count: string,//U64,

    //count of pools to diversify in
    staking_pools_count: string, //U64, 
}

export type VLoanInfo = {
    //total requested 
    amount_requested:string, //u128
    //staking pool owner
    staking_pool_owner_id:string,
    //staking pool beneficiary
    staking_pool_account_id:string,
    //more information 
    information_url: string,
    //committed fee
    //The validator commits to have their fee at x%, x amount of epochs
    //100 => 1% , 250=>2.5%, etc. -- max: 10000=>100%
    commited_fee: number, //u16,
    commited_fee_duration: number,// u16,

    //status: set by requester: draft, active / set by owner: rejected, accepted, implemented
    status_text: string,
    status: number, // u8,
    //set by owner. if status=accepted how much will be taken from the user account as fee to move to status=implemented
    loan_fee:string, // u128,

    //EpochHeight where the request was activated status=active
    activated_epoch_height: string // u64 EpochHeight 
}

export class MetaPool {

    constructor(
        public contract_account: string,
        public operator_account: string,
        public operator_private_key: string,
    ){}
    async view(method:string, args?:Record<string,any>){
        return near.view(this.contract_account,method,args||{});
    }
    async call(method:string, args:Record<string,any>,TGas?:number,attachedNEAR?:number){
        return near.call(this.contract_account,method,args,this.operator_account,this.operator_private_key,TGas||200,attachedNEAR||0);
    }

    async get_env_epoch_height():Promise<string>{ //U64String
        return this.view("get_env_epoch_height");
    }
 
    async get_staking_pool_list() :Promise<Array<StakingPoolJSONInfo>>{
        return this.view("get_staking_pool_list");
      }
          
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
        return this.call("deposit", {}, 25, nearsToDeposit)
    }
    withdraw(nearsToWithdraw:number) : Promise<void> {
        return this.call("withdraw", {amount:ntoy(nearsToWithdraw)})
    }

    deposit_and_stake(nearsToDeposit:number) : Promise<void> {
        return this.call("deposit_and_stake", {}, 50, nearsToDeposit)
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
    get_near_amount_sell_stnear(stnearToSell:number) : Promise<string> {
        return this.view("get_near_amount_sell_stnear", {"stnear_to_sell":ntoy(stnearToSell)})
    }

    //sell stnear & return NEARs received
    sell_stnear(stnearToSell:number, minExpectedNear:number) : Promise<string> {
        return this.call("sell_stnear", {"stnear_to_sell":ntoy(stnearToSell), "min_expected_near":ntoy(minExpectedNear)}, 75)
    }

    //current fee for liquidity providers
    nslp_get_discount_basis_points(stnearToSell:number) : Promise<number> {
        return this.view("nslp_get_discount_basis_points", {"stnear_to_sell":ntoy(stnearToSell)})
    }
    
    //add liquidity
    nslp_add_liquidity(amount:number) : Promise<void> {
        return this.call("nslp_add_liquidity", {"amount":ntoy(amount)}, 75)
    }

    //remove liquidity
    nslp_remove_liquidity(amount:number) : Promise<void> {
        return this.call("nslp_remove_liquidity", {"amount":ntoy(amount)}, 100)
    }

    //--------------
    //VLOAN REQUESTS
    //--------------
    get_vloan_request(account_id:string): Promise<VLoanInfo> {
        return this.view("get_vloan_request",{account_id:account_id})
    }

    set_vloan_request(amount_requested:number, staking_pool_account_id:string, 
                commited_fee:number, commited_fee_duration:number, 
                information_url: String): Promise<void> 
        {
        return this.call("set_vloan_request",{
            amount_requested:ntoy(amount_requested), 
            staking_pool_account_id:staking_pool_account_id,
            commited_fee:commited_fee*100,  //send in basis points
            commited_fee_duration:commited_fee_duration, 
            information_url: information_url });
    }

    vloan_activate(feeNears:number): Promise<void> {
        return this.call("vloan_activate",{},25,feeNears)
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