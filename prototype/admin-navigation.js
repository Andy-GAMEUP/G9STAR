(function(){
 window.G9STAR.finishAdminLogin=async function(data){
  if(!data.accessToken)throw Error('관리자 로그인 응답을 확인할 수 없습니다.');
  const response=await fetch(window.G9STAR.apiBase+'/v1/admin/session',{headers:{authorization:'Bearer '+data.accessToken},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('관리자 세션 확인에 실패했습니다. 다시 로그인하세요.');
  sessionStorage.setItem('g9star-admin-session',JSON.stringify(data));
  const target='/admin?page='+encodeURIComponent(sessionStorage.getItem('g9star-admin-return-page')||'dashboard');
  const message=document.querySelector('#adminLoginMessage');message.textContent='로그인되었습니다. 콘솔로 이동합니다.';const link=document.createElement('a');link.href=target;link.textContent='관리 콘솔로 이동';message.append(link);
  window.location.assign(target);
 };
})();
