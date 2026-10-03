import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {DomainError} from '../backend/src/domain.ts';
import {authenticate,issueToken} from '../backend/src/infrastructure/auth.ts';
import {sendAdminTemporaryPassword} from './email.ts';
import {rejectLogin} from './auth-failure.ts';
const roles=['OPERATOR','MD','CS','FINANCE'];
const fail=(message:string,status=422,code='VALIDATION_ERROR'):never=>{throw new DomainError(code,message,status)};
const hash=async(password:string,salt=randomBytes(16).toString('hex'))=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);return `${salt}:${Buffer.from(bits).toString('hex')}`};
const matches=async(password:string,value:string)=>{const [salt,key]=value.split(':');return timingSafeEqual(Buffer.from((await hash(password,salt)).split(':')[1],'hex'),Buffer.from(key,'hex'))};
const equal=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
const password=(value:any)=>{if(typeof value!=='string'||value.length<8||value.length>200||!/[A-Za-z]/.test(value)||!/[0-9]/.test(value)||!/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(value))fail('비밀번호는 영문·숫자·특수문자를 모두 포함한 8~200자로 입력하세요.');return value};
const text=(value:any,label:string,max=100)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label}을 확인하세요.`);return value.trim()};
const safe=(a:any)=>{const {passwordHash,sessionId,recovery,temporaryPasswordExpiresAt,...publicData}=a;return publicData};
export async function adminRequest(app:any,request:Request,env:any,body:ArrayBuffer,recoveryContext:any={}):Promise<Response|null>{
 const path=new URL(request.url).pathname,method=request.method;
 const adminPath=path.startsWith('/api/v1/admin/');
 if(!adminPath&&!request.headers.get('authorization'))return null;
 const state=app.adminAccounts;
 const input=()=>{try{const value=JSON.parse(new TextDecoder().decode(body));if(!value||typeof value!=='object'||Array.isArray(value))return fail('입력 형식을 확인하세요.');return value}catch{return fail('입력 형식을 확인하세요.')}};
 if(path==='/api/v1/admin/password-recovery'&&method==='POST'){
  const i=input(),email=text(i.email,'관리자 이메일').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('이메일을 확인하세요.');
  if(!env.RESEND_API_KEY||!env.QUOTE_FROM)fail('메일 발송을 준비 중입니다. 관리자에게 문의하세요.',503,'EMAIL_NOT_CONFIGURED');
  const result=()=>Response.json({ok:true,message:'등록된 관리자 이메일이면 임시 비밀번호를 발송합니다. 메일함과 스팸함을 확인하세요.'});
  const account=state.find((a:any)=>a.email===email&&a.status==='ACTIVE');if(!account)return result();
  if(recoveryContext.admitted===undefined){const now=Date.now();const cooldown=await recoveryContext.db.query('INSERT INTO beta_rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=1,expires_at=EXCLUDED.expires_at WHERE beta_rate_limits.expires_at<=$3 RETURNING count',[`admin-recovery:${account.id}:cooldown`,now+60000,now]);recoveryContext.admitted=false;if(cooldown.length){const [row]=await recoveryContext.db.query('INSERT INTO beta_rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=beta_rate_limits.count+1 RETURNING count',[`admin-recovery:${account.id}:hour:${Math.floor(now/3600000)}`,now+7200000]);recoveryContext.admitted=row.count<=3;}}

  if(!recoveryContext.admitted)return result();
  if(!recoveryContext.credential)recoveryContext.credential={id:crypto.randomUUID(),password:'Aa1!'+randomBytes(18).toString('base64url'),expiresAt:Date.now()+900000};
  const credential=recoveryContext.credential;
  if(!recoveryContext.mailSent){try{await sendAdminTemporaryPassword(env,account.email,credential.password,credential.id);recoveryContext.mailSent=true}catch{fail('임시 비밀번호 메일을 발송하지 못했습니다. 잠시 후 다시 시도하세요.',503,'EMAIL_SEND_FAILED')}}
  account.recovery={id:credential.id,passwordHash:await hash(credential.password),expiresAt:credential.expiresAt};app.service.db.log('ADMIN_RECOVERY_REQUESTED',account.id,{requestId:credential.id});return result();
 }
 if(path==='/api/v1/admin/login'&&method==='POST'){
  const i=input(),login=text(i.login,'로그인 ID').toLowerCase(),p=typeof i.password==='string'?i.password:'';
  const rejected=(reason:string,message='로그인 정보를 확인하세요.',code='INVALID_CREDENTIALS')=>rejectLogin('admin',reason,state.length,message,code);
  if(!p||p.length>200)rejected('invalid_password_input');
  let account=state.find((a:any)=>a.email===login);
  if(!account){
   const master=String(env.ADMIN_LOGIN||'').trim().toLowerCase();
   if(login!==master||state.some((a:any)=>a.role==='SUPER_ADMIN'))rejected('account_not_found');
   if(!env.ADMIN_PASSWORD)rejected('bootstrap_password_not_configured');
   if(!equal(p,env.ADMIN_PASSWORD))rejected('bootstrap_password_mismatch');
   account={id:crypto.randomUUID(),email:master,name:'마스터 관리자',role:'SUPER_ADMIN',status:'ACTIVE',passwordHash:await hash(p),createdAt:new Date().toISOString()};state.push(account);
  }else{
   if(account.status!=='ACTIVE')rejected('inactive_account');
   if(account.expiresAt!==undefined&&account.expiresAt<=Date.now())rejected('expired_account');
   const recovered=account.recovery&&account.recovery.expiresAt>Date.now()&&await matches(p,account.recovery.passwordHash);
   if(recovered){account.passwordHash=account.recovery.passwordHash;account.temporaryPasswordExpiresAt=account.recovery.expiresAt;account.mustChangePassword=true;delete account.recovery;app.service.db.log('ADMIN_RECOVERY_USED',account.id,{})}
   else {
    if(!await matches(p,account.passwordHash))rejected('password_mismatch');
    if(account.mustChangePassword)rejected('recovery_password_consumed','이미 사용한 임시 비밀번호입니다. 로그인된 화면에서 비밀번호를 변경하거나, 비밀번호 찾기로 새 임시 비밀번호를 발급받으세요.','TEMPORARY_PASSWORD_USED');
   }
  }
  account.sessionId=crypto.randomUUID();account.lastLoginAt=new Date().toISOString();app.service.db.log('ADMIN_LOGIN',account.id,{email:account.email});
  return Response.json({accessToken:await issueToken({sub:account.id,role:account.role,sessionId:account.sessionId}),role:account.role,user:account.email,mustChangePassword:!!account.mustChangePassword,permissions:app.backoffice.roleMatrix[account.role]||[]});
 }
 const principal=await authenticate({headers:Object.fromEntries(request.headers)} as any);
 if(!adminPath&&principal.role==='CUSTOMER')return null;
 if(principal.role==='CUSTOMER')fail('권한이 없습니다.',403,'FORBIDDEN');
 const account=state.find((a:any)=>a.id===principal.sub);
 if(!account||account.status!=='ACTIVE'||(account.expiresAt!==undefined&&account.expiresAt<=Date.now())||!principal.sessionId||principal.sessionId!==account.sessionId||principal.role!==account.role)fail('다른 곳에서 로그인했거나 세션이 종료되었습니다. 다시 로그인하세요.',401,'ADMIN_SESSION_ENDED');
 if(account.mustChangePassword&&account.temporaryPasswordExpiresAt<=Date.now())fail('임시 비밀번호가 만료되었습니다. 다시 발급받으세요.',401,'ADMIN_SESSION_ENDED');
 if(account.mustChangePassword&&!['/api/v1/admin/session','/api/v1/admin/logout','/api/v1/admin/password'].includes(path))fail('새 비밀번호로 변경한 후 관리자 기능을 사용할 수 있습니다.',403,'PASSWORD_CHANGE_REQUIRED');
 if(!adminPath)return null;
 if(path==='/api/v1/admin/session'&&method==='GET')return Response.json(safe(account));
 if(path==='/api/v1/admin/logout'&&method==='POST'){account.sessionId=null;app.service.db.log('ADMIN_LOGOUT',account.id,{});return Response.json({ok:true})}
 if(path==='/api/v1/admin/password'&&method==='POST'){
  const i=input();if(typeof i.currentPassword!=='string'||!await matches(i.currentPassword,account.passwordHash))fail('현재 비밀번호가 일치하지 않습니다.',403,'INVALID_CREDENTIALS');
  const next=password(i.newPassword);if(await matches(next,account.passwordHash))fail('기존 비밀번호와 다른 비밀번호를 입력하세요.');account.passwordHash=await hash(next);account.sessionId=null;account.mustChangePassword=false;delete account.recovery;delete account.temporaryPasswordExpiresAt;app.service.db.log('ADMIN_PASSWORD_CHANGED',account.id,{});return Response.json({ok:true});
 }
 const base='/api/v1/admin/ops/admins';
 if(!path.startsWith(base))return null;
 if(account.role!=='SUPER_ADMIN')fail('마스터 관리자만 계정을 관리할 수 있습니다.',403,'FORBIDDEN');
 if(path===base&&method==='GET'){
  const q=new URL(request.url).searchParams;let items=state.map(safe).filter((a:any)=>(!q.get('status')||a.status===q.get('status'))&&(!q.get('q')||(a.name+' '+a.email).toLowerCase().includes(q.get('q')!.toLowerCase())));
  const page=Math.max(1,Number(q.get('page'))||1),pageSize=Math.min(100,Math.max(1,Number(q.get('pageSize'))||20));return Response.json({items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize,totalPages:Math.ceil(items.length/pageSize)});
 }
 if(path===base&&method==='POST'){
  const i=input(),email=text(i.email,'이메일').toLowerCase(),name=text(i.name,'이름');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('이메일을 확인하세요.');if(state.some((a:any)=>a.email===email))fail('이미 등록된 이메일입니다.',409);
  if(!roles.includes(i.role))fail('관리자 권한을 확인하세요.');const a={id:crypto.randomUUID(),email,name,role:i.role,status:'ACTIVE',passwordHash:await hash(password(i.password)),createdAt:new Date().toISOString(),sessionId:null};state.push(a);app.service.db.log('ADMIN_CREATED',account.id,{id:a.id,email:a.email,role:a.role});return Response.json(safe(a),{status:201});
 }
 const match=path.slice(base.length).match(/^\/([^/]+)(?:\/(update|status|reset-password))?$/);
 if(match){const target=state.find((a:any)=>a.id===decodeURIComponent(match[1]));if(!target)fail('관리자를 찾을 수 없습니다.',404);
  if(method==='GET'&&!match[2])return Response.json(safe(target));
  if(method==='POST'){
   const i=input();if(target.role==='SUPER_ADMIN')fail('마스터 계정은 상단 비밀번호 변경에서 관리하세요.',403,'FORBIDDEN');
   if(match[2]==='update'){target.name=text(i.name,'이름');if(!roles.includes(i.role))fail('권한을 확인하세요.');target.role=i.role;target.sessionId=null}
   else if(match[2]==='status'){if(!['ACTIVE','SUSPENDED'].includes(i.status))fail('상태를 확인하세요.');target.status=i.status;target.sessionId=null}
   else if(match[2]==='reset-password'){target.passwordHash=await hash(password(i.password));target.sessionId=null;target.mustChangePassword=false;delete target.temporaryPasswordExpiresAt}
   else fail('지원하지 않는 작업입니다.',404);
   delete target.recovery;target.updatedAt=new Date().toISOString();app.service.db.log('ADMIN_'+match[2].toUpperCase().replace('-','_'),account.id,{id:target.id,role:target.role,status:target.status});return Response.json(safe(target));
  }
 }
 fail('관리자 계정은 개별 추가·수정·사용 중지 기능으로 관리하세요.',422);
}
