(function(){
 const site=window.G9STAR,session=site.adminSession,operator=['OPERATOR','SUPER_ADMIN'].includes(session?.role);
 const modules=[...document.querySelectorAll('.admin-nav [data-module]')].map(link=>link.dataset.module);
 const legacy={dashboard:['dashboard','dashboardMetrics','dashboardPerformance'],'coupon-workflow':['coupon'],attribution:['attribution'],ledger:['settlement'],payout:['payout'],'partner-review':['partner'],audit:['audit']};
 const allowed=page=>Object.hasOwn(legacy,page)?operator:modules.includes(page)&&site.adminCanRead(page);
 const requested=new URL(location.href).searchParams.get('page')||(location.hash==='#audit'?'audit':location.hash==='#operations'?modules.find(allowed):'dashboard');
 const page=allowed(requested)?requested:operator?'dashboard':modules.find(allowed)||'dashboard';
 site.adminPage=page;site.adminLegacyPage=Object.hasOwn(legacy,page);
 document.querySelectorAll('.admin-main>section').forEach(section=>section.hidden=site.adminLegacyPage?!legacy[page].includes(section.id):section.id!=='operations');
 document.querySelector('.admin-principles').hidden=true;
 document.querySelectorAll('.admin-nav a').forEach(link=>{const target=new URL(link.href).searchParams.get('page');link.hidden=!allowed(target);link.classList.toggle('active',target===page);if(target===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 if(session){const canonical='/admin?page='+encodeURIComponent(page);history.replaceState(null,'',canonical);sessionStorage.setItem('g9star-admin-return-page',page);}
 const titles={dashboard:'대시보드','coupon-workflow':'쿠폰 검증·운영',attribution:'회원 귀속 변경',ledger:'수수료 원장',payout:'월 정산·지급','partner-review':'파트너 재검증',audit:'감사 로그'};
 const current=document.querySelector('.admin-nav a[aria-current="page"]');document.title=(titles[page]||current?.textContent||'관리자')+' | 지구별놀이터';
})();
