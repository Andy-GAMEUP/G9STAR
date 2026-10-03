import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';import worker from '../worker.ts';import {loadApplication} from '../state.ts';
const source=readFileSync(new URL('../../prototype/member-auth.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup(mode:string,mustChangePassword=false){
 const saved=new Map<string,string>(),button:any={disabled:false},form:any={hidden:false,querySelector:()=>button};
 const nodes:any={};for(const name of ['memberEmail','memberPassword','memberPasswordConfirm','memberName','memberPhone','referralCode','termsConsent','privacyConsent','emailCode','sendVerification','verifyEmail','verifyReferral','emailStatus','referralResult','memberAuthStatus','memberRecovery','temporaryPassword','newMemberPassword','confirmMemberPassword','memberPasswordStatus'])nodes['#'+name]={value:'',checked:true,reportValidity:()=>true,textContent:'',append(){}};
 Object.assign(nodes['#memberEmail'],{value:'member@example.com'});nodes['#memberPassword'].value=nodes['#memberPasswordConfirm'].value='Pass123!';nodes['#memberPhone'].value='01012345678';nodes['#emailCode'].value='123456';
 nodes['#memberSignupForm']=mode==='signup'?form:null;nodes['#memberLoginForm']=mode==='login'?form:null;nodes['#memberPasswordForm']={hidden:true,querySelector:()=>button,reset(){}};
 const replacements:string[]=[],requests:any[]=[],location:any={search:'',href:'https://g9star.co.kr/login',assign:(url:string)=>replacements.push(url)};
 const context:any={document:{querySelector:(q:string)=>nodes[q]||null,querySelectorAll:()=>[],createElement:()=>({})},window:{G9STAR:{apiBase:'/api',challengeToken:async()=>''},dispatchEvent(){}},localStorage:{getItem:(key:string)=>saved.get(key),setItem:(key:string,value:string)=>saved.set(key,value),removeItem:(key:string)=>saved.delete(key)},location,URL,URLSearchParams,Event,fetch:async(url:string,init:any)=>{requests.push({url,body:JSON.parse(init.body)});return Response.json(url.endsWith('/verify-email')?{verificationToken:'proof'}:{member:{id:'M-test',firstAttribution:null,currentAttribution:null},accessToken:'token',mustChangePassword});}};context.window.location=location;runInNewContext(readFileSync(new URL('../../prototype/member-ui.js',import.meta.url),'utf8'),context);runInNewContext(source,context);
 return{saved,button,form,nodes,replacements,requests,context};
}
test('인증한 이메일의 동일한 자동입력은 인증을 유지하고 실제 이메일 변경만 무효화한다',async()=>{
 const view=setup('signup');await view.nodes['#verifyEmail'].onclick();view.nodes['#memberEmail'].value=' MEMBER@EXAMPLE.COM ';view.nodes['#memberEmail'].oninput();view.form.onsubmit({preventDefault(){}});await tick();assert.equal(view.requests.at(-1).url,'/api/v1/members');assert.equal(view.replacements.length,1);
 const changed=setup('signup');await changed.nodes['#verifyEmail'].onclick();changed.nodes['#memberEmail'].value='other@example.com';changed.nodes['#memberEmail'].oninput();changed.form.onsubmit({preventDefault(){}});await tick();assert.equal(changed.requests.length,1);assert.equal(changed.replacements.length,0);
});
test('재발송 제한으로 메일을 보내지 않았으면 완료된 인증으로 가입할 수 있다',async()=>{
 const view=setup('signup');await view.nodes['#verifyEmail'].onclick();const original=view.context.fetch;view.context.fetch=async(url:string,init:any)=>url.endsWith('/send-verification')?Response.json({ok:true,sent:false,message:'최근 발송된 인증번호를 확인하세요.'}):original(url,init);await view.nodes['#sendVerification'].onclick();view.form.onsubmit({preventDefault(){}});await tick();assert.equal(view.requests.at(-1).url,'/api/v1/members');assert.equal(view.replacements.length,1);
});
test('이메일 인증 후 추천인 없이 가입하면 세션을 저장하고 홈 문서를 새로 불러온다',async()=>{const view=setup('signup');await view.nodes['#verifyEmail'].onclick();view.form.onsubmit({preventDefault(){}});await tick();assert.deepEqual(view.replacements,['https://g9star.co.kr/']);assert.equal(JSON.parse(view.saved.get('earthplayground-portal-v2')!).token,'token');assert.equal(view.requests.at(-1).body.directCode,'');assert.equal(view.button.disabled,true);});
test('일반 로그인은 홈을 다시 불러오고 임시 비밀번호 로그인은 변경 화면을 유지한다',async()=>{for(const temporary of [false,true]){const view=setup('login',temporary);view.form.onsubmit({preventDefault(){}});await tick();assert.equal(JSON.parse(view.saved.get('earthplayground-portal-v2')!).token,'token');assert.deepEqual(view.replacements,temporary?['/mypage?tab=password']:['https://g9star.co.kr/']);}});
test('화면 스크립트의 인증·선택 추천인 가입·홈 이동·재로그인을 실제 Worker와 PostgreSQL로 연결한다',async()=>{
 const pg=new PGlite(),original=globalThis.fetch,mails:any[]=[],used=new Set<string>();
 process.env.JWT_SECRET='local-test-secret-with-more-than-thirty-two-characters';
 const db={query:async(s:string,args:any[]=[])=> (await pg.query(s,args)).rows},env={TEST_DATABASE:db,JWT_SECRET:process.env.JWT_SECRET,CHALLENGE_REQUIRED:'true',TURNSTILE_SECRET_KEY:'test-secret',TURNSTILE_SITE_KEY:'test-site',RESEND_API_KEY:'test-mail',QUOTE_FROM:'hello@example.com'};
 globalThis.fetch=async(url:any,init:any)=>{const body=JSON.parse(init.body);if(String(url).includes('/siteverify')){const duplicate=used.has(body.response);used.add(body.response);return Response.json({success:!duplicate,hostname:'g9star.co.kr'});}assert.equal(String(url),'https://api.resend.com/emails');mails.push(body);return Response.json({id:'test-mail'});};
 const call=(url:string,init:any={})=>worker.fetch(new Request('https://g9star.co.kr'+url,init),env,{waitUntil(){}});
 function connect(view:any){
  let widget=0;const removed:number[]=[];const container={clientWidth:320,replaceChildren(){}};
  view.context.fetch=call;view.context.document.addEventListener=()=>{};view.context.document.head={append:(script:any)=>queueMicrotask(()=>script.onload())};
  const select=view.context.document.querySelector;view.context.document.querySelector=(s:string)=>s==='#estimateChallenge,#signupChallenge,#adminChallenge'?container:select(s);
  view.context.window.turnstile={render:(_container:any,options:any)=>{const id=widget++;queueMicrotask(()=>options.callback('fresh-token-'+used.size));return id;},remove:(id:number)=>removed.push(id)};
  runInNewContext(readFileSync(new URL('../../prototype/beta.js',import.meta.url),'utf8').split('})();')[0]+'})();',view.context);return removed;
 }
 const until=async(predicate:()=>boolean)=>{const deadline=Date.now()+5000;while(!predicate()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.ok(predicate(),'인증/가입 화면 처리가 완료되어야 함');};
 try{
  await pg.exec(readFileSync(new URL('../migrations/0001_beta.sql',import.meta.url),'utf8'));
  const signup=setup('signup'),removed=connect(signup);
  await signup.nodes['#sendVerification'].onclick();assert.equal(mails.length,1);signup.nodes['#emailCode'].value=mails[0].text.match(/인증번호: (\d{6})/)[1];
  await signup.nodes['#verifyEmail'].onclick();assert.equal(signup.nodes['#emailStatus'].textContent,'이메일 인증이 완료되었습니다.');
  signup.nodes['#memberEmail'].oninput();await signup.nodes['#sendVerification'].onclick();assert.equal(mails.length,1);
  signup.form.onsubmit({preventDefault(){}});await until(()=>signup.replacements.length>0);assert.deepEqual(signup.replacements,['https://g9star.co.kr/']);assert.deepEqual(removed,[0,1,2]);assert.equal(used.size,4);
  const stored=await loadApplication(db,env),accounts=(stored.app as any).memberAccounts;assert.equal(accounts.length,1);assert.equal(accounts[0].email,'member@example.com');assert.equal(stored.app.backoffice.detail('members',accounts[0].memberId).email,accounts[0].email);assert.equal((stored.app as any).memberPending.length,0);
  const session=JSON.parse(signup.saved.get('earthplayground-portal-v2')!);assert.equal((await call('/api/v1/member-auth/session',{headers:{authorization:'Bearer '+session.token}})).status,200);
  const login=setup('login');connect(login);login.form.onsubmit({preventDefault(){}});await until(()=>login.replacements.length>0);assert.deepEqual(login.replacements,['https://g9star.co.kr/']);const logged=JSON.parse(login.saved.get('earthplayground-portal-v2')!);assert.equal((await call('/api/v1/me',{headers:{authorization:'Bearer '+logged.token}})).status,200);
 }finally{globalThis.fetch=original;await pg.close()}
});
test('보안 스크립트 로딩 실패 후에는 재시도에서 새 스크립트를 불러온다',async()=>{
 const view=setup('signup');let attempts=0;const removed:string[]=[];
 view.context.fetch=async()=>Response.json({turnstileSiteKey:'test-site',challengeRequired:true});view.context.document.addEventListener=()=>{};view.context.document.head={append:(script:any)=>queueMicrotask(()=>{attempts++;attempts===1?script.onerror():script.onload()})};view.context.document.createElement=()=>({remove:()=>removed.push('script')});view.context.document.querySelector=()=>({clientWidth:320,replaceChildren(){}});view.context.window.turnstile={render:(_c:any,o:any)=>{queueMicrotask(()=>o.callback('token'));return 1},remove(){}};
 runInNewContext(readFileSync(new URL('../../prototype/beta.js',import.meta.url),'utf8').split('})();')[0]+'})();',view.context);await assert.rejects(view.context.window.G9STAR.challengeToken(),/보안 확인을 불러오지/);assert.equal(await view.context.window.G9STAR.challengeToken(),'token');assert.equal(attempts,2);assert.deepEqual(removed,['script']);
});
