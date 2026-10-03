import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../../prototype/admin.html',import.meta.url),'utf8'),source=readFileSync(new URL('../../prototype/admin-auth.js',import.meta.url),'utf8').split(' const originalFetch=')[0]+'})();';
test('관리자 페이지는 스크립트 로딩 전에 로그인 화면을 표시하지 않는다',()=>{assert.match(html,/<section[^>]*id="adminLoginPanel"[^>]*hidden/);assert.match(html,/<div class="admin-layout" hidden/);assert.ok(html.indexOf('#adminLoginPanel[hidden]')<html.indexOf('<body'));});
test('메뉴 이동 시 저장된 세션이면 콘솔만 표시하고 없거나 만료되면 로그인만 표시한다',()=>{
 for(const mode of ['valid','anonymous','expired','malformed']){const panel={hidden:true},layout={hidden:true},elements:any={};const site:any={};const session=mode==='anonymous'?null:mode==='malformed'?'bad-json':JSON.stringify({accessToken:'a.b.c',role:'SUPER_ADMIN',user:'admin@example.com'});
 runInNewContext(source,{window:{G9STAR:site},sessionStorage:{getItem:()=>session},atob:()=>JSON.stringify({exp:Math.floor(Date.now()/1000)+(mode==='expired'?-60:3600)}),Date,document:{querySelector:(s:string)=>s==='#adminLoginPanel'?panel:s==='.admin-layout'?layout:elements[s]||(elements[s]={hidden:false,textContent:''})}});
 assert.equal(panel.hidden,mode==='valid');assert.equal(layout.hidden,mode!=='valid');assert.equal(!!site.adminSession,mode==='valid');
 }
});
