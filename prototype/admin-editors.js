// A-05 Product Editor · A-08 Hotspot Editor (Figma 02 Admin Wireframes 2:293 / 2:349)
// window.EarthEditors.product(value, ctx) / .hotspot(value, ctx) 를 노출한다.
// ctx = { API, upload(file)->{url}, search(q)->{items}, generateSkus(id)->{items,count}, partners()->{items} }
(function(){
 const qs=s=>document.querySelector(s),qsa=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
 const srcOf=(ctx,u)=>!u?'':(/^https?:\/\//.test(u)?u:ctx.API+u);

 // ---------- A-05 Product Editor ----------
 function product(value,ctx){
  const dialog=qs('#productEditor'),err=qs('#peError');
  const state={images:Array.isArray(value.images)?[...value.images]:[],options:{...(value.options||{})},status:value.status||'DRAFT'};
  qs('#peTitle').textContent=value.id?`상품 수정 · ${value.id}`:'상품 등록';
  qs('#peName').value=value.name||'';qs('#peCode').value=value.code||'';qs('#peBrand').value=value.brand||'';qs('#peCategory').value=value.category||'';
  qs('#peRegular').value=value.regularPrice??'';qs('#peSale').value=value.salePrice??'';qs('#peCost').value=value.costPrice??'';
  qs('#peStatus').textContent=state.status;qs('#peSkuResult').innerHTML='';err.textContent='';
  qsa('[data-petab]').forEach((b,i)=>b.classList.toggle('active',i===0));qsa('[data-pepane]').forEach((p,i)=>p.hidden=i!==0);
  qsa('[data-petab]').forEach(btn=>btn.onclick=()=>{qsa('[data-petab]').forEach(b=>b.classList.toggle('active',b===btn));qsa('[data-pepane]').forEach(p=>p.hidden=p.dataset.pepane!==btn.dataset.petab)});
  const renderMain=()=>{const el=qs('#peMainPreview'),u=state.images[0];if(u){el.classList.remove('empty');el.innerHTML=`<img alt="대표 이미지" src="${esc(srcOf(ctx,u))}">`}else{el.classList.add('empty');el.textContent='이미지 없음'}};
  const renderDetail=()=>{qs('#peDetailPreview').innerHTML=state.images.slice(1).map((u,i)=>`<span class="thumb"><img alt="상세 ${i+1}" src="${esc(srcOf(ctx,u))}"><button type="button" data-detail="${i+1}" aria-label="삭제">×</button></span>`).join('')||'<small class="hint">상세 이미지 없음</small>';qsa('#peDetailPreview [data-detail]').forEach(b=>b.onclick=()=>{state.images.splice(Number(b.dataset.detail),1);renderDetail()})};
  const renderOptions=()=>{const wrap=qs('#peOptions');wrap.innerHTML=Object.entries(state.options).map(([k,v])=>`<div class="option-row"><input class="opt-name" value="${esc(k)}" placeholder="옵션명"><input class="opt-values" value="${esc((Array.isArray(v)?v:[]).join(', '))}" placeholder="값1, 값2"><button type="button" class="admin-button opt-del" aria-label="삭제">삭제</button></div>`).join('')||'<small class="hint">옵션이 없습니다.</small>';
   qsa('#peOptions .opt-del').forEach((b,i)=>b.onclick=()=>{state.options=collectOptions();delete state.options[Object.keys(state.options)[i]];renderOptions()})};
  const collectOptions=()=>{const out={};qsa('#peOptions .option-row').forEach(row=>{const name=row.querySelector('.opt-name').value.trim();const vals=row.querySelector('.opt-values').value.split(',').map(s=>s.trim()).filter(Boolean);if(name&&vals.length)out[name]=vals});return out};
  renderMain();renderDetail();renderOptions();
  qs('#peAddOption').onclick=()=>{state.options=collectOptions();state.options['옵션'+(Object.keys(state.options).length+1)]=[];renderOptions()};
  qs('#peMainFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;err.textContent='업로드 중…';try{const r=await ctx.upload(f);state.images[0]=r.url;renderMain();err.textContent=''}catch(x){err.textContent=x.message}e.target.value=''};
  qs('#peDetailFiles').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;err.textContent='업로드 중…';try{for(const f of files){const r=await ctx.upload(f);if(!state.images.length)state.images.push('');state.images.push(r.url)}renderMain();renderDetail();err.textContent=''}catch(x){err.textContent=x.message}e.target.value=''};
  qs('#peGenSkus').onclick=async()=>{if(!value.id){err.textContent='SKU는 상품 저장 후 생성할 수 있습니다.';return}state.options=collectOptions();qs('#peSkuResult').textContent='생성 중…';try{const r=await ctx.generateSkus(value.id);qs('#peSkuResult').innerHTML=`<strong>${r.count}개 SKU 생성</strong><ul>${r.items.map(s=>`<li>${esc(s.sku||s.id)}</li>`).join('')}</ul>`}catch(x){qs('#peSkuResult').textContent=x.message}};
  const build=intendedStatus=>{const name=qs('#peName').value.trim(),code=qs('#peCode').value.trim();if(!name)throw new Error('상품명을 입력하세요.');if(!code)throw new Error('상품코드를 입력하세요.');const regular=num(qs('#peRegular').value),sale=num(qs('#peSale').value);if(sale>regular)throw new Error('판매가는 정상가를 초과할 수 없습니다.');const payload={name,code,brand:qs('#peBrand').value.trim(),category:qs('#peCategory').value.trim(),regularPrice:regular,salePrice:sale,costPrice:num(qs('#peCost').value),options:collectOptions(),images:state.images.filter(Boolean)};if(!value.id)payload.status=intendedStatus;return payload};
  return new Promise(resolve=>{
   let settled=false;
   const done=(result,rv)=>{if(settled)return;settled=true;resolve(result);try{dialog.returnValue=rv;dialog.close(rv)}catch(e){}};
   const finish=(mode,ev)=>{ev.preventDefault();try{done({id:value.id,payload:build(mode==='draft'?'DRAFT':'ACTIVE')},mode==='draft'?'draft':'save')}catch(x){err.textContent=x.message}};
   qs('#peDraft').onclick=e=>finish('draft',e);qs('#peSave').onclick=e=>finish('save',e);
   qsa('#productEditor button[value="cancel"]').forEach(b=>b.onclick=e=>{e.preventDefault();done(null,'cancel')});
   dialog.addEventListener('close',()=>done(null,'cancel'),{once:true});
   dialog.showModal();
  });
 }

 // ---------- product picker (shared) ----------
 function pickProduct(ctx){
  const dialog=qs('#productPicker'),input=qs('#ppSearch'),results=qs('#ppResults');
  input.value='';results.innerHTML='<div class="empty-state">검색어를 입력하세요.</div>';
  let timer;const run=async()=>{const q=input.value.trim();results.innerHTML='<div class="empty-state">검색 중…</div>';try{const r=await ctx.search(q);results.innerHTML=(r.items||[]).map(p=>`<button type="button" class="pp-item" data-pid="${esc(p.id)}"><strong>${esc(p.name||p.id)}</strong><small>${esc(p.code||'')} · ${esc(p.id)}</small></button>`).join('')||'<div class="empty-state">결과가 없습니다.</div>';qsa('.pp-item').forEach(b=>b.onclick=()=>dialog._done&&dialog._done({id:b.dataset.pid,name:b.querySelector('strong').textContent}))}catch(x){results.innerHTML=`<div class="empty-state">${esc(x.message)}</div>`}};
  input.oninput=()=>{clearTimeout(timer);timer=setTimeout(run,250)};
  return new Promise(resolve=>{
   let settled=false;
   const done=pick=>{if(settled)return;settled=true;resolve(pick);try{dialog.close(pick?'pick':'cancel')}catch(e){}};
   dialog._done=done;
   qsa('#productPicker button[value="cancel"]').forEach(b=>b.onclick=e=>{e.preventDefault();done(null)});
   dialog.addEventListener('close',()=>done(null),{once:true});
   dialog.showModal();run();
  });
 }

 // ---------- A-08 Hotspot Editor ----------
 async function hotspot(value,ctx){
  const dialog=qs('#hotspotEditor'),err=qs('#heError'),canvas=qs('#heCanvas');
  const state={imageUrl:value.imageUrl||'',hotspots:(value.hotspots||[]).map(h=>({id:h.id||('H-'+Math.random().toString(36).slice(2,8)),productId:h.productId,productName:h.productName||h.productId,x:num(h.x),y:num(h.y)})),status:value.status||'DRAFT'};
  qs('#heTitle').textContent=value.id?`Hotspot Editor · ${value.id}`:'Hotspot Editor · 신규';
  qs('#heTitleInput').value=value.title||'';qs('#heStatus').textContent=state.status;err.textContent='';
  // partner select
  try{const p=await ctx.partners();qs('#hePartner').innerHTML=(p.items||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.id)}</option>`).join('')}catch{qs('#hePartner').innerHTML='<option value="P-A">P-A</option>'}
  if(value.partnerId)qs('#hePartner').value=value.partnerId;
  const renderCanvas=()=>{canvas.innerHTML='';if(!state.imageUrl){canvas.innerHTML='<div class="canvas-empty" id="heCanvasEmpty">이미지를 업로드한 뒤 이미지를 클릭해 핫스팟을 배치하세요.</div>';return}const img=document.createElement('img');img.src=srcOf(ctx,state.imageUrl);img.alt='쇼케이스 이미지';img.className='canvas-img';canvas.appendChild(img);state.hotspots.forEach((h,i)=>{const dot=document.createElement('button');dot.type='button';dot.className='canvas-dot';dot.style.left=h.x+'%';dot.style.top=h.y+'%';dot.textContent=i+1;dot.title=h.productName;dot.onclick=ev=>{ev.stopPropagation()};canvas.appendChild(dot)})};
  const renderList=()=>{qs('#heList').innerHTML=state.hotspots.length?state.hotspots.map((h,i)=>`<div class="he-row"><span class="he-num">${i+1}</span><div><strong>${esc(h.productName)}</strong><small>x ${h.x.toFixed(1)} · y ${h.y.toFixed(1)}</small></div><div class="he-row-act"><button type="button" class="admin-button" data-change="${h.id}">상품변경</button><button type="button" class="admin-button danger" data-remove="${h.id}">삭제</button></div></div>`).join(''):'<div class="empty-state">핫스팟이 없습니다.</div>';
   qsa('#heList [data-remove]').forEach(b=>b.onclick=()=>{state.hotspots=state.hotspots.filter(h=>h.id!==b.dataset.remove);renderCanvas();renderList()});
   qsa('#heList [data-change]').forEach(b=>b.onclick=async()=>{const pick=await pickProduct(ctx);if(pick){const h=state.hotspots.find(x=>x.id===b.dataset.change);h.productId=pick.id;h.productName=pick.name;renderCanvas();renderList()}})};
  renderCanvas();renderList();
  qs('#heImageFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;err.textContent='업로드 중…';try{const r=await ctx.upload(f);state.imageUrl=r.url;renderCanvas();err.textContent=''}catch(x){err.textContent=x.message}e.target.value=''};
  canvas.onclick=async e=>{if(!state.imageUrl)return;const img=canvas.querySelector('.canvas-img');if(!img||e.target!==img)return;const rect=img.getBoundingClientRect();const x=Math.min(100,Math.max(0,(e.clientX-rect.left)/rect.width*100)),y=Math.min(100,Math.max(0,(e.clientY-rect.top)/rect.height*100));const pick=await pickProduct(ctx);if(!pick)return;state.hotspots.push({id:'H-'+Math.random().toString(36).slice(2,8),productId:pick.id,productName:pick.name,x:Number(x.toFixed(1)),y:Number(y.toFixed(1))});renderCanvas();renderList()};
  qs('#hePreview').onclick=()=>{canvas.classList.toggle('preview');qs('#hePreview').textContent=canvas.classList.contains('preview')?'편집':'Preview'};
  const build=()=>{const title=qs('#heTitleInput').value.trim();if(!title)throw new Error('쇼케이스명을 입력하세요.');const partnerId=qs('#hePartner').value;if(!partnerId)throw new Error('Partner를 선택하세요.');return{id:value.id,showcase:{title,partnerId,imageUrl:state.imageUrl},hotspots:state.hotspots.map(h=>({id:h.id,productId:h.productId,x:h.x,y:h.y}))}};
  return new Promise(resolve=>{
   let settled=false;
   const done=(result,rv)=>{if(settled)return;settled=true;canvas.classList.remove('preview');qs('#hePreview').textContent='Preview';resolve(result);try{dialog.returnValue=rv;dialog.close(rv)}catch(e){}};
   qs('#heSave').onclick=e=>{e.preventDefault();try{done(build(),'save')}catch(x){err.textContent=x.message}};
   qsa('#hotspotEditor button[value="cancel"]').forEach(b=>b.onclick=e=>{e.preventDefault();done(null,'cancel')});
   dialog.addEventListener('close',()=>done(null,'cancel'),{once:true});
   dialog.showModal();
  });
 }

 window.EarthEditors={product,hotspot};
})();
