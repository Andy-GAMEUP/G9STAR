import {DomainError} from './domain.ts';

type Input=Record<string,unknown>;
const invalid=(field:string,reason:string)=>new DomainError('VALIDATION_ERROR','요청 값을 확인해 주세요.',422,{field,reason});

export const objectInput=(value:unknown):Input=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('$','object_required');
 return value as Input;
};
export const stringField=(input:Input,field:string,{required=true,min=1,max=200}:{required?:boolean;min?:number;max?:number}={})=>{
 const value=input[field];
 if(value===undefined&&!required)return undefined;
 if(typeof value!=='string')throw invalid(field,'string_required');
 const normalized=value.trim();
 if(normalized.length<min)throw invalid(field,'too_short');
 if(normalized.length>max)throw invalid(field,'too_long');
 return normalized;
};
export const booleanField=(input:Input,field:string,{required=true}:{required?:boolean}={})=>{
 const value=input[field];
 if(value===undefined&&!required)return undefined;
 if(typeof value!=='boolean')throw invalid(field,'boolean_required');
 return value;
};
export const integerField=(input:Input,field:string,{min=0,max=Number.MAX_SAFE_INTEGER}:{min?:number;max?:number}={})=>{
 const value=input[field];
 if(typeof value!=='number'||!Number.isSafeInteger(value))throw invalid(field,'integer_required');
 if(value<min||value>max)throw invalid(field,'out_of_range');
 return value;
};
export const isoDateTimeField=(input:Input,field:string)=>{
 const value=stringField(input,field,{max:40})!;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)||Number.isNaN(Date.parse(value)))throw invalid(field,'iso_datetime_required');
 return value;
};
