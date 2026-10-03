import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const read=(name:string)=>readFileSync(new URL('../../prototype/'+name,import.meta.url),'utf8');
test('렌탈은 운영 API를 사용하고 빈 목록·조회 실패를 예제 상품으로 대체하지 않는다',async()=>{
 for(const response of [Response.json({items:[]}),new Response('{}',{status:500}),Response.json({items:[{id:'live-rental',name:'실제 상품',category:'테이블',dailyPrice:12300}]})]){const urls:string[]=[],window:any={G9STAR:{apiBase:'/api'}};runInNewContext(read('rental-data.js'),{window,fetch:async(url:string)=>{urls.push(url);return response}});await window.RENTAL.load();assert.equal(urls[0],'/api/v1/rental-items');if(response.status===500){assert.equal(window.RENTAL.all().length,0);assert.ok(window.RENTAL.error)}else{assert.equal(window.RENTAL.all().length,response.status===200&&window.RENTAL.byId('live-rental')?1:0)}assert.equal(window.RENTAL.escape('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');}
});
test('렌탈 견적 요청의 상품번호·이름·수량이 실제 견적 입력에 유지된다',()=>{
 const note={value:''},form={elements:{note},addEventListener(){}},document={querySelectorAll:()=>[],querySelector:(s:string)=>s==='#estimateForm'?form:{}};
 runInNewContext(read('estimate.js'),{document,location:{search:'?rental=R-TEST&name=%ED%85%8C%EC%9D%B4%EB%B8%94&qty=7'},URLSearchParams,crypto:{randomUUID:()=> 'uuid'}});assert.ok(note.value.includes('상품번호: R-TEST'));assert.ok(note.value.includes('수량: 7'));assert.ok(note.value.includes('테이블'));
});
test('만료된 쿠폰은 사용 가능한 쿠폰으로 표시하지 않는다',()=>{
 const source=read('portal.js'),start=source.indexOf('function couponView('),end=source.indexOf('\n const discountFor',start);const context:any={};runInNewContext(source.slice(start,end)+";result=couponView({id:'c',status:'ISSUED',expiresAt:'2000-01-01',amount:50000});",context);assert.equal(context.result.status,'EXPIRED');assert.equal(context.result.amount,50000);
});
test('로그아웃 후 늦게 도착한 쿠폰 응답은 새 세션의 데이터에 저장하지 않는다',async()=>{
 const source=read('portal.js'),start=source.indexOf('async function api('),end=source.indexOf('\n const busy',start);let token='old',removed=false,release:any;
 const context:any={API:'/api',KEY:'portal',load:()=>({token}),fetch:()=>new Promise(r=>release=r),localStorage:{removeItem(){removed=true}},window:{dispatchEvent(){}},Event};runInNewContext(source.slice(start,end)+";result=api('/v1/me',{},true);",context);token='new';release(new Response('{}',{status:401}));await assert.rejects(context.result,/로그인 상태가 변경/);assert.equal(removed,false);
});
test('존재하지 않는 렌탈 상품 ID는 다른 상품으로 바꾸거나 견적 요청을 허용하지 않는다',async()=>{
 const html=read('rental-detail.html'),source=html.split('<script>')[1].split('</script>')[0].replace('(async function(){','result=(async function(){');const elements:any={};const qtyButtons=[{disabled:false}];let listCalled=false;
 const context:any={window:{RENTAL:{loadOne:async()=>null,load:async()=>{listCalled=true;throw Error('fallback not allowed')}}},location:{search:'?id=missing'},URLSearchParams,document:{querySelector:(s:string)=>elements[s]||(elements[s]={textContent:'',disabled:false}),querySelectorAll:()=>qtyButtons}};runInNewContext(source,context);await context.result;assert.equal(listCalled,false);assert.equal(elements['#rdInquiryBtn'].disabled,true);assert.equal(qtyButtons[0].disabled,true);assert.ok(elements['#rdName'].textContent.includes('찾을 수 없습니다'));
});
