import {Readable} from 'node:stream';
import {DomainError} from '../backend/src/domain.ts';
import {database,loadApplication,saveApplication} from './state.ts';
import {adminRequest} from './admin-accounts.ts';
import {sendQuote} from './email.ts';
const error=(code:string,message:string,status=503,details?:unknown)=>Response.json({error:{code,message,...(details?{details}:{})}},{status,headers:{'cache-control':'no-store'}});
async function invoke(app:any,request:Request,body:ArrayBuffer){
 const url=new URL(request.url);const req=Readable.from(body.byteLength?[Buffer.from(body)]:[]) as any;req.url=url.pathname.slice(4)+url.search;req.method=request.method;req.headers=Object.fromEntries(request.headers);req.headers.host=url.host;
 let status=200,headers:any={},output:any='';const res:any={writeHead:(s:number,h:any)=>{status=s;headers={...headers,...h}},setHeader:(k:string,v:string)=>headers[k]=v,end:(data:any)=>{output=data||''}};
 await app.route(req,res);delete headers['access-control-allow-origin'];headers['cache-control']='no-store';return new Response(status===204?null:output,{status,headers});
}
async function protect(request:Request,env:any,db:any){
 const path=new URL(request.url).pathname;const challenged=['/api/v1/estimates','/api/v1/members','/api/v1/admin/login','/api/v1/admin/password-recovery'].includes(path);
 const ip=request.headers.get('cf-connecting-ip')||'local';const minute=Math.floor(Date.now()/60000),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip))).toString('hex');const key=`${minute}:${hash}:${path}`;
 const [count]=await db.query('INSERT INTO beta_rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=beta_rate_limits.count+1 RETURNING count',[key,Date.now()+120000]);
 if(count.count>(challenged?10:60))throw new DomainError('RATE_LIMITED','요청이 많습니다. 잠시 후 다시 시도해 주세요.',429);
 if(!challenged||env.CHALLENGE_REQUIRED==='false')return;
 if(!env.TURNSTILE_SECRET_KEY)throw new DomainError('CHALLENGE_NOT_CONFIGURED','테스트 사용 준비중입니다. 잠시 후 다시 시도해 주세요.',503);
 let input:any;try{input=await request.clone().json()}catch{throw new DomainError('INVALID_JSON','입력 형식을 확인해 주세요.',400)};
 const token=input.turnstileToken;if(typeof token!=='string'||!token)throw new DomainError('CHALLENGE_REQUIRED','보안 확인을 완료해 주세요.',422);
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:ip})});
 const result:any=await response.json();if(!response.ok||!result.success||!['g9star.co.kr','www.g9star.co.kr',env.BETA_HOSTNAME].filter(Boolean).includes(result.hostname))throw new DomainError('CHALLENGE_FAILED','보안 확인에 실패했습니다. 다시 시도해 주세요.',422);
}
async function flushMail(env:any){
 const db=database(env);
 const {app}=await loadApplication(db,env);const pending=app.backoffice.exportState().data.estimates.map((entry:any)=>entry[1]).filter((q:any)=>q.notificationStatus==='PENDING').slice(0,10);
 for(const quote of pending){let mailId:string;try{mailId=await sendQuote(env,quote)}catch{continue}
  for(let i=0;i<5;i++){const current=await loadApplication(db,env);const row=current.app.backoffice.detail('estimates',quote.id);if(row.notificationStatus==='SENT')break;row.notificationStatus='SENT';row.notificationId=mailId;row.notifiedAt=new Date().toISOString();if(await saveApplication(db,current.app,current.version))break}
 }
}
export default{
 async fetch(request:Request,env:any,ctx:any){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(url.pathname==='/api/config')return Response.json({turnstileSiteKey:env.TURNSTILE_SITE_KEY||'',challengeRequired:env.CHALLENGE_REQUIRED!=='false'},{headers:{'cache-control':'no-store'}});
  if((!env.DATABASE_URL&&!env.TEST_DATABASE)||!env.JWT_SECRET||env.JWT_SECRET.length<32)return error('BETA_NOT_CONFIGURED','베타 서비스 연결을 준비하고 있습니다.');
  try{
   const db=database(env);
   const bodyLimit=url.pathname==='/api/v1/admin/ops/assets'?8*1024*1024:1048576;
   if(!['GET','HEAD','OPTIONS'].includes(request.method)){
    const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return error('ORIGIN_NOT_ALLOWED','허용되지 않은 요청입니다.',403);
    if(Number(request.headers.get('content-length')||0)>bodyLimit)return error('PAYLOAD_TOO_LARGE','요청이 너무 큽니다.',413);
    await protect(request,env,db);
   }
   if(url.pathname==='/api/health'){await db.query('SELECT 1 AS ok');return Response.json({status:'ok',service:'g9star-beta',database:'postgresql',databaseHealthy:true},{headers:{'cache-control':'no-store'}})}
   const body=await request.arrayBuffer();if(body.byteLength>bodyLimit)return error('PAYLOAD_TOO_LARGE','요청이 너무 큽니다.',413);
   const recoveryContext={db};
   for(let attempt=0;attempt<8;attempt++){
    const {app,version}=await loadApplication(db,env);const response=await adminRequest(app,request,env,body,recoveryContext)||await invoke(app,request,body);response.headers.set('cache-control','no-store');if(!response.ok)return response;
    if(request.method==='GET'||request.method==='OPTIONS'||await saveApplication(db,app,version)){
     if(url.pathname==='/api/v1/estimates'&&request.method==='POST')ctx.waitUntil(flushMail(env));return response;
    }
   }
   return error('WRITE_CONFLICT','요청이 겹쳤습니다. 다시 시도해 주세요.',409);
  }catch(e){if(e instanceof DomainError)return error(e.code,e.message,e.status,e.details);console.error('beta request failed',e instanceof Error?e.message:'unknown');return error('SERVICE_UNAVAILABLE','서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.');}
 },
 async scheduled(_event:any,env:any,ctx:any){ctx.waitUntil((async()=>{await flushMail(env);await database(env).query('DELETE FROM beta_rate_limits WHERE expires_at<$1',[Date.now()])})())}
};
