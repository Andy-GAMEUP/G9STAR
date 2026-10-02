import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../../prototype/admin.html',import.meta.url),'utf8'),script=readFileSync(new URL('../../prototype/admin-pages.js',import.meta.url),'utf8');
const modules=[...html.matchAll(/data-module="([^"]+)"/g)].map(m=>m[1]);
function render(page:string,role='SUPER_ADMIN',permissions=['*']){
 const session={role},storage=new Map(),links=[...html.matchAll(/<a[^>]*href="(\/admin\?page=[^"]+)"[^>]*>([^<]+)<\/a>/g)].map(m=>({href:'https://example.com'+m[1],textContent:m[2],hidden:false,attributes:{} as any,classList:{toggle(){}},setAttribute(k:string,v:string){this.attributes[k]=v},removeAttribute(k:string){delete this.attributes[k]}}));
 const sections=[...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map(m=>({id:m[1],hidden:false}));const principles={hidden:false};
 const document:any={title:'',querySelectorAll:(q:string)=>q.includes('[data-module]')?modules.map(module=>({dataset:{module}})):q==='.admin-main>section'?sections:links,querySelector:(q:string)=>q==='.admin-principles'?principles:links.find(l=>l.attributes['aria-current']==='page')};
 const site:any={adminSession:session,adminCanRead:(m:string)=>m==='admins'?role==='SUPER_ADMIN':permissions.includes('*')||permissions.includes(m+':read')||permissions.includes(m+':write')};let url='';
 runInNewContext(script,{window:{G9STAR:site},document,URL,location:{href:'https://example.com/admin?page='+page,hash:''},history:{replaceState(_a:any,_b:any,u:string){url=u}},sessionStorage:{setItem(k:string,v:string){storage.set(k,v)}}});return{site,sections,links,storage,url};
}
test('각 업무 URL은 해당 업무 화면만 표시하고 복귀 위치를 저장한다',()=>{for(const module of modules){const view=render(module);assert.equal(view.site.adminPage,module);assert.deepEqual(view.sections.filter(s=>!s.hidden).map(s=>s.id),['operations']);assert.equal(view.url,'/admin?page='+module);assert.equal(view.storage.get('g9star-admin-return-page'),module);assert.ok(view.links.some(l=>l.attributes['aria-current']==='page'&&l.href.endsWith('page='+module)));}});
test('대시보드·감사·귀속·정산 화면은 각각 분리된다',()=>{for(const [page,ids] of Object.entries({dashboard:['dashboard','dashboardMetrics','dashboardPerformance'],audit:['audit'],attribution:['attribution'],ledger:['settlement'],payout:['payout'],'coupon-workflow':['coupon'],'partner-review':['partner']})){const view=render(page);assert.deepEqual(view.sections.filter(s=>!s.hidden).map(s=>s.id),ids);assert.equal(view.site.adminLegacyPage,true);}});
test('권한이 없는 페이지 직접 접근도 허용된 업무 화면으로 돌아간다',()=>{const view=render('admins','CS',['orders:read','members:write']);assert.equal(view.site.adminPage,'orders');assert.equal(view.links.find(l=>l.href.endsWith('page=admins'))?.hidden,true);assert.equal(view.links.find(l=>l.href.endsWith('page=audit'))?.hidden,true);assert.equal(view.links.find(l=>l.href.endsWith('page=members'))?.hidden,false);});
test('프론트 복귀 버튼은 서버에서 확인된 관리자에게만 표시된다',async()=>{
 const source=readFileSync(new URL('../../prototype/beta.js',import.meta.url),'utf8');
 for(const status of [200,401]){const saved=new Map([['g9star-admin-session',JSON.stringify({accessToken:'test-token'})],['g9star-admin-return-page','estimates']]);const elements:any[]=[];
 const document:any={body:{classList:{contains:()=>false},append:(e:any)=>elements.push(e)},addEventListener(){},createElement:()=>({style:{},remove(){elements.splice(elements.indexOf(this),1)}})};
 const site:any={apiBase:'/api'};runInNewContext(source,{document,window:{G9STAR:site,addEventListener(){}},sessionStorage:{getItem:(k:string)=>saved.get(k),removeItem:(k:string)=>saved.delete(k)},fetch:async(url:string)=>url==='/api/config'?Response.json({}):new Response('{}',{status}),URL,alert(){}});
 await new Promise(resolve=>setImmediate(resolve));if(status===200){assert.equal(elements.length,1);assert.equal(elements[0].textContent,'관리자 콘솔로 돌아가기');assert.equal(elements[0].href,'/admin?page=estimates');}else{assert.equal(elements.length,0);assert.equal(saved.has('g9star-admin-session'),false);}
 }
});
