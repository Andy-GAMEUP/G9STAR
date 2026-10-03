(function(){
 const message='결제 기능은 준비중입니다. 견적 의뢰를 이용해 주세요.';
 document.addEventListener('click',event=>{
  const target=event.target.closest('button,a,input[type="submit"]');if(!target)return;
  if(target.matches('[data-notifications]')){event.preventDefault();window.location.assign(target.dataset.notificationUrl||'/mypage?tab=notifications');return;}
  if(target.id==='payButton'||target.matches('[data-payment]')||(/결제|바로\s?구매/.test(target.textContent)&&!document.body.classList.contains('admin-body'))){event.preventDefault();event.stopImmediatePropagation();alert(message)}
 },true);
 window.G9STAR.ready=fetch('/api/config').then(r=>r.ok?r.json():Promise.reject()).catch(()=>({}));
 let challengePromise=null;
 window.G9STAR.challengeToken=async()=>{
  const config=await window.G9STAR.ready;if(!config.turnstileSiteKey){if(config.challengeRequired)throw Error('테스트 사용 준비중입니다. 잠시 후 다시 시도해 주세요.');return ''}
  if(!challengePromise)challengePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>reject(Error('보안 확인을 불러오지 못했습니다.'));document.head.append(script)});
  await challengePromise;
  const container=document.querySelector('dialog[open] #adminRecoveryChallenge')||document.querySelector('#estimateChallenge,#signupChallenge,#adminChallenge');if(!container)throw Error('보안 확인을 표시할 수 없습니다.');
  container.replaceChildren();return new Promise((resolve,reject)=>{window.turnstile.render(container,{sitekey:config.turnstileSiteKey,size:container.clientWidth<300?'compact':'normal',callback:resolve,'error-callback':()=>reject(Error('보안 확인을 다시 시도해 주세요.')),'expired-callback':()=>reject(Error('보안 확인이 만료됐습니다. 다시 시도해 주세요.'))})});
 };
})();
(function(){
 if(document.body.classList.contains('admin-body'))return;
 const nav=document.querySelector('.header-actions[aria-label="사용자 메뉴"]');if(!nav)return;
 const login=nav.querySelector('a[href="login.html"]'),mypage=nav.querySelector('.header-mypage'),bell=nav.querySelector('.header-notifications');let consoleLink=null,logout=null,checking=false;
 function personal(show){if(mypage)mypage.hidden=!show;if(bell)bell.hidden=!show;}
 function clear(){consoleLink?.remove();logout?.remove();consoleLink=logout=null;if(login)login.hidden=false;personal(false);}
 function showLogout(action){if(!logout){logout=document.createElement('button');logout.type='button';logout.className='admin-front-logout';logout.textContent='로그아웃';logout.setAttribute('aria-label','로그아웃');logout.title='로그아웃';nav.append(logout);}logout.onclick=async()=>{logout.disabled=true;try{await action();clear();window.location.assign('/');}catch(e){alert(e.message);if(logout)logout.disabled=false;}};}
 async function refresh(){if(checking)return;checking=true;try{
  let admin;try{admin=JSON.parse(sessionStorage.getItem('g9star-admin-session')||'null')}catch{}
  if(admin?.accessToken){const response=await fetch(window.G9STAR.apiBase+'/v1/admin/session',{headers:{authorization:'Bearer '+admin.accessToken},cache:'no-store'});if(response.ok){if(login)login.hidden=true;personal(true);if(mypage)mypage.hidden=true;if(bell)bell.dataset.notificationUrl='/admin?page=notifications';if(!consoleLink){consoleLink=document.createElement('a');consoleLink.id='adminReturnLink';consoleLink.className='admin-console-icon';consoleLink.setAttribute('aria-label','백오피스 콘솔로 이동');consoleLink.title='백오피스 콘솔로 이동';consoleLink.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M13 13h4M13 17h4"/></svg>';nav.append(consoleLink);}consoleLink.href='/admin?page='+encodeURIComponent(sessionStorage.getItem('g9star-admin-return-page')||'dashboard');showLogout(async()=>{const r=await fetch(window.G9STAR.apiBase+'/v1/admin/logout',{method:'POST',headers:{authorization:'Bearer '+admin.accessToken,'content-type':'application/json'},body:'{}'});if(!r.ok&&r.status!==401)throw Error('로그아웃에 실패했습니다.');sessionStorage.removeItem('g9star-admin-session');});return;}if(response.status===401)sessionStorage.removeItem('g9star-admin-session');}
  let state;try{state=JSON.parse(localStorage.getItem('earthplayground-portal-v2')||'{}')}catch{}if(!state?.token){clear();return;}
  const response=await fetch(window.G9STAR.apiBase+'/v1/member-auth/session',{headers:{authorization:'Bearer '+state.token},cache:'no-store'});if(!response.ok){if(response.status===401)localStorage.removeItem('earthplayground-portal-v2');clear();return;}if(window.G9STAR.member&&window.G9STAR.member.session().token!==state.token)return;const account=await response.json();consoleLink?.remove();consoleLink=null;if(login)login.hidden=true;personal(true);if(mypage)mypage.href='/mypage';if(bell)bell.dataset.notificationUrl='/mypage?tab=notifications';showLogout(async()=>{const r=await fetch(window.G9STAR.apiBase+'/v1/member-auth/logout',{method:'POST',headers:{authorization:'Bearer '+state.token,'content-type':'application/json'},body:'{}'});if(!r.ok&&r.status!==401)throw Error('로그아웃에 실패했습니다.');localStorage.removeItem('earthplayground-portal-v2');});
  if(account.mustChangePassword&&!document.querySelector('#mypagePasswordForm'))window.location.assign('/mypage?tab=password');
 }catch{clear();}finally{checking=false;}}
 personal(false);refresh();window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);window.addEventListener('storage',refresh);window.addEventListener('g9star-member-session',refresh);setInterval(refresh,15000);
})();
