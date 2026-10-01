export async function sendQuote(env:any,quote:any,fetcher:typeof fetch=fetch){
 if(!env.RESEND_API_KEY||!env.QUOTE_FROM)throw Error('EMAIL_NOT_CONFIGURED');
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','idempotency-key':`quote-${quote.id}`},body:JSON.stringify({from:env.QUOTE_FROM,to:[env.QUOTE_RECIPIENT||'starplayground99@gmail.com'],subject:`[지구별놀이터 견적] ${quote.id}`,text:[`접수번호: ${quote.id}`,`담당자: ${quote.customerName}`,`휴대전화: ${quote.phone}`,`업종: ${quote.industry}`,`면적: ${quote.area}`,`지역: ${quote.address}`,`스타일: ${quote.style}`,`예산: ${quote.budget}`,`요청사항: ${quote.note||'-'}`].join('\n')})});
 if(!response.ok)throw Error(`EMAIL_PROVIDER_${response.status}`);return(await response.json() as any).id;
}
