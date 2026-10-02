import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import worker from '../worker.ts';import {sendQuote} from '../email.ts';import {issueToken} from '../../backend/src/infrastructure/auth.ts';
process.env.JWT_SECRET='local-test-secret-with-more-than-thirty-two-characters';
class Postgres{
 pg:PGlite;
 constructor(path?:string){this.pg=new PGlite(path)}
 async ready(){await this.pg.exec(readFileSync(new URL('../migrations/0001_beta.sql',import.meta.url),'utf8'));return this}
 async query(sql:string,args:any[]=[]){return (await this.pg.query(sql,args)).rows}
 async close(){await this.pg.close()}
}
const createEnv=(db:any)=>({TEST_DATABASE:db,JWT_SECRET:process.env.JWT_SECRET,ADMIN_LOGIN:'starplayground99@gmail.com',ADMIN_PASSWORD:'local-admin-secret-with-more-than-thirty-two-characters',CHALLENGE_REQUIRED:'false'});
const context={waitUntil(_promise:Promise<any>){}};
const request=(path:string,body?:any,token?:string)=>new Request('https://g9star.co.kr/api'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const quote={requestId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',industry:'카페',area:'18평',location:'서울',style:'Natural',budget:'1,000~3,000만원',contact:'테스트 매장',phone:'010-1234-5678',note:'테스트 견적',consent:true};
test('저장소를 다시 열어도 회원·쿠폰·견적과 관리자 변경값이 유지된다',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'g9star-pg-')),path=join(dir,'postgres');let db=await new Postgres(path).ready(),env=createEnv(db);
 try{
  const signup=await worker.fetch(request('/v1/members',{name:'베타회원',directCode:'RS-A001-KIM'}),env,context);assert.equal(signup.status,201);const member:any=await signup.json();
  assert.equal((await worker.fetch(request('/v1/coupons/register',{campaignCode:'WELCOME50'},member.accessToken),env,context)).status,201);
  const login=await worker.fetch(request('/v1/admin/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD}),env,context);assert.equal(login.status,200);const admin:any=await login.json();
  assert.equal((await worker.fetch(request('/v1/admin/ops/products/PRD-101/update',{name:'베타 검증 체어'},admin.accessToken),env,context)).status,200);
  // mail dispatch is verified independently without an external message.
  const oldWait=context.waitUntil;const jobs:Promise<any>[]=[];context.waitUntil=p=>{jobs.push(p)};
  assert.equal((await worker.fetch(request('/v1/estimates',quote),env,context)).status,201);await Promise.all(jobs);context.waitUntil=oldWait;
  await db.close();db=await new Postgres(path).ready();env=createEnv(db);
  const me:any=await(await worker.fetch(request('/v1/me',undefined,member.accessToken),env,context)).json();assert.equal(me.member.id,member.id);assert.equal(me.coupons.length,1);assert.equal(me.coupons[0].status,'ISSUED');
  const stored:any=await(await worker.fetch(request('/v1/admin/ops/estimates',undefined,admin.accessToken),env,context)).json();assert.ok(stored.items.some((q:any)=>q.id==='Q-'+quote.requestId));
  const product:any=await(await worker.fetch(request('/v1/products/PRD-101'),env,context)).json();assert.equal(product.name,'베타 검증 체어');
 }finally{await db.close();rmSync(dir,{recursive:true,force:true})}
});
test('공개 접근·관리자 권한·결제 차단·견적 동의 검증',async()=>{
 const db=await new Postgres().ready(),env=createEnv(db);try{
  assert.equal((await worker.fetch(request('/v1/products'),env,context)).status,200);
  assert.equal((await worker.fetch(request('/dev/token',{}),env,context)).status,404);
  assert.equal((await worker.fetch(request('/v1/admin/dashboard'),env,context)).status,401);
  const token=await issueToken({sub:'random-customer',role:'CUSTOMER'});
  assert.equal((await worker.fetch(request('/v1/admin/ops/products',undefined,token),env,context)).status,403);
  assert.equal((await worker.fetch(request('/v1/coupons/x/complete',{success:true,reservationId:'x'},token),env,context)).status,503);
  assert.equal((await worker.fetch(request('/v1/estimates',{...quote,consent:false}),env,context)).status,422);
  const bad=new Request('https://g9star.co.kr/api/v1/members',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});assert.equal((await worker.fetch(bad,env,context)).status,403);
 }finally{await db.close()}
});
test('동시 가입과 쿠폰 발급은 기존 저장값을 덮어쓰지 않는다',async()=>{
 const db=await new Postgres().ready(),env=createEnv(db);try{
  const responses=await Promise.all(Array.from({length:5},(_,i)=>worker.fetch(request('/v1/members',{name:'동시회원'+i,directCode:'RS-A001-KIM'}),env,context)));assert.ok(responses.every(r=>r.status===201));const members:any[]=await Promise.all(responses.map(r=>r.json()));
  const coupons=await Promise.all(members.map(m=>worker.fetch(request('/v1/coupons/register',{campaignCode:'WELCOME50'},m.accessToken),env,context)));assert.ok(coupons.every(r=>r.status===201));
  for(const m of members){const me:any=await(await worker.fetch(request('/v1/me',undefined,m.accessToken),env,context)).json();assert.equal(me.member.id,m.id);assert.equal(me.coupons.length,1);assert.equal(me.coupons[0].memberId,m.id)}
 }finally{await db.close()}
});
test('메일 알림은 지정된 수신처와 동일한 견적 멱등키를 사용한다',async()=>{
 let captured:any;const provider:any=async(_url:any,init:any)=>{captured=init;return Response.json({id:'mock-mail-id'})};const result=await sendQuote({RESEND_API_KEY:'test-only',QUOTE_FROM:'quotes@g9star.co.kr'},{id:'Q-test',customerName:'테스트',phone:'010-1234-5678',industry:'카페'},provider);assert.equal(result,'mock-mail-id');assert.deepEqual(JSON.parse(captured.body).to,['starplayground99@gmail.com']);assert.equal(captured.headers['idempotency-key'],'quote-Q-test');await assert.rejects(()=>sendQuote({},{}),/EMAIL_NOT_CONFIGURED/);
});

test('관리자 이미지는 R2에 저장하고 권한 없는 업로드를 거부한다',async()=>{
 const db=await new Postgres().ready(),objects=new Map(),env:any={...createEnv(db),UPLOADS:{async put(key:string,buffer:Buffer,options:any){objects.set(key,{buffer,options})},async get(key:string){const o=objects.get(key);return o?{httpMetadata:o.options.httpMetadata,async arrayBuffer(){return o.buffer.buffer.slice(o.buffer.byteOffset,o.buffer.byteOffset+o.buffer.byteLength)}}:null}}};
 try{
  const token=(await (await worker.fetch(request('/v1/admin/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD}),env,context)).json()).accessToken,image=readFileSync(new URL('../../prototype/assets/wood-chair.png',import.meta.url));
  const upload=(auth?:string)=>new Request('https://g9star.co.kr/api/v1/admin/ops/assets',{method:'POST',headers:{'content-type':'image/png',...(auth?{authorization:'Bearer '+auth}:{})},body:image});
  assert.equal((await worker.fetch(upload(),env,context)).status,401);
  const response=await worker.fetch(upload(token),env,context);assert.equal(response.status,201);const asset:any=await response.json();assert.equal(asset.size,image.length);assert.equal(objects.size,1);
  const fetched=await worker.fetch(request(asset.url),env,context);assert.equal(fetched.status,200);assert.equal(Buffer.compare(Buffer.from(await fetched.arrayBuffer()),image),0);
 }finally{await db.close()}
});

test('PostgreSQL 요청 제한과 상태 확인, 미설정 오류를 확인한다',async()=>{
 const db=await new Postgres().ready(),env=createEnv(db);
 try{
  const health=await worker.fetch(request('/health'),env,context);assert.equal(health.status,200);assert.equal((await health.json()).database,'postgresql');
  for(let i=0;i<10;i++)assert.equal((await worker.fetch(request('/v1/estimates',{...quote,consent:false}),env,context)).status,422);
  assert.equal((await worker.fetch(request('/v1/estimates',quote),env,context)).status,429);
  assert.equal((await worker.fetch(request('/health'),{JWT_SECRET:env.JWT_SECRET},context)).status,503);
 }finally{await db.close()}
});
test('실제 관리자 계정·비밀번호·단일 세션·권한과 영속성',async()=>{
 const db=await new Postgres().ready(),env=createEnv(db);
 const call=async(path:string,body?:any,token?:string)=>worker.fetch(request('/v1/admin'+path,body,token),env,context);
 const login=async(email:string,password:string)=>{const r=await call('/login',{login:email,password});assert.equal(r.status,200);return (await r.json()).accessToken};
 try{
  const master=await login(env.ADMIN_LOGIN,env.ADMIN_PASSWORD);
  const created=await call('/ops/admins',{name:'지원 담당',email:'CS@example.com',role:'CS',password:'InitialPassword123!'},master);assert.equal(created.status,201);const account:any=await created.json();assert.equal(account.email,'cs@example.com');assert.equal('passwordHash' in account,false);
  assert.equal((await call('/ops/admins',{name:'중복',email:'cs@example.com',role:'CS',password:'InitialPassword123!'},master)).status,409);
  assert.equal((await call('/ops/admins',{name:'마스터',email:'bad@example.com',role:'SUPER_ADMIN',password:'InitialPassword123!'},master)).status,422);
  const first=await login(account.email,'InitialPassword123!'),second=await login(account.email,'InitialPassword123!');
  assert.equal((await call('/session',undefined,first)).status,401);assert.equal((await call('/ops/estimates',undefined,second)).status,200);
  assert.equal((await call('/ops/admins',undefined,second)).status,403);assert.equal((await call('/session',undefined,master)).status,200);
  assert.equal((await call('/password',{currentPassword:'wrong',newPassword:'ChangedPassword123!'},second)).status,403);
  assert.equal((await call('/password',{currentPassword:'InitialPassword123!',newPassword:'ChangedPassword123!'},second)).status,200);assert.equal((await call('/session',undefined,second)).status,401);
  assert.equal((await call('/login',{login:account.email,password:'InitialPassword123!'})).status,401);
  let token=await login(account.email,'ChangedPassword123!');
  assert.equal((await call(`/ops/admins/${account.id}/reset-password`,{password:'ResetPassword123!'},master)).status,200);assert.equal((await call('/session',undefined,token)).status,401);
  token=await login(account.email,'ResetPassword123!');assert.equal((await call(`/ops/admins/${account.id}/status`,{status:'SUSPENDED'},master)).status,200);assert.equal((await call('/session',undefined,token)).status,401);assert.equal((await call('/login',{login:account.email,password:'ResetPassword123!'})).status,401);
  assert.equal((await call(`/ops/admins/${account.id}/status`,{status:'ACTIVE'},master)).status,200);
  const list:any=await (await call('/ops/admins',undefined,master)).json();const root=list.items.find((a:any)=>a.role==='SUPER_ADMIN');assert.equal((await call(`/ops/admins/${root.id}/status`,{status:'SUSPENDED'},master)).status,403);assert.ok(!JSON.stringify(list).includes('passwordHash'));
  const [row]:any=await db.query('SELECT payload FROM beta_state WHERE id=1');assert.equal(row.payload.adminAccounts.length,2);assert.ok(row.payload.adminAccounts[1].passwordHash);assert.ok(!JSON.stringify(row.payload).includes('ResetPassword123!'));
  assert.equal((await call('/logout',{},master)).status,200);assert.equal((await call('/session',undefined,master)).status,401);
 }finally{await db.close()}
});
test('동시에 로그인해도 같은 계정의 한 세션만 유효하다',async()=>{
 const db=await new Postgres().ready(),env=createEnv(db);
 try{const login=()=>worker.fetch(request('/v1/admin/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD}),env,context);const responses=await Promise.all([login(),login()]);const tokens=await Promise.all(responses.map(async r=>{assert.equal(r.status,200);return (await r.json()).accessToken}));const statuses=await Promise.all(tokens.map(async t=>(await worker.fetch(request('/v1/admin/session',undefined,t),env,context)).status));assert.deepEqual(statuses.sort(),[200,401]);}finally{await db.close()}
});
test('마스터 비밀번호 변경은 환경변수 암호로 되돌아가지 않는다',async()=>{
 const db=await new Postgres().ready(),env=createEnv(db);
 const call=(p:string,b?:any,t?:string)=>worker.fetch(request('/v1/admin'+p,b,t),env,context);
 try{const token=(await (await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).json()).accessToken;
 assert.equal((await call('/password',{currentPassword:env.ADMIN_PASSWORD,newPassword:'short'},token)).status,422);
 assert.equal((await call('/password',{currentPassword:env.ADMIN_PASSWORD,newPassword:'NewMasterPassword123!'},token)).status,200);
 assert.equal((await call('/session',undefined,token)).status,401);
 assert.equal((await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).status,401);
 const login=await call('/login',{login:env.ADMIN_LOGIN,password:'NewMasterPassword123!'});assert.equal(login.status,200);
 const current=(await login.json()).accessToken;const response=await call('/session',undefined,current);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.status,200);
 const logs:any=await (await call('/ops/dashboard',undefined,current)).json();assert.ok(!JSON.stringify(logs).includes('NewMasterPassword123!'));
 }finally{await db.close()}
});
