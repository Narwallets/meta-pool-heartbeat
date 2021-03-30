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
    /// total amount the user holds in this contract: account.available + account.staked + current_rewards + account.unstaked
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
    nslp_target : string, //U128,
    /// Current discount for immediate unstake (sell stNEAR)
    nslp_current_discount_basis_points: number,
    nslp_min_discount_basis_points: number,
    nslp_max_discount_basis_points: number,

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

export type StakingPoolJSONInfo = {
    account_id: string,
    weight_basis_points: number,
    staked: string,//u128
    unstaked: string,//u128
    unstaked_requested_epoch_height: string, //U64String, 
    //EpochHeight where we asked the sp what were our staking rewards
    last_asked_rewards_epoch_height: string, //U64String,
}
