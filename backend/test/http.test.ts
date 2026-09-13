import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const PORT=4211,BASE=`http://127.0.0.1:${PORT}`;
let server:ChildProcess,assetDir:string;
const j=(path:string,init?:RequestInit)=>fetch(BASE+path,init);
const token=async(role:string)=>(await (await j('/dev/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role})})).json()).accessToken;

before(async()=>{
 assetDir=await mkdtemp(join(tmpdir(),'ep-http-'));
 server=spawn(process.execPath,['--experimental-strip-types','src/server.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(PORT),ALLOW_DEV_TOKEN:'true',ASSET_STORAGE_DIR:assetDir},stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await j('/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}
 throw new Error('server did not start');
});
after(async()=>{server?.kill('SIGKILL');await rm(assetDir,{recursive:true,force:true})});

test('health는 저장소 상태를 반환한다',async()=>{const b=await (await j('/health')).json();assert.equal(b.status,'ok');assert.equal(b.database,'memory')});
test('알 수 없는 경로는 404 ROUTE_NOT_FOUND',async()=>{const r=await j('/no-such');assert.equal(r.status,404);assert.equal((await r.json()).error.code,'ROUTE_NOT_FOUND')});
test('OPTIONS 프리플라이트는 204',async()=>{assert.equal((await j('/v1/referrals/validate',{method:'OPTIONS'})).status,204)});
test('잘못된 JSON은 400 INVALID_JSON',async()=>{const r=await j('/v1/referrals/validate',{method:'POST',headers:{'content-type':'application/json'},body:'{oops'});assert.equal(r.status,400);assert.equal((await r.json()).error.code,'INVALID_JSON')});
test('스키마 위반은 422 VALIDATION_ERROR',async()=>{const r=await j('/v1/referrals/validate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,422);assert.equal((await r.json()).error.code,'VALIDATION_ERROR')});
test('추천코드 상태를 코드로 구분한다(중지)',async()=>{const r=await j('/v1/referrals/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'RS-HOLD-PARK'})});assert.equal(r.status,400);assert.equal((await r.json()).error.code,'REFERRAL_SUSPENDED')});
test('correlation-id를 오류 응답에 반영한다',async()=>{const r=await j('/v1/referrals/validate',{method:'POST',headers:{'content-type':'application/json','x-correlation-id':'corr-xyz'},body:'{}'});assert.equal(r.headers.get('x-correlation-id'),'corr-xyz')});
test('관리자 경로는 토큰 없이 401',async()=>{const r=await j('/v1/admin/dashboard');assert.equal(r.status,401);assert.equal((await r.json()).error.code,'UNAUTHENTICATED')});
test('ALLOW_DEV_TOKEN 환경에서 /dev/token 발급',async()=>{const r=await j('/dev/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'OPERATOR'})});assert.equal(r.status,200);assert.ok((await r.json()).accessToken)});
test('회원가입은 고객 토큰을 발급하고, 쿠폰 경로는 인증을 요구한다',async()=>{
 const signup=await (await j('/v1/members',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'A',directCode:'RS-A001-KIM'})})).json();
 assert.ok(signup.accessToken,'accessToken 발급');
 const noAuth=await j('/v1/coupons/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({campaignCode:'PARTNERA10'})});
 assert.equal(noAuth.status,401);
});
test('IDOR: 타 회원 토큰으로는 남의 쿠폰을 예약할 수 없다',async()=>{
 const A=await (await j('/v1/members',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'A',directCode:'RS-A001-KIM'})})).json();
 const B=await (await j('/v1/members',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'B',directCode:'RS-A001-KIM'})})).json();
 const coupon=await (await j('/v1/coupons/register',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${A.accessToken}`},body:JSON.stringify({campaignCode:'PARTNERA10'})})).json();
 // B의 토큰으로 A의 쿠폰 예약 시도 → 서버가 memberId를 토큰(B)에서 도출 → 소유권 불일치
 const cross=await j(`/v1/coupons/${coupon.id}/reserve`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${B.accessToken}`},body:JSON.stringify({eligibleSubtotal:780000,reservationId:'r-x'})});
 assert.equal(cross.status,403);assert.equal((await cross.json()).error.code,'COUPON_NOT_OWNED');
 // A 본인 토큰이면 예약 성공
 const ok=await j(`/v1/coupons/${coupon.id}/reserve`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${A.accessToken}`},body:JSON.stringify({eligibleSubtotal:780000,reservationId:'r-a'})});
 assert.equal(ok.status,200);assert.equal((await ok.json()).status,'RESERVED');
});
