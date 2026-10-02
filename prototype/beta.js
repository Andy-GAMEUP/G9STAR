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
 const nav=document.querySelector('.partner-bar nav[aria-label="사용자 메뉴"]');if(!nav)return;
 const login=nav.querySelector('a[href="signup.html"]');let consoleLink=null,logout=null,checking=false;
 function clear(){consoleLink?.remove();logout?.remove();consoleLink=logout=null;if(login)login.hidden=false;}
 async function refreshAdminReturn(){if(checking)return;checking=true;try{let session;try{session=JSON.parse(sessionStorage.getItem('g9star-admin-session')||'null')}catch{}if(!session?.accessToken){clear();return;}
  const response=await fetch(window.G9STAR.apiBase+'/v1/admin/session',{headers:{authorization:'Bearer '+session.accessToken},cache:'no-store'});
  if(!response.ok){clear();if(response.status===401)sessionStorage.removeItem('g9star-admin-session');return;}
  if(login)login.hidden=true;
  if(!consoleLink){consoleLink=document.createElement('a');consoleLink.id='adminReturnLink';consoleLink.className='admin-console-icon';consoleLink.setAttribute('aria-label','백오피스 콘솔로 이동');consoleLink.title='백오피스 콘솔로 이동';consoleLink.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M13 13h4M13 17h4"/></svg>';nav.append(consoleLink);
   logout=document.createElement('button');logout.type='button';logout.className='admin-front-logout';logout.textContent='로그아웃';logout.onclick=async()=>{logout.disabled=true;try{const result=await fetch(window.G9STAR.apiBase+'/v1/admin/logout',{method:'POST',headers:{authorization:'Bearer '+session.accessToken,'content-type':'application/json'},body:'{}'});if(!result.ok&&result.status!==401)throw Error('로그아웃하지 못했습니다. 다시 시도해 주세요.');sessionStorage.removeItem('g9star-admin-session');clear();}catch(error){alert(error.message);if(logout)logout.disabled=false;}};nav.append(logout);
  }
  consoleLink.href='/admin?page='+encodeURIComponent(sessionStorage.getItem('g9star-admin-return-page')||'dashboard');
 }catch{clear();}finally{checking=false;}}
 refreshAdminReturn();window.addEventListener('focus',refreshAdminReturn);window.addEventListener('pageshow',refreshAdminReturn);setInterval(refreshAdminReturn,15000);
})();
