const showcaseConfigs={
 cafe:{title:'성수동 내추럴 카페',breadcrumb:'카페 › Natural › 성수동 18평 카페',subtitle:'카페 · 18평 · Natural · 사용제품 12개',image:'assets/store-hero.png',products:[['우드 체어 W-102','78,000원 · 렌탈 월 15,000원~'],['오크 원형 테이블 T-201','420,000원 · 렌탈 월 34,000원~'],['아워 펜던트 조명 L-301','189,000원'],['바 스툴 C-114','69,000원 · 렌탈 가능'],['오크 진열장 S-402','견적 상품']]},
 bakery:{title:'연남 모닝 베이커리',breadcrumb:'베이커리 › Warm Natural › 연남동 22평',subtitle:'베이커리 · 22평 · Warm Natural · 사용제품 15개',image:'assets/bakery-showcase.png',products:[['오크 곡면 진열대 D-220','1,280,000원 · 주문 제작'],['내추럴 바 스툴 C-114','69,000원 · 렌탈 가능'],['린넨 펜던트 조명 L-318','159,000원'],['모듈 선반 S-410','680,000원'],['세라믹 사이드 테이블','128,000원']]},
 ramen:{title:'을지로 카운터 라멘',breadcrumb:'일본 라멘 › Japanese Modern › 을지로 14평',subtitle:'일본 라멘 식당 · 14평 · Japanese Modern · 사용제품 11개',image:'assets/ramen-showcase.png',products:[['애쉬 카운터 스툴 C-221','89,000원 · 렌탈 가능'],['원목 카운터 바 T-510','2,400,000원 · 주문 제작'],['와시 펜던트 조명 L-402','179,000원'],['블랙 서비스 선반 S-421','590,000원'],['입구 벤치 B-108','320,000원']]},
 salon:{title:'한남 소프트 살롱',breadcrumb:'미용실 › Soft Neutral › 한남동 18평',subtitle:'미용실 · 18평 · Soft Neutral · 사용제품 9개',image:'assets/salon-showcase.png',products:[['컴포트 스타일링 체어 C-610','490,000원 · 렌탈 가능'],['오크 스타일링 콘솔 T-620','780,000원'],['오가닉 라인 미러 M-105','320,000원'],['볼 월 라이트 L-430','129,000원'],['대기 벤치 B-220','460,000원']]},
 retail:{title:'망원 라이프스타일 숍',breadcrumb:'리테일 › Curated Minimal › 망원동 20평',subtitle:'리테일 · 20평 · Curated Minimal · 사용제품 14개',image:'assets/retail-showcase.png',products:[['모듈 디스플레이 테이블 D-510','620,000원'],['블랙 행거 시스템 H-210','390,000원'],['오크 월 선반 S-520','480,000원'],['트랙 스포트 조명 L-510','89,000원'],['카운터 데스크 T-540','1,180,000원']]},
 office:{title:'성수 크리에이티브 오피스',breadcrumb:'오피스 › Warm Workscape › 성수동 28평',subtitle:'오피스 · 28평 · Warm Workscape · 사용제품 18개',image:'assets/office-showcase.png',products:[['10인 워크 테이블 T-710','2,800,000원 · 렌탈 가능'],['메시 태스크 체어 C-720','280,000원 · 렌탈 가능'],['어쿠스틱 펜던트 L-710','240,000원'],['모듈 스토리지 S-730','920,000원'],['라운지 소파 B-710','1,480,000원']]}
};
const API=(localStorage.getItem('earthplayground-api')||'http://127.0.0.1:4100').replace(/\/$/,'');
const params=new URLSearchParams(location.search),apiId=params.get('id');
const imgSrc=u=>!u?'':(/^https?:\/\//.test(u)?u:(u.startsWith('/uploads/')?API+u:u));
const wonText=n=>n==null?'견적 상품':'₩'+Number(n).toLocaleString('ko-KR');
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fetchJson=async path=>{const r=await fetch(API+path);if(!r.ok){let m='요청에 실패했습니다.';try{m=(await r.json()).error?.message||m}catch{}throw new Error(m)}return r.json()};
const showToast=message=>{const toast=document.querySelector('.toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200)};

const showcasePhoto=document.querySelector('.showcase-photo');
const productBuy=document.querySelector('.product-buy');

// ------- 장바구니/관심공간 공통 -------
const readCart=()=>{try{return JSON.parse(localStorage.getItem('earthplayground-cart')||'[]')}catch{return[]}};
const addToCart=(name,price,space)=>{const cart=readCart(),item=cart.find(e=>e.name===name);if(item)item.quantity+=1;else cart.push({name,price,quantity:1,space});localStorage.setItem('earthplayground-cart',JSON.stringify(cart));return cart.reduce((s,e)=>s+e.quantity,0)};

// ------- 상품 상세: 선택 카드 갱신 -------
const applySelection=(name,price,productId)=>{const card=document.querySelector('.selection-card');if(!card)return;card.querySelector('strong').textContent=name;card.querySelector('small').textContent=price;const link=card.querySelector('a.compact-button');if(link&&productId)link.setAttribute('href','product.html?id='+encodeURIComponent(productId))};

function bindQuantity(){let quantity=1;document.querySelectorAll('[data-qty]').forEach(button=>button.addEventListener('click',()=>{quantity=Math.max(1,quantity+(button.dataset.qty==='plus'?1:-1));const q=document.querySelector('#qty');if(q)q.textContent=quantity}))}

// ================= 쇼케이스 페이지 =================
if(showcasePhoto){
 if(apiId){renderShowcaseFromApi(apiId)}else{renderShowcaseFromConfig()}
}

function renderShowcaseFromConfig(){
 const key=new URLSearchParams(location.search).get('space')||'cafe',config=showcaseConfigs[key]||showcaseConfigs.cafe,selection=document.querySelector('.selection-card');
 document.title=config.title+' | 지구별놀이터';document.querySelector('#showcaseTitle').textContent=config.title;document.querySelector('#showcaseBreadcrumbs').textContent=config.breadcrumb;document.querySelector('#showcaseSubtitle').textContent=config.subtitle;showcasePhoto.style.backgroundImage=`url('${config.image}')`;
 document.querySelectorAll('.thumb').forEach(thumb=>thumb.style.backgroundImage=`url('${config.image}')`);document.querySelector('.selection-thumb').style.backgroundImage=`url('${config.image}')`;
 document.querySelectorAll('.scene-hotspot').forEach((point,index)=>{const product=config.products[index];point.dataset.name=product[0];point.dataset.price=product[1]});
 [...document.querySelectorAll('.product-grid>a,.product-grid>article')].forEach((card,index)=>{const product=config.products[index];if(!product)return;card.querySelector('h3').textContent=product[0];card.querySelector('.price').textContent=product[1].split(' · ')[0]});
 selection.querySelector('strong').textContent=config.products[0][0];selection.querySelector('small').textContent=config.products[0][1];document.querySelector('#spaceEstimateLink').href=`estimate.html?space=${key}`;
 bindFavorite(key,config.title,config.image);bindShowcaseInteractions();
}

async function renderShowcaseFromApi(id){
 try{
  const s=await fetchJson('/v1/showcases/'+encodeURIComponent(id));
  document.title=s.title+' | 지구별놀이터';
  document.querySelector('#showcaseTitle').textContent=s.title;
  document.querySelector('#showcaseBreadcrumbs').textContent='매장 쇼케이스 › '+s.title;
  document.querySelector('#showcaseSubtitle').textContent='사용제품 '+s.hotspots.length+'개 · 실제 등록 매장';
  const src=imgSrc(s.imageUrl);
  if(src){showcasePhoto.style.backgroundImage=`url('${src}')`;document.querySelectorAll('.thumb').forEach(t=>t.style.backgroundImage=`url('${src}')`);const st=document.querySelector('.selection-thumb');if(st)st.style.backgroundImage=`url('${src}')`}
  showcasePhoto.querySelectorAll('.scene-hotspot').forEach(el=>el.remove());
  s.hotspots.forEach((h,i)=>{const b=document.createElement('button');b.className='scene-hotspot';b.style.left=h.x+'%';b.style.top=h.y+'%';b.textContent=String(i+1);b.dataset.name=h.product.name;b.dataset.price=h.product.salePrice!=null?wonText(h.product.salePrice):'견적 상품';b.dataset.pid=h.product.id;b.addEventListener('click',()=>applySelection(b.dataset.name,b.dataset.price,b.dataset.pid));showcasePhoto.appendChild(b)});
  const first=s.hotspots[0];if(first)applySelection(first.product.name,first.product.salePrice!=null?wonText(first.product.salePrice):'견적 상품',first.product.id);
  const grid=document.querySelector('.product-grid');
  if(grid)grid.innerHTML=s.hotspots.map(h=>{const p=h.product,price=p.salePrice!=null?wonText(p.salePrice):'견적 상품',bg=p.images&&p.images[0]?`style="background-image:url('${imgSrc(p.images[0])}');background-size:cover;background-position:center"`:'';return `<a href="product.html?id=${encodeURIComponent(p.id)}"><div class="product-image" ${bg}></div><p class="meta">${escapeHtml(p.category||'PRODUCT')}</p><h3>${escapeHtml(p.name)}</h3><p class="price">${escapeHtml(price)}</p></a>`}).join('')||'<p class="empty-state">연결된 상품이 없습니다.</p>';
  const budget=document.querySelector('.budget');if(budget)budget.hidden=true;
  const est=document.querySelector('#spaceEstimateLink');if(est)est.href='estimate.html';
  bindFavorite(s.id,s.title,src);bindShowcaseInteractions();
 }catch(e){document.querySelector('#showcaseTitle').textContent='쇼케이스를 불러오지 못했습니다';document.querySelector('#showcaseSubtitle').textContent=e.message+' · 백엔드 실행을 확인하세요.'}
}

function bindFavorite(key,title,image){
 const favoriteKey='earthplayground-favorite-spaces',saveButton=document.querySelector('#saveShowcase');if(!saveButton)return;
 const readFavorites=()=>{try{return JSON.parse(localStorage.getItem(favoriteKey)||'[]')}catch{return[]}};
 const paint=()=>{const saved=readFavorites().some(item=>item.key===key);saveButton.setAttribute('aria-pressed',String(saved));saveButton.textContent=saved?'♥ 관심 공간 저장됨':'♡ 관심 공간 저장'};
 paint();
 saveButton.onclick=()=>{const favorites=readFavorites(),index=favorites.findIndex(item=>item.key===key);if(index>=0)favorites.splice(index,1);else favorites.unshift({key,title,image,savedAt:new Date().toISOString()});localStorage.setItem(favoriteKey,JSON.stringify(favorites));paint();showToast(index>=0?'관심 공간에서 삭제했습니다.':'관심 공간에 저장했습니다.')};
}

function bindShowcaseInteractions(){
 const cartButton=document.querySelector('#addHotspotCart');
 if(cartButton)cartButton.onclick=()=>{const card=document.querySelector('.selection-card'),name=card.querySelector('strong').textContent,price=card.querySelector('small').textContent,count=addToCart(name,price,apiId||'');cartButton.textContent=`장바구니 ${count}`;cartButton.classList.add('confirmed');showToast(`${name}을(를) 장바구니에 담았습니다.`)};
 document.querySelectorAll('.scene-hotspot').forEach(point=>point.addEventListener('click',()=>{const card=document.querySelector('.selection-card');card.querySelector('strong').textContent=point.dataset.name;card.querySelector('small').textContent=point.dataset.price}));
 document.querySelectorAll('.thumb').forEach((thumb,index)=>thumb.addEventListener('click',()=>{document.querySelector('.thumb.active')?.classList.remove('active');thumb.classList.add('active');showcasePhoto.style.backgroundPosition=index===0?'center':index===1?'35% center':'70% center'}));
}

// ================= 상품 상세 페이지 =================
if(productBuy&&apiId){renderProductFromApi(apiId)}else{bindQuantity()}

async function renderProductFromApi(id){
 try{
  const p=await fetchJson('/v1/products/'+encodeURIComponent(id));
  document.title=p.name+' | 지구별놀이터';
  document.querySelector('.product-buy h1').textContent=p.name;
  const crumb=document.querySelector('.breadcrumbs');if(crumb)crumb.textContent='홈 › '+(p.category||'상품')+' › '+p.name;
  document.querySelector('.sku').textContent='SKU '+(p.code||p.id);
  document.querySelector('.original').textContent='정상가 '+Number(p.regularPrice).toLocaleString('ko-KR')+'원';
  document.querySelector('.sale').textContent='판매가 '+Number(p.salePrice).toLocaleString('ko-KR')+'원';
  const main=document.querySelector('.product-main');if(main&&p.images[0]){main.style.backgroundImage=`url('${imgSrc(p.images[0])}')`;main.style.backgroundSize='cover';main.style.backgroundPosition='center'}
  const thumbs=document.querySelectorAll('.product-thumbs button');p.images.slice(0,4).forEach((u,i)=>{if(thumbs[i]){thumbs[i].style.backgroundImage=`url('${imgSrc(u)}')`;thumbs[i].style.backgroundSize='cover';thumbs[i].style.backgroundPosition='center'}});
  const optionList=document.querySelector('.option-list');
  const opts=Object.entries(p.options||{}).map(([k,v])=>`<label>${escapeHtml(k)}<select>${(Array.isArray(v)?v:[]).map(o=>`<option>${escapeHtml(o)}</option>`).join('')}</select></label>`).join('');
  optionList.innerHTML=opts+`<label>수량<span class="quantity"><button data-qty="minus">−</button><strong id="qty">1</strong><button data-qty="plus">+</button></span></label>`;
  bindQuantity();
  const grid=document.querySelector('.showcase-grid');
  if(grid)grid.innerHTML=(p.showcases||[]).map(s=>`<a class="space-card" href="showcase.html?id=${encodeURIComponent(s.id)}"><div class="space-image" style="background-image:url('${imgSrc(s.imageUrl)}');background-size:cover;background-position:center"></div><h3>${escapeHtml(s.title)}</h3><p>실제 배치 매장</p></a>`).join('')||'<p class="empty-state">아직 배치된 매장이 없습니다.</p>';
 }catch(e){document.querySelector('.product-buy h1').textContent='상품을 불러오지 못했습니다';const sku=document.querySelector('.sku');if(sku)sku.textContent=e.message}
}

// ================= 공통(정적 페이지 포함) =================
if(!showcasePhoto){document.querySelectorAll('.scene-hotspot').forEach(point=>point.addEventListener('click',()=>{const box=document.querySelector('.selection-card');if(box){box.querySelector('strong').textContent=point.dataset.name;box.querySelector('small').textContent=point.dataset.price}}))}
document.querySelectorAll('[data-toast]').forEach(button=>button.addEventListener('click',()=>showToast(button.dataset.toast)));
document.querySelectorAll('.buy-actions button').forEach(button=>{if(button.textContent.trim()==='바로구매')button.addEventListener('click',()=>{location.href='checkout.html'})});
