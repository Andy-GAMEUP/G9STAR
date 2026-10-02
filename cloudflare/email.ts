import {DomainError} from '../backend/src/domain.ts';
export async function sendQuote(env:any,quote:any,fetcher:typeof fetch=fetch){
 if(!env.RESEND_API_KEY||!env.QUOTE_FROM)throw Error('EMAIL_NOT_CONFIGURED');
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','idempotency-key':`quote-${quote.id}`},body:JSON.stringify({from:env.QUOTE_FROM,to:[env.QUOTE_RECIPIENT||'starplayground99@gmail.com'],subject:`[지구별놀이터 견적] ${quote.id}`,text:[`접수번호: ${quote.id}`,`담당자: ${quote.customerName}`,`휴대전화: ${quote.phone}`,`업종: ${quote.industry}`,`면적: ${quote.area}`,`지역: ${quote.address}`,`스타일: ${quote.style}`,`예산: ${quote.budget}`,`요청사항: ${quote.note||'-'}`].join('\n')})});
 if(!response.ok)throw Error(`EMAIL_PROVIDER_${response.status}`);return(await response.json() as any).id;
}
export async function sendAdminTemporaryPassword(env:any,email:string,password:string,requestId:string,fetcher:typeof fetch=fetch){
 if(!env.RESEND_API_KEY||!env.QUOTE_FROM)throw Error('EMAIL_NOT_CONFIGURED');
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','idempotency-key':`admin-recovery-${requestId}`},body:JSON.stringify({from:env.QUOTE_FROM,to:[email],subject:'[지구별놀이터] 관리자 임시 비밀번호',text:`관리자 임시 비밀번호: ${password}\n\n15분 이내에 https://www.g9star.co.kr/admin 에서 로그인하세요.\n임시 비밀번호는 한 번만 로그인에 사용할 수 있으며, 로그인 후 새 비밀번호로 변경해야 합니다.\n직접 요청하지 않았다면 이 메일을 무시하세요. 기존 비밀번호는 임시 비밀번호를 사용하기 전까지 유지됩니다.`})});
 if(!response.ok)throw Error(`EMAIL_PROVIDER_${response.status}`);return(await response.json() as any).id;
}

export async function sendMemberMail(env:any,email:string,subject:string,text:string,requestId:string){
 if(!env.RESEND_API_KEY||!env.QUOTE_FROM)throw new DomainError('EMAIL_NOT_CONFIGURED','메일 발송을 준비 중입니다.',503);
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','idempotency-key':`member-${requestId}`},body:JSON.stringify({from:env.QUOTE_FROM,to:[email],subject:'[지구별놀이터] '+subject,text})});
 if(!response.ok)throw new DomainError('EMAIL_SEND_FAILED','메일을 발송하지 못했습니다. 잠시 후 다시 시도하세요.',503);
}
