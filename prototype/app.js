const menu=document.querySelector('.menu'),nav=document.querySelector('#nav');
if(menu&&nav)menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!open));nav.classList.toggle('open',!open)});
document.querySelectorAll('.hotspot,[data-product]').forEach(point=>{point.addEventListener('click',()=>{const card=document.querySelector('.hotspot-card');if(card&&point.dataset.product)card.textContent=point.dataset.product});point.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();point.click()}})});
document.querySelectorAll('.filters button').forEach(button=>button.addEventListener('click',()=>{document.querySelector('.filters .active')?.classList.remove('active');button.classList.add('active');const filter=button.dataset.filter;document.querySelectorAll('.space-card[data-kind]').forEach(card=>{card.hidden=filter!=='all'&&card.dataset.kind!==filter})}));
const quoteForm=document.querySelector('.quote form');if(quoteForm)quoteForm.addEventListener('submit',event=>{event.preventDefault();event.currentTarget.querySelector('.form-note').textContent='프로토타입 접수가 완료되었습니다.'});
(async()=>{
 const API=(localStorage.getItem('earthplayground-api')||'http://127.0.0.1:4100').replace(/\/$/,'');
 const src=u=>!u?'':(/^https?:\/\//.test(u)?u:(u.startsWith('/uploads/')?API+u:u));
 const cards=document.querySelectorAll('.showcase-six .figma-space-card');
 if(cards.length){try{const data=await fetch(API+'/v1/showcases').then(r=>r.json());(data.items||[]).slice(0,cards.length).forEach((s,i)=>{const card=cards[i];card.href='showcase.html?id='+encodeURIComponent(s.id);const img=card.querySelector('img');if(img&&s.imageUrl){img.src=src(s.imageUrl);img.alt=s.title}const h3=card.querySelector('h3');if(h3)h3.textContent=s.title;const p=card.querySelector('p');if(p)p.textContent='실제 등록 매장'})}catch(e){}}
 const grid=document.querySelector('.figma-product-grid');
 if(grid){try{const data=await fetch(API+'/v1/products').then(r=>r.json());const anchors=grid.querySelectorAll('a');(data.items||[]).slice(0,anchors.length).forEach((p,i)=>{const a=anchors[i];a.href='product.html?id='+encodeURIComponent(p.id);const img=a.querySelector('img');if(img&&p.images&&p.images[0]){img.src=src(p.images[0]);img.alt=p.name}const h3=a.querySelector('h3');if(h3)h3.textContent=p.name;const price=a.querySelector('.price');if(price)price.textContent=Number(p.salePrice).toLocaleString('ko-KR')+'원'})}catch(e){}}
})();
