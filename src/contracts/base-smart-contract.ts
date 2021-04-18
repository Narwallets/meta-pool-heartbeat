import * as near from '../near-api/near-rpc.js';
import {ntoy} from '../near-api/near-rpc.js';

//-----------------------------
// Base smart-contract proxy class
// provides constructor, view & call methods
// derive your specific contract proxy from this class
//-----------------------------
export class SmartContract {
    
    public dryRun:boolean=false;

    constructor(
        public contract_account: string,
        public signer: string,
        public signer_private_key: string,
    ){}
    async view(method:string, args?:Record<string,any>){
        return near.view(this.contract_account,method,args||{});
    }
    async call(method:string, args:Record<string,any>,TGas?:number,attachedYoctoNear?:string){
        if (this.dryRun){
            console.log(`near.call ${this.contract_account}.${method}(${args}) attached:${near.yton(attachedYoctoNear||"0")}`)
        }
        else {
            return near.call(this.contract_account,method,args,this.signer,this.signer_private_key,TGas||200,attachedYoctoNear||"0");
        }
    }

}

