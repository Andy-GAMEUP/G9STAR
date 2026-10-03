import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pbkdf2Sync} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import worker from '../worker.ts';
const sql=readFileSync(new URL('../scripts/reset-master-password.sql',import.meta.url),'utf8');
process.env.JWT_SECRET='local-test-secret-with-more-than-thirty-two-characters';
test('마스터 재설정 SQL은 Worker 암호 형식과 일치하고 기존 회원·보조관리자를 보존한다',async()=>{
 const pg=new PGlite();const db={query:async(s:string,args:any[]=[])=> (await pg.query(s,args)).rows};
 const env={TEST_DATABASE:db,JWT_SECRET:process.env.JWT_SECRET,ADMIN_LOGIN:'master@example.com',ADMIN_PASSWORD:'Old123!a',CHALLENGE_REQUIRED:'false'};
 const call=(path:string,body?:any,token?:string)=>worker.fetch(new Request('https://g9star.co.kr/api/v1/admin'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});
 try{
  await pg.exec(readFileSync(new URL('../migrations/0001_beta.sql',import.meta.url),'utf8'));
  const old:any=await(await call('/login',{login:env.ADMIN_LOGIN,password:env.ADMIN_PASSWORD})).json();
  assert.equal((await call('/ops/admins',{email:'helper@example.com',name:'보조관리자',role:'OPERATOR',password:'Helper123!'},old.accessToken)).status,201);
  for(const password of ['Next123!','유니코드A1!'+ '가'.repeat(30)]){
   const before:any=(await db.query('SELECT payload,version FROM beta_state WHERE id=1'))[0];
   await pg.exec(sql.replace("trim('MASTER_EMAIL_HERE')","trim('"+env.ADMIN_LOGIN+"')").replace('$password$NEW_PASSWORD_HERE$password$','$password$'+password+'$password$'));
   const after:any=(await db.query('SELECT payload,version FROM beta_state WHERE id=1'))[0],master=after.payload.adminAccounts[0];
   const [salt,key]=master.passwordHash.split(':');assert.equal(key,pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'));
   assert.deepEqual(after.payload.adminAccounts[1],before.payload.adminAccounts[1]);
   for(const key of Object.keys(before.payload).filter(k=>k!=='adminAccounts'))assert.deepEqual(after.payload[key],before.payload[key]);
   assert.equal((await call('/session',undefined,old.accessToken)).status,401);
   const login=await call('/login',{login:env.ADMIN_LOGIN,password});assert.equal(login.status,200);const account:any=await login.json();assert.equal(account.role,'SUPER_ADMIN');
   assert.equal((await call('/ops/admins',undefined,account.accessToken)).status,200);
  }
  const stable:any=(await db.query('SELECT payload,version FROM beta_state WHERE id=1'))[0];
  await assert.rejects(()=>pg.exec(sql.replace("trim('MASTER_EMAIL_HERE')","trim('"+env.ADMIN_LOGIN+"')")),/Use 8-200/);
  await assert.rejects(()=>pg.exec(sql.replace("trim('MASTER_EMAIL_HERE')","trim('absent@example.com')").replace('$password$NEW_PASSWORD_HERE$password$','$password$Next123!$password$')),/exactly one existing/);
  assert.deepEqual((await db.query('SELECT payload,version FROM beta_state WHERE id=1'))[0],stable);
 }finally{await pg.close()}
});
