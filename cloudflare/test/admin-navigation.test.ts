import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../prototype/admin-navigation.js',import.meta.url),'utf8');
test('관리자 로그인은 서버 세션 확인 후 저장하고 콘솔 주소로 직접 이동한다',async()=>{for(const status of [200,401]){const saved=new Map([['g9star-admin-return-page','estimates']]),routes:string[]=[],message:any={textContent:'',append(){}},site:any={apiBase:'/api'};
 runInNewContext(source,{window:{G9STAR:site,location:{assign:(url:string)=>routes.push(url)}},sessionStorage:{setItem:(k:string,v:string)=>saved.set(k,v),getItem:(k:string)=>saved.get(k)},document:{querySelector:()=>message,createElement:()=>({})},fetch:async()=>new Response('{}',{status}),AbortSignal});
 if(status===200){await site.finishAdminLogin({accessToken:'token',role:'SUPER_ADMIN'});assert.equal(JSON.parse(saved.get('g9star-admin-session')!).accessToken,'token');assert.deepEqual(routes,['/admin?page=estimates']);}else{await assert.rejects(()=>site.finishAdminLogin({accessToken:'token'}));assert.equal(saved.has('g9star-admin-session'),false);assert.deepEqual(routes,[]);}
}});
