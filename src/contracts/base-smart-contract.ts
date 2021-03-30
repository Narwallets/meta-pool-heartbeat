import * as near from '../near-api/near-rpc.js';
import {ntoy} from '../near-api/near-rpc.js';

//-----------------------------
// Base smart-contract proxy class
// provides constructor, view & call methods
// derive your specific contract proxy from this class
//-----------------------------
export class SmartContract {
    
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

}

