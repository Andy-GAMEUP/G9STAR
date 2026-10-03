import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {DomainError} from '../backend/src/domain.ts';
import {authenticate,issueToken} from '../backend/src/infrastructure/auth.ts';
import {memberPortal} from './member-portal.ts';
import {sendMemberMail} from './email.ts';
import {rejectLogin} from './auth-failure.ts';
const fail=(message:string,status=422,code='VALIDATION_ERROR'):never=>{throw new DomainError(code,message,status)};
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const hash=async(p:string,salt=randomBytes(16).toString('hex'))=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);return salt+':'+Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256)).toString('hex')};
const matches=async(p:string,h:string)=>{const [salt,key]=h.split(':');return timingSafeEqual(Buffer.from((await hash(p,salt)).split(':')[1],'hex'),Buffer.from(key,'hex'))};
const password=(p:any)=>{if(typeof p!=='string'||p.length<8||p.length>200||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p)||!/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(p))fail('비밀번호는 영문·숫자·특수문자를 포함한 8~200자로 입력하세요.');return p};
const email=(s:any)=>{if(typeof s!=='string'||s.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()))fail('이메일을 확인하세요.');return s.trim().toLowerCase()};
const safe=(a:any)=>({id:a.memberId,email:a.email,phone:a.phone,mustChangePassword:!!a.mustChangePassword,emailVerified:true});
async function admit(ctx:any,key:string){if(ctx.admitted!==undefined)return ctx.admitted;const now=Date.now();const rows=await ctx.db.query('INSERT INTO beta_rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=1,expires_at=EXCLUDED.expires_at WHERE beta_rate_limits.expires_at<=$3 RETURNING count',[key+':cooldown',now+60000,now]);ctx.admitted=false;if(rows.length){const [row]=await ctx.db.query('INSERT INTO beta_rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=beta_rate_limits.count+1 RETURNING count',[key+':hour:'+Math.floor(now/3600000),now+7200000]);ctx.admitted=row.count<=3;}return ctx.admitted;}
export async function memberRequest(app:any,request:Request,env:any,body:ArrayBuffer,ctx:any):Promise<Response|null>{
 const path=new URL(request.url).pathname,method=request.method,isAuth=path.startsWith('/api/v1/member-auth/');
 if(path.startsWith('/api/v1/admin/'))return null;
 const accounts=app.memberAccounts,pending=app.memberPending;
 const input=()=>{try{const i=JSON.parse(new TextDecoder().decode(body));if(!i||typeof i!=='object'||Array.isArray(i))fail('입력을 확인하세요.');return i}catch{return fail('입력을 확인하세요.')}};
 const accountResponse=async(a:any)=>({accessToken:await issueToken({sub:a.memberId,role:'CUSTOMER',sessionId:a.sessionId}),member:app.service.db.members.get(a.memberId),...safe(a)});
 const generic=()=>Response.json({ok:true,message:'등록된 이메일이면 임시 비밀번호를 발송합니다. 메일함과 스팸함을 확인하세요.'});
 if(isAuth&&method==='POST'&&['send-verification','verify-email','login','password-recovery'].some(x=>path.endsWith('/'+x))){
  const i=input(),address=email(i.email),account=accounts.find((a:any)=>a.email===address);
  if(path.endsWith('/send-verification')){
   if(account)fail('이미 가입된 이메일입니다. 로그인 또는 비밀번호 찾기를 이용하세요.',409,'EMAIL_EXISTS');
   if(!await admit(ctx,'member-verify:'+digest(address)))return Response.json({ok:true,message:'최근 발송된 인증번호를 확인하세요. 재발송은 1분 간격, 시간당 최대 3회입니다.'});
   if(!ctx.mail)ctx.mail={id:crypto.randomUUID(),code:String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0'),expiresAt:Date.now()+600000};
   if(!ctx.sent){await sendMemberMail(env,address,'이메일 인증번호',`인증번호: ${ctx.mail.code}\n10분 안에 회원가입 화면에 입력하세요.`,ctx.mail.id);ctx.sent=true;}
   for(let n=pending.length-1;n>=0;n--)if(pending[n].email===address||pending[n].expiresAt<Date.now())pending.splice(n,1);
   pending.push({email:address,id:ctx.mail.id,codeHash:digest(ctx.mail.code),expiresAt:ctx.mail.expiresAt});return Response.json({ok:true,message:'인증번호를 발송했습니다. 10분 안에 입력하세요.'});
  }
  if(path.endsWith('/verify-email')){
   const row=pending.find((a:any)=>a.email===address);if(!row||row.expiresAt<Date.now()||row.verified)fail('인증번호가 만료되었거나 이미 사용되었습니다. 다시 발송하세요.');
   const [attempt]=ctx.codeAttempt||await ctx.db.query('INSERT INTO beta_rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=beta_rate_limits.count+1 RETURNING count',['member-code:'+row.id,row.expiresAt]);ctx.codeAttempt=[attempt];
   if(attempt.count>5)fail('인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송하세요.',429,'RATE_LIMITED');
   if(typeof i.code!=='string'||!/^\d{6}$/.test(i.code)||digest(i.code)!==row.codeHash)fail('인증번호가 일치하지 않습니다.');
   ctx.verificationToken ||= randomBytes(32).toString('base64url');row.tokenHash=digest(ctx.verificationToken);row.verified=true;delete row.codeHash;return Response.json({ok:true,verificationToken:ctx.verificationToken});
  }
  if(path.endsWith('/password-recovery')){
   if(!env.RESEND_API_KEY||!env.QUOTE_FROM)fail('메일 발송을 준비 중입니다.',503);
   if(!account||!await admit(ctx,'member-recovery:'+account.memberId))return generic();
   ctx.mail ||= {id:crypto.randomUUID(),password:'Aa1!'+randomBytes(18).toString('base64url'),expiresAt:Date.now()+900000};
   if(!ctx.sent){await sendMemberMail(env,address,'회원 임시 비밀번호',`임시 비밀번호: ${ctx.mail.password}\n15분 이내 https://www.g9star.co.kr/login 에서 로그인한 뒤 새 비밀번호로 변경하세요. 한 번만 사용할 수 있습니다. 직접 요청하지 않았다면 무시하세요. 기존 비밀번호는 임시 비밀번호를 사용하기 전까지 유지됩니다.`,ctx.mail.id);ctx.sent=true;}
   account.recovery={passwordHash:await hash(ctx.mail.password),expiresAt:ctx.mail.expiresAt};return generic();
  }
  const rejected=(reason:string,message='이메일 또는 비밀번호를 확인하세요.',code='INVALID_CREDENTIALS')=>rejectLogin('member',reason,accounts.length,message,code);
  const p=typeof i.password==='string'?i.password:'';if(!p||p.length>200)rejected('invalid_password_input');if(!account)rejected('account_not_found');
  const recovered=account.recovery&&account.recovery.expiresAt>Date.now()&&await matches(p,account.recovery.passwordHash);
  if(recovered){account.passwordHash=account.recovery.passwordHash;account.mustChangePassword=true;account.temporaryPasswordExpiresAt=account.recovery.expiresAt;delete account.recovery;}
  else {
   if(!await matches(p,account.passwordHash))rejected('password_mismatch');
   if(account.mustChangePassword)rejected('recovery_password_consumed','이미 사용한 임시 비밀번호입니다. 로그인된 화면에서 비밀번호를 변경하거나, 비밀번호 찾기로 새 임시 비밀번호를 발급받으세요.','TEMPORARY_PASSWORD_USED');
  }
  if(app.backoffice.detail('members',account.memberId).status!=='ACTIVE')fail('사용할 수 없는 회원 계정입니다.',403);
  account.sessionId=crypto.randomUUID();return Response.json(await accountResponse(account));
 }
 if(path==='/api/v1/members'&&method==='POST'){
  const i=input(),address=email(i.email),p=password(i.password),phone=String(i.phone||'').replace(/[-\s]/g,'');if(!/^01[016789]\d{7,8}$/.test(phone))fail('휴대전화 번호를 확인하세요.');
  if(i.privacyConsent!==true||i.termsConsent!==true)fail('이용약관과 개인정보 수집·이용에 동의해 주세요.');
  if(accounts.some((a:any)=>a.email===address))fail('이미 가입된 이메일입니다.',409,'EMAIL_EXISTS');
  const row=pending.find((a:any)=>a.email===address&&a.verified&&a.expiresAt>Date.now());if(!row||typeof i.verificationToken!=='string'||digest(i.verificationToken)!==row.tokenHash)fail('이메일 인증을 완료해 주세요.',422,'EMAIL_VERIFICATION_REQUIRED');
  const name=typeof i.name==='string'&&i.name.trim()?i.name.trim():address.split('@')[0];if(name.length>100)fail('이름을 확인하세요.');
  const member=app.service.signup({name,linkCode:i.linkCode,directCode:i.directCode},'customer');
  app.backoffice.create('members',{id:member.id,name,email:address,phone,partnerId:member.currentAttribution?.partnerId??null,memberType:'BETA',memos:[],orders:[],estimates:[],rentals:[],status:'ACTIVE'},'customer');
  const a={memberId:member.id,email:address,phone,passwordHash:await hash(p),sessionId:crypto.randomUUID(),emailVerifiedAt:new Date().toISOString(),consent:{terms:true,privacy:true,version:'2026-10-02',at:new Date().toISOString()}};accounts.push(a);pending.splice(pending.indexOf(row),1);return Response.json(await accountResponse(a),{status:201});
 }
 if(!request.headers.get('authorization')){if(isAuth)fail('로그인이 필요합니다.',401,'UNAUTHENTICATED');return null;}
 const principal=await authenticate({headers:Object.fromEntries(request.headers)} as any);if(principal.role!=='CUSTOMER'){if(isAuth)fail('회원 로그인이 필요합니다.',403);return null;}
 const a=accounts.find((a:any)=>a.memberId===principal.sub);if(!a||!principal.sessionId||a.sessionId!==principal.sessionId)fail('회원 로그인이 만료되었습니다. 다시 로그인하세요.',401,'MEMBER_SESSION_ENDED');
 if(app.backoffice.detail('members',a.memberId).status!=='ACTIVE')fail('사용할 수 없는 회원 계정입니다.',403);
 if(a.mustChangePassword&&a.temporaryPasswordExpiresAt<=Date.now())fail('임시 비밀번호가 만료되었습니다. 다시 발급하세요.',401);
 if(a.mustChangePassword&&!['session','password','logout'].some(x=>path==='/api/v1/member-auth/'+x))fail('새 비밀번호로 변경해 주세요.',403,'PASSWORD_CHANGE_REQUIRED');
 if(path.endsWith('/member-auth/session')&&method==='GET')return Response.json(safe(a));
 if(path.endsWith('/member-auth/logout')&&method==='POST'){a.sessionId=null;return Response.json({ok:true});}
 if(path.endsWith('/member-auth/password')&&method==='POST'){const i=input(),p=password(i.newPassword);if(typeof i.currentPassword!=='string'||!await matches(i.currentPassword,a.passwordHash))fail('기존 비밀번호가 일치하지 않습니다.',403);if(await matches(p,a.passwordHash))fail('새 비밀번호를 다르게 입력하세요.');a.passwordHash=await hash(p);a.mustChangePassword=false;delete a.recovery;delete a.temporaryPasswordExpiresAt;a.sessionId=crypto.randomUUID();a.notifications ||= [];a.notifications.unshift({id:crypto.randomUUID(),message:'비밀번호가 변경되었습니다.',createdAt:new Date().toISOString(),read:false});return Response.json(await accountResponse(a));}
 const portal=memberPortal(app,a,path,method,input);if(portal)return portal;
 if(isAuth)fail('요청을 찾을 수 없습니다.',404);return null;
}
