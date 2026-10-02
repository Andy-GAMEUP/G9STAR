import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadApplication,saveApplication} from '../state.ts';import {createHash} from 'node:crypto';
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
async function fixtureSignup(env:any,name:string,address:string){
 const proof='test-email-proof-'+address;
 for(let attempt=0;attempt<8;attempt++){const {app,version}=await loadApplication(env.TEST_DATABASE,env);(app as any).memberPending.push({email:address,id:address,verified:true,tokenHash:createHash('sha256').update(proof).digest('hex'),expiresAt:Date.now()+600000});if(await saveApplication(env.TEST_DATABASE,app,version))break;}
 return worker.fetch(request('/v1/members',{name,email:address,password:'Test123!',phone:'01012345678',directCode:'RS-A001-KIM',privacyConsent:true,termsConsent:true,verificationToken:proof}),env,context);
}
test('저장소를 다시 열어도 회원·쿠폰·견적과 관리자 변경값이 유지된다',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'g9star-pg-')),path=join(dir,'postgres');let db=await new Postgres(path).ready(),env=createEnv(db);
 try{
  const signup=await fixtureSignup(env,'베타회원','test@example.com');assert.equal(signup.status,201);const member:any=await signup.json();
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
  assert.equal((await worker.fetch(request('/v1/coupons/x/complete',{success:true,reservationId:'x'},token),env,context)).status,401);
  assert.equal((await worker.fetch(request('/v1/estimates',{...quote,consent:false}),env,context)).status,422);
  const bad=new Request('https://g9star.co.kr/api/v1/members',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});assert.equal((await worker.fetch(bad,env,context)).status,403);
 }finally{await db.close()}
});
test('동시 가입과 쿠폰 발급은 기존 저장값을 덮어쓰지 않는다',async()=>{
 const db=await new Postgres().ready(),env=createEnv(db);try{
  const responses=await Promise.all(Array.from({length:5},(_,i)=>fixtureSignup(env,'동시회원'+i,'concurrent'+i+'@example.com')));assert.ok(responses.every(r=>r.status===201));const members:any[]=await Promise.all(responses.map(r=>r.json()));
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
 for(const invalid of ['Ab1!xyz','Abcd1234','123456!?','Abcdef!?','Abcd123가','A1!'+ 'a'.repeat(198)])assert.equal((await call('/password',{currentPassword:env.ADMIN_PASSWORD,newPassword:invalid},token)).status,422);
 assert.equal((await call('/password',{currentPassword:env.ADMIN_PASSWORD,newPassword:'Abcd12!?'},token)).status,200);
 assert.equal((await call('/session',undefined,token)).status,401);
 assert.equal((await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).status,401);
 const login=await call('/login',{login:env.ADMIN_LOGIN,password:'Abcd12!?'});assert.equal(login.status,200);
 const current=(await login.json()).accessToken;const response=await call('/session',undefined,current);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.status,200);
 const logs:any=await (await call('/ops/dashboard',undefined,current)).json();assert.ok(!JSON.stringify(logs).includes('Abcd12!?'));
 }finally{await db.close()}
});
test('이메일 임시 비밀번호는 일회용이며 변경 전 업무 접근을 차단한다',async()=>{
 const db=await new Postgres().ready(),env={...createEnv(db),RESEND_API_KEY:'test-key',QUOTE_FROM:'admin@g9star.co.kr'},original=globalThis.fetch;const mails:any[]=[];
 globalThis.fetch=async(url:any,init:any)=>{assert.equal(String(url),'https://api.resend.com/emails');mails.push({headers:init.headers,body:JSON.parse(init.body)});return Response.json({id:'mail-test'})};
 const call=(p:string,b?:any,t?:string)=>worker.fetch(request('/v1/admin'+p,b,t),env,context);
 try{const old=(await (await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).json()).accessToken;
 const result=await call('/password-recovery',{email:env.ADMIN_LOGIN});assert.equal(result.status,200);const known=await result.json();assert.equal(mails.length,1);assert.deepEqual(mails[0].body.to,[env.ADMIN_LOGIN]);assert.ok(mails[0].headers['idempotency-key'].startsWith('admin-recovery-'));
 const temporary=mails[0].body.text.match(/관리자 임시 비밀번호: ([^\n]+)/)[1];assert.ok(temporary.length>=8);assert.match(temporary,/[A-Za-z]/);assert.match(temporary,/[0-9]/);assert.match(temporary,/!/);
 assert.equal((await call('/session',undefined,old)).status,200);
 assert.deepEqual(await (await call('/password-recovery',{email:'unknown@example.com'})).json(),known);
 assert.deepEqual(await (await call('/password-recovery',{email:env.ADMIN_LOGIN})).json(),known);assert.equal(mails.length,1);
 const login=await call('/login',{login:env.ADMIN_LOGIN,password:temporary});assert.equal(login.status,200);const recovered:any=await login.json();assert.equal(recovered.mustChangePassword,true);
 assert.equal((await call('/session',undefined,old)).status,401);assert.equal((await call('/ops/dashboard',undefined,recovered.accessToken)).status,403);
 const session:any=await (await call('/session',undefined,recovered.accessToken)).json();assert.equal(session.mustChangePassword,true);assert.equal('recovery' in session,false);assert.equal('passwordHash' in session,false);
 assert.equal((await call('/login',{login:env.ADMIN_LOGIN,password:temporary})).status,401);assert.equal((await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).status,401);
 assert.equal((await call('/password',{currentPassword:temporary,newPassword:'Fresh12!'},recovered.accessToken)).status,200);
 assert.equal((await call('/session',undefined,recovered.accessToken)).status,401);const next=await call('/login',{login:env.ADMIN_LOGIN,password:'Fresh12!'});assert.equal(next.status,200);assert.equal((await next.json()).mustChangePassword,false);
 assert.equal((await call('/login',{login:env.ADMIN_LOGIN,password:temporary})).status,401);
 const [row]:any=await db.query('SELECT payload FROM beta_state WHERE id=1');assert.ok(!JSON.stringify(row.payload).includes(temporary));assert.ok(!JSON.stringify(row.payload).includes('Fresh12!'));assert.equal(row.payload.adminAccounts[0].recovery,undefined);
 }finally{globalThis.fetch=original;await db.close()}
});
test('메일 실패·만료·보안 확인 실패 때는 기존 비밀번호가 유지된다',async()=>{
 const db=await new Postgres().ready(),env={...createEnv(db),RESEND_API_KEY:'test-key',QUOTE_FROM:'admin@g9star.co.kr'},original=globalThis.fetch;let mail:any;
 const call=(p:string,b?:any,t?:string)=>worker.fetch(request('/v1/admin'+p,b,t),env,context);
 try{const old=(await (await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).json()).accessToken;
 globalThis.fetch=async()=>new Response('{}',{status:500});assert.equal((await call('/password-recovery',{email:env.ADMIN_LOGIN})).status,503);assert.equal((await call('/session',undefined,old)).status,200);
 const secured={...env,CHALLENGE_REQUIRED:'true',TURNSTILE_SECRET_KEY:'test-secret'};assert.equal((await worker.fetch(request('/v1/admin/password-recovery',{email:env.ADMIN_LOGIN}),secured,context)).status,422);
 await db.query("DELETE FROM beta_rate_limits WHERE key LIKE 'admin-recovery:%'");globalThis.fetch=async(_url:any,init:any)=>{mail=JSON.parse(init.body);return Response.json({id:'mail-test'})};assert.equal((await call('/password-recovery',{email:env.ADMIN_LOGIN})).status,200);
 const temporary=mail.text.match(/관리자 임시 비밀번호: ([^\n]+)/)[1];const [row]:any=await db.query('SELECT payload FROM beta_state WHERE id=1');row.payload.adminAccounts[0].recovery.expiresAt=Date.now()-1;await db.query('UPDATE beta_state SET payload=$1::jsonb,version=version+1 WHERE id=1',[JSON.stringify(row.payload)]);
 assert.equal((await call('/login',{login:env.ADMIN_LOGIN,password:temporary})).status,401);assert.equal((await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).status,200);
 }finally{globalThis.fetch=original;await db.close()}
});
test('저장 충돌로 재시도해도 임시 비밀번호 메일은 한 번만 발송한다',async()=>{
 const db=await new Postgres().ready(),base=createEnv(db),original=globalThis.fetch;let count=0,temporary='',conflict=false;
 const query=db.query.bind(db);const env={...base,RESEND_API_KEY:'test-key',QUOTE_FROM:'admin@g9star.co.kr',TEST_DATABASE:{query:async(sql:string,args:any[])=>{if(conflict&&sql.startsWith('UPDATE beta_state')){conflict=false;return []}return query(sql,args)}}};
 try{assert.equal((await worker.fetch(request('/v1/admin/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD}),env,context)).status,200);conflict=true;globalThis.fetch=async(_url:any,init:any)=>{count++;temporary=JSON.parse(init.body).text.match(/관리자 임시 비밀번호: ([^\n]+)/)[1];return Response.json({id:'mail-test'})};
 assert.equal((await worker.fetch(request('/v1/admin/password-recovery',{email:env.ADMIN_LOGIN}),env,context)).status,200);assert.equal(count,1);assert.equal((await worker.fetch(request('/v1/admin/login',{login:env.ADMIN_LOGIN,password:temporary}),env,context)).status,200);
 }finally{globalThis.fetch=original;await db.close()}
});

test('회원 이메일 인증·가입·로그인·임시 비밀번호·영속성과 인증 우회를 검증한다',async()=>{
 const db=await new Postgres().ready(),env:any={...createEnv(db),RESEND_API_KEY:'test-only',QUOTE_FROM:'hello@g9star.co.kr'},originalFetch=globalThis.fetch,mails:any[]=[];
 globalThis.fetch=async(_url:any,init:any)=>{mails.push(JSON.parse(init.body));return Response.json({id:'mock-member-mail'});};
 const call=(p:string,b?:any,t?:string)=>worker.fetch(request(p,b,t),env,context),address='member@example.com';
 try{
  const input={email:address,name:'인증회원',password:'Pass123!',phone:'01012345678',directCode:'RS-A001-KIM',privacyConsent:true,termsConsent:true};
  assert.equal((await call('/v1/members',input)).status,422);
  assert.equal((await call('/v1/member-auth/send-verification',{email:address})).status,200);assert.deepEqual(mails[0].to,[address]);const code=mails[0].text.match(/인증번호: (\d{6})/)[1];
  assert.equal((await call('/v1/member-auth/verify-email',{email:address,code:'wrong'})).status,422);
  const proof:any=await(await call('/v1/member-auth/verify-email',{email:address,code})).json();assert.ok(proof.verificationToken);
  assert.equal((await call('/v1/members',{...input,verificationToken:proof.verificationToken,privacyConsent:false})).status,422);
  assert.equal((await call('/v1/members',{...input,verificationToken:proof.verificationToken,password:'abcdefgh'})).status,422);
  const signup=await call('/v1/members',{...input,verificationToken:proof.verificationToken});assert.equal(signup.status,201);const registered:any=await signup.json();assert.equal(registered.member.name,input.name);
  assert.equal((await call('/v1/members',{...input,verificationToken:proof.verificationToken})).status,409);
  assert.equal((await call('/v1/member-auth/login',{email:address,password:'wrong'})).status,401);
  const auth:any=await(await call('/v1/member-auth/login',{email:address,password:input.password})).json();assert.ok(auth.accessToken);assert.equal((await call('/v1/member-auth/session',undefined,registered.accessToken)).status,401);
  const loaded=await loadApplication(db,env);assert.equal((loaded.app as any).memberAccounts[0].email,address);assert.equal((await call('/v1/me',undefined,auth.accessToken)).status,200);
  assert.equal((await call('/v1/member-auth/password-recovery',{email:address})).status,200);const temporary=mails[1].text.match(/임시 비밀번호: (\S+)/)[1];
  assert.equal((await call('/v1/member-auth/session',undefined,auth.accessToken)).status,200);
  const recovered:any=await(await call('/v1/member-auth/login',{email:address,password:temporary})).json();assert.equal(recovered.mustChangePassword,true);
  assert.equal((await call('/v1/member-auth/login',{email:address,password:temporary})).status,401);
  assert.equal((await call('/v1/me',undefined,recovered.accessToken)).status,403);
  assert.equal((await call('/v1/member-auth/session',undefined,auth.accessToken)).status,401);
  assert.equal((await call('/v1/member-auth/password',{currentPassword:temporary,newPassword:'Fresh123!'},recovered.accessToken)).status,200);
  const fresh:any=await(await call('/v1/member-auth/login',{email:address,password:'Fresh123!'})).json();assert.equal(fresh.mustChangePassword,false);
  assert.equal((await call('/v1/coupons/register',{campaignCode:'WELCOME50'},fresh.accessToken)).status,201);
  assert.equal((await call('/v1/member-auth/logout',{},fresh.accessToken)).status,200);assert.equal((await call('/v1/me',undefined,fresh.accessToken)).status,401);
  const unknown=await call('/v1/member-auth/password-recovery',{email:'unknown@example.com'});assert.equal(unknown.status,200);assert.equal(mails.length,2);
  const [row]:any=await db.query('SELECT payload FROM beta_state WHERE id=1');const stored=JSON.stringify(row.payload);for(const value of [input.password,temporary,'Fresh123!',proof.verificationToken,code])assert.equal(stored.includes(value),false);
 }finally{globalThis.fetch=originalFetch;await db.close()}
});
test('회원 인증번호는 만료·횟수 제한·메일 실패에 안전하게 처리한다',async()=>{
 const db=await new Postgres().ready(),env:any={...createEnv(db),RESEND_API_KEY:'test',QUOTE_FROM:'hello@g9star.co.kr'},old=globalThis.fetch;let mail:any;
 globalThis.fetch=async(_u:any,init:any)=>{mail=JSON.parse(init.body);return Response.json({id:'mock'});};
 const call=(p:string,b:any)=>worker.fetch(request(p,b),env,context);
 try{
  await call('/v1/member-auth/send-verification',{email:'limits@example.com'});const code=mail.text.match(/인증번호: (\d{6})/)[1];
  for(let i=0;i<5;i++)assert.equal((await call('/v1/member-auth/verify-email',{email:'limits@example.com',code:'999999'===code?'000000':'999999'})).status,422);
  assert.equal((await call('/v1/member-auth/verify-email',{email:'limits@example.com',code})).status,429);
  await call('/v1/member-auth/send-verification',{email:'expired@example.com'});const current=await loadApplication(db,env);(current.app as any).memberPending.find((p:any)=>p.email==='expired@example.com').expiresAt=Date.now()-1;await saveApplication(db,current.app,current.version);
  assert.equal((await call('/v1/member-auth/verify-email',{email:'expired@example.com',code:mail.text.match(/인증번호: (\d{6})/)[1]})).status,422);
  globalThis.fetch=async()=>new Response('{}',{status:500});assert.equal((await call('/v1/member-auth/send-verification',{email:'failed@example.com'})).status,503);
  const state=await loadApplication(db,env);assert.equal((state.app as any).memberPending.some((p:any)=>p.email==='failed@example.com'),false);
 }finally{globalThis.fetch=old;await db.close()}
});
