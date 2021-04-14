import { ContractState, StakingPoolJSONInfo } from './contracts/meta-pool-structs.js';

export type State = {
    env_epoch_height: string;
    contract_account_balance: string;
    total_available: string;
    epoch_stake_orders: string;
    epoch_unstake_orders: string;
    total_for_staking: string;
    total_actually_staked: string;
    to_stake_delta: string;
    total_unstaked_and_waiting: string;
    total_unstake_claims: string;
    reserve_for_unstake_claims: string;
    staked_in_pools: string;
    unstaked_in_pools: string;
    total_in_pools: string;
}

type AdditionalStateInfo = {
    staked_in_pools: string;
    unstaked_in_pools: string;
    total_in_pools: string;
    to_stake_delta: string;
}

export type ComposedState = ContractState & AdditionalStateInfo;

export function jsonParseQuoteBigInt(s: string) {
    //const quoteNumbers = s.replace(/([^"^[0-9])(-{0,1}[0-9]{1,90})([^"^[0-9]])/g, '$1"$2"$3');
    const quoteNumbers = s.replace(/([^"^\d])(-?\d{1,90})([^"^\d])/g, '$1"$2"$3');
    return JSON.parse(quoteNumbers);
}

//-----
export function parseComposedState(serdeJsonString: string): ComposedState {
    return jsonParseQuoteBigInt(serdeJsonString) as ComposedState;
}


export function createComposedState(contractBasicState: ContractState, pools: Array<StakingPoolJSONInfo>): ComposedState {

    let sumStaked = 0n;
    let sumUnstaked = 0n;

    for (let inx = 0; inx < pools.length; inx++) {
        const pool = pools[inx];
        //only the the amount unstaked justified tx-cost, only if amount > 10Tgas
        sumStaked += BigInt(pool.staked);
        sumUnstaked += BigInt(pool.unstaked);
    }
    let additional: AdditionalStateInfo = {
        staked_in_pools: sumStaked.toString(),
        unstaked_in_pools: sumUnstaked.toString(),
        total_in_pools: (sumStaked + sumUnstaked).toString(),
        to_stake_delta: (BigInt(contractBasicState.total_for_staking) - BigInt(contractBasicState.total_actually_staked)).toString()
    }

    return Object.assign(contractBasicState, additional) as ComposedState;
}

export function computeStateDiff(pre: ComposedState, post: ComposedState): ComposedState {
    return {
        env_epoch_height: (BigInt(post.env_epoch_height) - BigInt(pre.env_epoch_height)).toString(),
        total_stake_shares: (BigInt(post.total_stake_shares) - BigInt(pre.total_stake_shares)).toString(),
        total_meta: (BigInt(post.total_meta) - BigInt(pre.total_meta)).toString(),
        accumulated_staked_rewards: (BigInt(post.accumulated_staked_rewards) - BigInt(pre.accumulated_staked_rewards)).toString(),

        nslp_liquidity: (BigInt(post.nslp_liquidity) - BigInt(pre.nslp_liquidity)).toString(),
        nslp_stnear_balance: (BigInt(post.nslp_stnear_balance) - BigInt(pre.nslp_stnear_balance)).toString(),
        nslp_target: (BigInt(post.nslp_target) - BigInt(pre.nslp_target)).toString(), 
        nslp_current_discount_basis_points: post.nslp_current_discount_basis_points - pre.nslp_current_discount_basis_points,

        nslp_min_discount_basis_points: post.nslp_min_discount_basis_points- pre.nslp_min_discount_basis_points, 
        nslp_max_discount_basis_points: post.nslp_max_discount_basis_points- pre.nslp_max_discount_basis_points, 
        accounts_count: (BigInt(post.accounts_count) - BigInt(pre.accounts_count)).toString(), 
        staking_pools_count: post.staking_pools_count- pre.staking_pools_count, 

        contract_account_balance: (BigInt(post.contract_account_balance) - BigInt(pre.contract_account_balance)).toString(),
        reserve_for_unstake_claims: (BigInt(post.reserve_for_unstake_claims) - BigInt(pre.reserve_for_unstake_claims)).toString(),
        total_available: (BigInt(post.total_available) - BigInt(pre.total_available)).toString(),

        epoch_stake_orders: (BigInt(post.epoch_stake_orders) - BigInt(pre.epoch_stake_orders)).toString(),
        epoch_unstake_orders: (BigInt(post.epoch_unstake_orders) - BigInt(pre.epoch_unstake_orders)).toString(),

        total_for_staking: (BigInt(post.total_for_staking) - BigInt(pre.total_for_staking)).toString(),
        total_actually_staked: (BigInt(post.total_actually_staked) - BigInt(pre.total_actually_staked)).toString(),
        to_stake_delta: (BigInt(post.to_stake_delta) - BigInt(pre.to_stake_delta)).toString(),

        total_unstaked_and_waiting: (BigInt(post.total_unstaked_and_waiting) - BigInt(pre.total_unstaked_and_waiting)).toString(),

        total_unstake_claims: (BigInt(post.total_unstake_claims) - BigInt(pre.total_unstake_claims)).toString(),

        staked_in_pools: (BigInt(post.staked_in_pools) - BigInt(pre.staked_in_pools)).toString(),
        unstaked_in_pools: (BigInt(post.unstaked_in_pools) - BigInt(pre.unstaked_in_pools)).toString(),
        total_in_pools: (BigInt(post.total_in_pools) - BigInt(pre.total_in_pools)).toString(),
    }
}

