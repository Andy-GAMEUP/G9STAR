import {createDatabase} from './infrastructure/database.ts';import {BusinessCalendar} from './infrastructure/business-calendar.ts';import {SettlementScheduler} from './infrastructure/scheduler.ts';import {OutboxPublisher} from './infrastructure/outbox.ts';
if(!process.env.DATABASE_URL)throw new Error('worker requires DATABASE_URL');
const database=createDatabase();
const holidayRows=await database.withTransaction(async q=>(await q(`select holiday_date::text from business_holidays where country_code='KR'`)).rows);
const calendar=new BusinessCalendar(holidayRows.map(x=>String(x.holiday_date).slice(0,10))),scheduler=new SettlementScheduler(database,calendar);
const outbox=new OutboxPublisher(database,async(topic,payload)=>{if(!process.env.OUTBOX_TARGET_URL)throw new Error('OUTBOX_TARGET_URL is required');const response=await fetch(process.env.OUTBOX_TARGET_URL,{method:'POST',headers:{'content-type':'application/json','x-event-topic':topic,'authorization':`Bearer ${process.env.OUTBOX_TOKEN||''}`},body:JSON.stringify(payload)});if(!response.ok)throw new Error(`outbox target ${response.status}`)});
let running=false;async function tick(){if(running)return;running=true;try{const settlements=await scheduler.run(new Date()),events=await outbox.flush();console.log(JSON.stringify({at:new Date().toISOString(),settlements,events}))}catch(error){console.error(error)}finally{running=false}}
await tick();const timer=setInterval(tick,60000);const shutdown=async()=>{clearInterval(timer);await database.close()};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
