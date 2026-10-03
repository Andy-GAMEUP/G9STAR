import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {DomainError} from './domain.ts';
import {createApplication} from './application.ts';
// 개발용 무인증 토큰 발급은 ALLOW_DEV_TOKEN=true 일 때만 활성화한다(기본 비활성).
const DEV_TOKEN_ENABLED=process.env.NODE_ENV!=='production'&&process.env.ALLOW_DEV_TOKEN==='true';
// 운영 배포(개발 토큰 비활성) 시 약한 기본 시크릿으로 조용히 기동하지 않도록 fail-fast 검증한다.
const DEFAULT_JWT_SECRET='development-only-change-me-32-characters',DEFAULT_WEBHOOK_SECRET='development-webhook-secret';
if(!DEV_TOKEN_ENABLED){
 const problems:string[]=[];
 if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32||process.env.JWT_SECRET===DEFAULT_JWT_SECRET)problems.push('JWT_SECRET(32자 이상, 기본값 불가)');
 if(!process.env.MEDUSA_WEBHOOK_SECRET||process.env.MEDUSA_WEBHOOK_SECRET===DEFAULT_WEBHOOK_SECRET)problems.push('MEDUSA_WEBHOOK_SECRET(기본값 불가)');
 if(problems.length){console.error(`[보안] 필수 시크릿 누락으로 기동을 중단합니다: ${problems.join(', ')}. 로컬 개발은 ALLOW_DEV_TOKEN=true 로 실행하세요.`);process.exit(1)}
}
if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL){throw new Error('운영 환경에는 DATABASE_URL이 필요합니다.')}
const {route,database}=await createApplication({devTokens:DEV_TOKEN_ENABLED,payments:process.env.PAYMENTS_ENABLED==='true',adminLogin:process.env.ADMIN_LOGIN,adminPassword:process.env.ADMIN_PASSWORD});
const server=createServer((req,res)=>route(req,res).catch(error=>{const e=error instanceof DomainError?error:new DomainError('INTERNAL_ERROR','서버 오류가 발생했습니다.',500),correlationId=String(req.headers['x-correlation-id']||randomUUID());res.setHeader('x-correlation-id',correlationId);res.writeHead(e.status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:{code:e.code,message:e.message,details:e.details??null,correlationId}}))}));
const port=Number(process.env.PORT||4100);server.listen(port,()=>console.log(`earthplayground backend listening on :${port} (${database.mode})`));
const shutdown=async()=>{server.close();await database.close()};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
