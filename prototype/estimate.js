(function(){
 const cards=[...document.querySelectorAll('.industry-card')],form=document.querySelector('#estimateForm'),result=document.querySelector('#estimateResult'),space=new URLSearchParams(location.search).get('space'),spaceIndustry={cafe:'카페',bakery:'베이커리',ramen:'레스토랑',salon:'미용실',retail:'리테일',office:'오피스'};let industry=spaceIndustry[space]||'카페',requestId=crypto.randomUUID();
 cards.forEach(card=>card.addEventListener('click',()=>{cards.forEach(item=>{item.classList.remove('selected');item.setAttribute('aria-checked','false')});card.classList.add('selected');card.setAttribute('aria-checked','true');industry=card.dataset.industry}));
 const preset=cards.find(card=>card.dataset.industry===industry);if(preset)preset.click();
 let lastPayload='';
 form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(form));data.consent=form.elements.consent.checked;const serialized=JSON.stringify({industry,...data});if(lastPayload&&lastPayload!==serialized)requestId=crypto.randomUUID();lastPayload=serialized;button.disabled=true;button.textContent='접수 중';result.hidden=false;result.textContent='접수 내용을 저장하고 있습니다.';
  try{const turnstileToken=await window.G9STAR.challengeToken();const response=await fetch(window.G9STAR.apiBase+'/v1/estimates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId,industry,...data,turnstileToken})});const body=await response.json();if(!response.ok)throw Error(body.error?.message||'접수하지 못했습니다. 다시 시도해 주세요.');result.replaceChildren();const title=document.createElement('strong');title.textContent='견적 의뢰가 접수되었습니다.';const detail=document.createElement('p');detail.textContent='접수번호 '+body.id+' · 담당자가 내용을 확인합니다.';result.append(title,detail);button.textContent='접수 완료';result.scrollIntoView({behavior:'smooth',block:'center'})}
  catch(error){result.textContent=error.message||'연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.';button.disabled=false;button.textContent='무료 견적 접수'}
 });
})();
