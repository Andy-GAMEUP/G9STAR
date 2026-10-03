import {DomainError} from '../backend/src/domain.ts';

// Keep credential values, identifiers and hashes out of operational logs.
export function rejectLogin(accountType:'admin'|'member',reason:string,storedAccounts:number,message:string,code='INVALID_CREDENTIALS'):never{
 console.warn('authentication_rejected',{accountType,reason,storedAccounts});
 throw new DomainError(code,message,401);
}
