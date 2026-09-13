import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {PostgresDatabase} from '../src/infrastructure/database.ts';
import {BusinessCalendar} from '../src/infrastructure/business-calendar.ts';
import {SettlementScheduler} from '../src/infrastructure/scheduler.ts';
import {OutboxPublisher} from '../src/infrastructure/outbox.ts';
import {PlatformService} from '../src/domain.ts';
import {BackofficeService} from '../src/backoffice-service.ts';
import {MedusaWebhookProcessor} from '../src/infrastructure/webhook.ts';

const connectionString=process.env.TEST_DATABASE_URL;
const postgresTest=connectionString?test:test.skip;

postgresTest('PostgreSQL 마이그레이션 결과와 트랜잭션 rollback을 검증한다',async()=>{
 const pool=new pg.Pool({connectionString});
 const database=new PostgresDatabase(connectionString!);
 try{
  assert.equal(await database.health(),true);
  const migrations=await pool.query('select version from schema_migrations order by version');
  assert.deepEqual(migrations.rows.map(row=>row.version),[
   '001_initial.sql','002_webhooks_and_outbox.sql','003_scheduler_and_retries.sql','004_full_backoffice.sql','005_backoffice_policy_sync.sql'
  ]);
  const tables=await pool.query(`select table_name from information_schema.tables where table_schema='public'`);
  const names=new Set(tables.rows.map(row=>row.table_name));
  for(const name of ['partners','members','member_coupons','commission_ledger','settlements','audit_events','webhook_events','outbox_events','business_holidays','scheduler_runs','backoffice_entities','inventory_movements','estimate_revisions','partner_api_keys','notification_deliveries','integration_reprocess_jobs'])assert.ok(names.has(name),name);
  await assert.rejects(database.withTransaction(async query=>{
   await query(`insert into partners(code,name) values('ROLLBACK-CHECK','rollback')`);
   throw new Error('force rollback');
  }),/force rollback/);
  assert.equal((await pool.query(`select count(*)::int as count from partners where code='ROLLBACK-CHECK'`)).rows[0].count,0);
 }finally{
  await database.close();
  await pool.end();
 }
});

postgresTest('PostgreSQL 백오피스 엔티티·감사·API Key를 재기동 후에도 복원한다',async()=>{
 const pool=new pg.Pool({connectionString}),database=new PostgresDatabase(connectionString!),marker=`PG-OPS-${Date.now()}`;
 try{
  const first=new BackofficeService(new PlatformService(),database);await first.hydrate();const product=first.create('products',{id:marker,code:marker,name:'PostgreSQL 영속 상품',regularPrice:1000,salePrice:900},'pg-test');first.rotateApiKey('P-A','pg-test','SUPER_ADMIN');await first.flush();
  const second=new BackofficeService(new PlatformService(),database);await second.hydrate();assert.equal(second.detail('products',product.id).name,'PostgreSQL 영속 상품');assert.ok((await pool.query(`select count(*)::int count from audit_events where entity_type='BACKOFFICE' and entity_id=$1`,[marker])).rows[0].count>=1);assert.equal((await pool.query(`select count(*)::int count from partner_api_keys where partner_key='P-A' and revoked_at is null`)).rows[0].count,1);assert.equal((await pool.query(`select count(*)::int count from referral_codes rc join partners p on p.id=rc.partner_id where rc.canonical_code='RS-A001-KIM' and p.code='P-A'`)).rows[0].count,1);const campaign=(await pool.query(`select discount_type,discount_value,scope from coupon_campaigns where code='PARTNERA10'`)).rows[0];assert.equal(campaign.discount_type,'PERCENT');assert.equal(Number(campaign.discount_value),10);assert.equal(campaign.scope.type,'ALL');
  await pool.query(`delete from backoffice_entities where entity_id=$1`,[marker]);await pool.query(`delete from audit_events where entity_type='BACKOFFICE' and entity_id=$1`,[marker]);
 }finally{await database.close();await pool.end()}
});

postgresTest('Medusa 웹훅 커미션 원장을 PostgreSQL에 멱등 기록한다',async()=>{
 const pool=new pg.Pool({connectionString}),database=new PostgresDatabase(connectionString!),marker=`MED-${Date.now()}`;
 try{
  const partnerId=(await pool.query(`insert into partners(code,name,status,payout_hold) values($1,'웹훅 파트너','ACTIVE',false) returning id`,[marker])).rows[0].id;
  const processor=new MedusaWebhookProcessor(new PlatformService(),database);
  const orderId=`${marker}-O1`,event={type:'order.payment_captured',data:{partnerId:marker,period:'2026-09-01',orderId,sellingPrice:780000,couponDiscount:10000,cancelledAmount:0,commissionRate:.08}};
  const first=await processor.process(`wh:${orderId}`,event);
  assert.equal((first as any).accepted,true);
  const ledger=await pool.query(`select amount_krw,kind,status,calculation from commission_ledger where transaction_id=$1 and kind='PURCHASE'`,[orderId]);
  assert.equal(ledger.rows.length,1);assert.equal(Number(ledger.rows[0].amount_krw),61600);assert.equal(ledger.rows[0].status,'READY');assert.equal(Number(ledger.rows[0].calculation.commissionRate),.08);
  // 같은 멱등키 재수신 → 중복, 원장 미증가
  const dup=await processor.process(`wh:${orderId}`,event);assert.equal((dup as any).duplicate,true);
  assert.equal((await pool.query(`select count(*)::int c from commission_ledger where transaction_id=$1`,[orderId])).rows[0].c,1);
  // 미존재 파트너 → 트랜잭션 rollback(webhook_events도 미기록)
  await assert.rejects(processor.process(`wh:${marker}-nopart`,{type:'order.payment_captured',data:{partnerId:'NO-SUCH',period:'2026-09-01',orderId:`${marker}-O2`,sellingPrice:1000,commissionRate:.08}}),(e:any)=>e.code==='PARTNER_NOT_FOUND');
  assert.equal((await pool.query(`select count(*)::int c from webhook_events where idempotency_key=$1`,[`${marker}-nopart`])).rows[0].c,0);
  await pool.query(`delete from audit_events where entity_type='COMMISSION_LEDGER' and entity_id in (select id::text from commission_ledger where transaction_id=$1)`,[orderId]);
  await pool.query(`delete from commission_ledger where partner_id=$1`,[partnerId]);await pool.query(`delete from webhook_events where idempotency_key like $1`,[`wh:${marker}%`]);await pool.query(`delete from partners where id=$1`,[partnerId]);
 }finally{await database.close();await pool.end()}
});

postgresTest('PostgreSQL 정산 Worker는 지급 격리와 Outbox 재시도를 보장한다',async()=>{
 const pool=new pg.Pool({connectionString});
 const database=new PostgresDatabase(connectionString!);
 const marker=`WORKER-${Date.now()}`;
 try{
  const payablePartner=(await pool.query(`insert into partners(code,name,status,payout_hold) values($1,'지급 가능','ACTIVE',false) returning id`,[`${marker}-PAY`])).rows[0].id;
  const heldPartner=(await pool.query(`insert into partners(code,name,status,payout_hold) values($1,'재검증 중','REVIEW',true) returning id`,[`${marker}-HOLD`])).rows[0].id;
  const payable=(await pool.query(`insert into settlements(partner_id,period,status,dispute_window,tax_status,dispute_due_at,scheduled_pay_date) values($1,'2026-08-01','REVIEW','OPEN','VERIFIED','2026-09-01','2026-09-12') returning id`,[payablePartner])).rows[0].id;
  const held=(await pool.query(`insert into settlements(partner_id,period,status,dispute_window,tax_status,dispute_due_at,scheduled_pay_date) values($1,'2026-08-01','FINAL','CLOSED','VERIFIED','2026-09-01','2026-09-12') returning id`,[heldPartner])).rows[0].id;
  const scheduler=new SettlementScheduler(database,new BusinessCalendar([]));
  const run=await scheduler.run(new Date('2026-09-13T01:00:00.000Z'));
  assert.ok(run.finalized.includes(payable));assert.ok(run.paid.includes(payable));assert.ok(!run.paid.includes(held));
  const states=await pool.query(`select id,status,paid_at from settlements where id=any($1::uuid[])`,[[payable,held]]);
  assert.equal(states.rows.find(row=>row.id===payable).status,'PAID');assert.equal(states.rows.find(row=>row.id===held).status,'FINAL');
  const good=(await pool.query(`insert into outbox_events(topic,aggregate_id,payload) values('worker.good',$1,'{}') returning id`,[marker])).rows[0].id;
  const retry=(await pool.query(`insert into outbox_events(topic,aggregate_id,payload) values('worker.retry',$1,'{}') returning id`,[marker])).rows[0].id;
  const outbox=new OutboxPublisher(database,async topic=>{if(topic==='worker.retry')throw new Error('temporary downstream failure')});
  const flushed=await outbox.flush();assert.ok(flushed.published.includes(good));assert.ok(flushed.failed.includes(retry));
  const events=await pool.query(`select id,published_at,attempts,next_attempt_at,last_error from outbox_events where id=any($1::uuid[])`,[[good,retry]]);
  const goodRow=events.rows.find(row=>row.id===good),retryRow=events.rows.find(row=>row.id===retry);assert.ok(goodRow.published_at);assert.equal(goodRow.attempts,1);assert.equal(retryRow.attempts,1);assert.ok(retryRow.next_attempt_at);assert.match(retryRow.last_error,/temporary downstream failure/);
  await pool.query(`delete from outbox_events where aggregate_id=$1`,[marker]);await pool.query(`delete from settlements where partner_id=any($1::uuid[])`,[[payablePartner,heldPartner]]);await pool.query(`delete from partners where id=any($1::uuid[])`,[[payablePartner,heldPartner]]);
 }finally{
  await database.close();
  await pool.end();
 }
});
