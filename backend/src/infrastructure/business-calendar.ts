export const isoDate=(d:Date)=>d.toISOString().slice(0,10);
export class BusinessCalendar{
 constructor(privateHolidays:string[]=[]){this.holidays=new Set(privateHolidays)}private holidays:Set<string>;
 isBusinessDay(d:Date){const day=d.getUTCDay();return day!==0&&day!==6&&!this.holidays.has(isoDate(d))}
 addBusinessDays(input:Date,count:number){const d=new Date(input),direction=count>=0?1:-1;let left=Math.abs(count);while(left>0){d.setUTCDate(d.getUTCDate()+direction);if(this.isBusinessDay(d))left--}return d}
 previousBusinessDay(input:Date){const d=new Date(input);while(!this.isBusinessDay(d))d.setUTCDate(d.getUTCDate()-1);return d}
 paymentDate(year:number,monthIndex:number){return this.previousBusinessDay(new Date(Date.UTC(year,monthIndex,27)))}
}
