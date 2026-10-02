(function(){
 const message='결제 기능은 준비중입니다. 견적 의뢰를 이용해 주세요.';
 document.addEventListener('click',event=>{
  const target=event.target.closest('button,a,input[type="submit"]');if(!target)return;
  if(target.id==='payButton'||target.matches('[data-payment]')||(/결제|바로\s?구매/.test(target.textContent)&&!document.body.classList.contains('admin-body'))){event.preventDefault();event.stopImmediatePropagation();alert(message)}
 },true);
 window.G9STAR.ready=fetch('/api/config').then(r=>r.ok?r.json():Promise.reject()).catch(()=>({}));
 let challengePromise=null;
 window.G9STAR.challengeToken=async()=>{
  const config=await window.G9STAR.ready;if(!config.turnstileSiteKey){if(config.challengeRequired)throw Error('테스트 사용 준비중입니다. 잠시 후 다시 시도해 주세요.');return ''}
  if(!challengePromise)challengePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>reject(Error('보안 확인을 불러오지 못했습니다.'));document.head.append(script)});
  await challengePromise;
  const container=document.querySelector('dialog[open] #adminRecoveryChallenge')||document.querySelector('#estimateChallenge,#signupChallenge,#adminChallenge');if(!container)throw Error('보안 확인을 표시할 수 없습니다.');
  container.replaceChildren();return new Promise((resolve,reject)=>{window.turnstile.render(container,{sitekey:config.turnstileSiteKey,callback:resolve,'error-callback':()=>reject(Error('보안 확인을 다시 시도해 주세요.')),'expired-callback':()=>reject(Error('보안 확인이 만료됐습니다. 다시 시도해 주세요.'))})});
 };
})();
(function(){
 if(document.body.classList.contains('admin-body'))return;
 let link=null;
 async function refreshAdminReturn(){let session;try{session=JSON.parse(sessionStorage.getItem('g9star-admin-session')||'null')}catch{}if(!session?.accessToken){link?.remove();link=null;return;}
  try{const response=await fetch(window.G9STAR.apiBase+'/v1/admin/session',{headers:{authorization:'Bearer '+session.accessToken},cache:'no-store'});if(!response.ok){link?.remove();link=null;if(response.status===401)sessionStorage.removeItem('g9star-admin-session');return;}
   if(!link){link=document.createElement('a');link.id='adminReturnLink';link.textContent='관리자 콘솔로 돌아가기';link.style.cssText='position:fixed;right:16px;bottom:16px;z-index:50;padding:12px 18px;background:#23231f;color:#fff;border:1px solid #fff;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 16px #0003;max-width:calc(100vw - 32px)';document.body.append(link);}
   link.href='/admin?page='+encodeURIComponent(sessionStorage.getItem('g9star-admin-return-page')||'dashboard');
  }catch{}
 }
 refreshAdminReturn();window.addEventListener('focus',refreshAdminReturn);window.addEventListener('pageshow',refreshAdminReturn);
})();
