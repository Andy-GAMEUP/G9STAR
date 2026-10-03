import type {IncomingMessage,ServerResponse} from 'node:http';
import {randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {DomainError,PlatformService} from './domain.ts';
import {authenticate,issueToken,requireRole} from './infrastructure/auth.ts';
import {createDatabase} from './infrastructure/database.ts';
import {MedusaWebhookProcessor} from './infrastructure/webhook.ts';
import {PostgresPlatformRepository} from './infrastructure/postgres-repository.ts';
import {openapi} from './openapi.ts';
import {booleanField,integerField,isoDateTimeField,objectInput,stringField} from './input-validation.ts';
import {AdminService} from './admin-service.ts';
import {BackofficeService} from './backoffice-service.ts';
import {handleBackofficeRoute} from './backoffice-routes.ts';
import {LocalAssetStorage} from './infrastructure/storage.ts';

import {restoreSnapshot,exportSnapshot} from './snapshot.ts';

export async function createApplication(options:any={}){
const database=options.database||createDatabase();
const service=new PlatformService(),admin=new AdminService(service),backoffice=new BackofficeService(service,database),sql=database.mode==='postgres'?new PostgresPlatformRepository(database):null,webhooks=new MedusaWebhookProcessor(service,database),storage=options.storage||new LocalAssetStorage();
if(options.snapshot){restoreSnapshot(service,backoffice,options.snapshot,admin)}else{await backoffice.hydrate()}
if(options.uploads!==false)await storage.ensure();
const json=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization,x-correlation-id,x-medusa-signature,idempotency-key','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(data))};
const read=async(req:IncomingMessage)=>{const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>1_048_576)throw new DomainError('PAYLOAD_TOO_LARGE','요청 본문은 1MB 이하여야 합니다.',413);chunks.push(c)}const raw=Buffer.concat(chunks);if(!raw.length)return{raw,input:{}};try{return{raw,input:objectInput(JSON.parse(raw.toString('utf8')))}}catch(error){if(error instanceof DomainError)throw error;throw new DomainError('INVALID_JSON','JSON 요청 본문 형식이 올바르지 않습니다.',400)}};
const ASSET_MAX_BYTES=Number(process.env.ASSET_MAX_BYTES||8*1024*1024);
const readRaw=async(req:IncomingMessage,limit:number)=>{const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>limit)throw new DomainError('PAYLOAD_TOO_LARGE',`업로드는 ${Math.floor(limit/1024/1024)}MB 이하여야 합니다.`,413);chunks.push(c)}return Buffer.concat(chunks)};

const route=async(req:IncomingMessage,res:ServerResponse)=>{
 const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`),method=req.method||'GET';
 if(options.uploads===false&&(url.pathname.startsWith('/uploads/')||url.pathname==='/v1/admin/ops/assets'))throw new DomainError('UPLOAD_NOT_CONFIGURED','이미지 업로드 준비중입니다.',503);
 if(options.payments===false&&method==='POST'&&(/\/v1\/coupons\/[^/]+\/(reserve|complete|restore-full-cancellation)$/.test(url.pathname)||url.pathname==='/v1/webhooks/medusa'||/\/(pay|refund)$/.test(url.pathname)))throw new DomainError('PAYMENTS_NOT_READY','결제 기능은 준비중입니다.',503);
 if(method==='OPTIONS')return json(res,204,{});
 if(method==='GET'&&url.pathname.startsWith('/uploads/')){const asset=await storage.read(decodeURIComponent(url.pathname.slice('/uploads/'.length)));res.writeHead(200,{'content-type':asset.contentType,'access-control-allow-origin':'*','cache-control':'public, max-age=86400'});return res.end(asset.data)}
 if(method==='POST'&&url.pathname==='/v1/admin/ops/assets'){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN','MD']);const raw=await readRaw(req,ASSET_MAX_BYTES);const saved=await storage.save(raw,String(req.headers['content-type']||''));service.db.log('ASSET_UPLOADED',principal.sub,{...saved});return json(res,201,saved)}
 const payload=await read(req),input=payload.input;
 if(method==='GET'&&url.pathname==='/health')return json(res,200,{status:'ok',service:'earthplayground-backend',database:database.mode,databaseHealthy:await database.health()});
 if(method==='GET'&&url.pathname==='/openapi.json')return json(res,200,openapi);
 if(method==='POST'&&url.pathname==='/dev/token'&&options.devTokens)return json(res,200,{accessToken:await issueToken({sub:stringField(input,'sub',{required:false,max:100})||'operator01',role:(stringField(input,'role',{required:false,max:30})||'OPERATOR') as any})});
 
 if(method==='POST'&&url.pathname==='/v1/admin/login'){
  const login=stringField(input,'login',{max:100})!,password=stringField(input,'password',{max:200})!;
  const expected=options.adminPassword,expectedLogin=options.adminLogin||'';
  if(!expectedLogin||!expected||expected.length<32)throw new DomainError('ADMIN_NOT_CONFIGURED','관리자 인증 설정이 필요합니다.',503);
  const digest=(value:string)=>createHash('sha256').update(value).digest();
  if(login!==expectedLogin||!timingSafeEqual(digest(password),digest(expected)))throw new DomainError('INVALID_CREDENTIALS','로그인 정보를 확인하세요.',401);
  return json(res,200,{accessToken:await issueToken({sub:expectedLogin,role:'SUPER_ADMIN'}),role:'SUPER_ADMIN',user:expectedLogin});
 }
 if(method==='GET'&&url.pathname==='/v1/me'){
  const principal=await authenticate(req);requireRole(principal,['CUSTOMER']);
  if(sql)return json(res,200,await sql.me(principal.sub));
  const member=service.db.members.get(principal.sub);if(!member)throw new DomainError('MEMBER_NOT_FOUND','회원 정보를 찾을 수 없습니다.',404);
  return json(res,200,{member,coupons:[...service.db.coupons.values()].filter(c=>c.memberId===principal.sub)});
 }
 if(method==='POST'&&url.pathname==='/v1/estimates'){
  if(!booleanField(input,'consent'))throw new DomainError('CONSENT_REQUIRED','견적 상담을 위한 개인정보 처리에 동의해 주세요.',422);
  const requestId=stringField(input,'requestId',{max:80})!;if(!/^[a-f0-9-]{36}$/.test(requestId))throw new DomainError('VALIDATION_ERROR','요청 식별자가 올바르지 않습니다.',422);
  const row={customerName:stringField(input,'contact',{max:100})!,phone:stringField(input,'phone',{max:30})!,industry:stringField(input,'industry',{max:30})!,area:stringField(input,'area',{max:50})!,address:stringField(input,'location',{max:200})!,style:stringField(input,'style',{max:50})!,budget:stringField(input,'budget',{max:50})!,note:stringField(input,'note',{required:false,min:0,max:3000})||'',consent:true,consentedAt:new Date().toISOString(),assignee:null,memos:[],revisions:[],version:0,notificationStatus:'PENDING'};
  if(!/^01[016789][0-9]{7,8}$/.test(row.phone.replace(/[^0-9]/g,'')))throw new DomainError('VALIDATION_ERROR','휴대전화 번호를 확인해 주세요.',422);
  const quoteId='Q-'+requestId;let quote:any;
  try{quote=backoffice.detail('estimates',quoteId);for(const key of ['customerName','phone','industry','area','address','style','budget','note'])if(quote[key]!==row[key])throw new DomainError('IDEMPOTENCY_CONFLICT','이미 사용된 요청 식별자입니다.',409)}catch(error){if(!(error instanceof DomainError)||error.code!=='RESOURCE_NOT_FOUND')throw error;quote=backoffice.create('estimates',{...row,id:quoteId},'public-customer')}
  return json(res,201,{id:quote.id,notificationStatus:quote.notificationStatus});
 }
 if(method==='POST'&&url.pathname==='/v1/referrals/validate'){const code=stringField(input,'code',{max:100})!;return json(res,200,sql?await sql.validateReferral(code):service.validateReferral(code))}
 if(method==='POST'&&url.pathname==='/v1/members'){const value={name:stringField(input,'name',{max:100})!,linkCode:stringField(input,'linkCode',{required:false,max:100}),directCode:stringField(input,'directCode',{required:false,max:100})};const member=sql?await sql.signup(value,'customer'):service.signup(value,'customer');if(!sql)backoffice.create('members',{id:String((member as any).id),name:(member as any).name,partnerId:(member as any).currentAttribution?.partnerId??null,memberType:'BETA',memos:[],orders:[],estimates:[],rentals:[],status:'ACTIVE'},'customer');const accessToken=await issueToken({sub:String((member as any).id),role:'CUSTOMER'});return json(res,201,{...member,accessToken})}
 if(method==='POST'&&url.pathname.match(/^\/v1\/members\/[^/]+\/attribution-change-requests$/)){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);const memberId=url.pathname.split('/')[3],value={memberId,targetCode:stringField(input,'targetCode',{max:100})!,effectiveFrom:isoDateTimeField(input,'effectiveFrom'),reason:stringField(input,'reason',{max:500})!,retroactive:booleanField(input,'retroactive',{required:false})};return json(res,201,sql?await sql.requestAttributionChange(value,principal.sub,principal.role):service.requestAttributionChange(value,principal.sub,principal.role))}
 const approve=url.pathname.match(/^\/v1\/attribution-change-requests\/([^/]+)\/approve$/);if(method==='POST'&&approve){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,sql?await sql.approveAttributionChange(approve[1],principal.sub):service.approveAttributionChange(approve[1],principal.sub,principal.role))}
 if(method==='GET'&&url.pathname==='/v1/showcases')return json(res,200,backoffice.storefrontShowcases());
 const showcaseGet=url.pathname.match(/^\/v1\/showcases\/([^/]+)$/);if(method==='GET'&&showcaseGet)return json(res,200,backoffice.storefrontShowcase(decodeURIComponent(showcaseGet[1])));
 if(method==='GET'&&url.pathname==='/v1/products')return json(res,200,backoffice.storefrontProducts());
 const productGet=url.pathname.match(/^\/v1\/products\/([^/]+)$/);if(method==='GET'&&productGet)return json(res,200,backoffice.storefrontProduct(decodeURIComponent(productGet[1])));
 if(method==='GET'&&url.pathname==='/v1/rental-items')return json(res,200,backoffice.storefrontRentalItems());
 const rentalItemGet=url.pathname.match(/^\/v1\/rental-items\/([^/]+)$/);if(method==='GET'&&rentalItemGet)return json(res,200,backoffice.storefrontRentalItem(decodeURIComponent(rentalItemGet[1])));
 if(method==='POST'&&url.pathname==='/v1/coupons/register'){const principal=await authenticate(req);requireRole(principal,['CUSTOMER']);const memberId=principal.sub,campaignCode=stringField(input,'campaignCode',{max:100})!;if(!sql&&!service.db.members.has(memberId))throw new DomainError('MEMBER_NOT_FOUND','회원을 찾을 수 없습니다.',404);const coupon=sql?await sql.registerCoupon(memberId,campaignCode,'customer'):service.registerCoupon(memberId,campaignCode,'customer');if(!sql)backoffice.recordMemberCoupon(coupon);return json(res,201,coupon)}
 const reserve=url.pathname.match(/^\/v1\/coupons\/([^/]+)\/reserve$/);if(method==='POST'&&reserve){const principal=await authenticate(req);const memberId=principal.sub,eligibleSubtotal=integerField(input,'eligibleSubtotal'),reservationId=stringField(input,'reservationId',{max:200})!;return json(res,200,sql?await sql.reserveCoupon(reserve[1],memberId,eligibleSubtotal,reservationId):service.reserveCoupon(reserve[1],memberId,eligibleSubtotal,reservationId))}
 const complete=url.pathname.match(/^\/v1\/coupons\/([^/]+)\/complete$/);if(method==='POST'&&complete){const principal=await authenticate(req);const reservationId=stringField(input,'reservationId',{max:200})!,success=booleanField(input,'success')!;return json(res,200,sql?await sql.completeCoupon(complete[1],reservationId,success):service.completeCoupon(complete[1],reservationId,success,principal.sub))}
 const cancel=url.pathname.match(/^\/v1\/coupons\/([^/]+)\/restore-full-cancellation$/);if(method==='POST'&&cancel){const principal=await authenticate(req);const orderId=stringField(input,'orderId',{max:200})!;return json(res,200,sql?await sql.restoreFullCancellation(cancel[1],orderId):service.restoreFullCancellation(cancel[1],principal.sub))}
 const backofficeResult=await handleBackofficeRoute(req,url,method,input,backoffice);if(backofficeResult){await backoffice.flush();return json(res,backofficeResult.status,backofficeResult.data)}
 if(method==='GET'&&url.pathname==='/v1/admin/dashboard'){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,200,admin.dashboard(url.searchParams.get('memberId')||undefined,url.searchParams.get('partnerId')||undefined,url.searchParams.get('period')||undefined))}
 const reject=url.pathname.match(/^\/v1\/admin\/attribution-change-requests\/([^/]+)\/reject$/);if(method==='POST'&&reject){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,admin.rejectAttribution(reject[1],stringField(input,'reason',{max:500})!,principal.sub,principal.role))}
 const hold=url.pathname.match(/^\/v1\/admin\/commission-ledger\/([^/]+)\/hold$/);if(method==='POST'&&hold){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,200,service.holdDispute(hold[1],principal.sub))}
 const release=url.pathname.match(/^\/v1\/admin\/commission-ledger\/([^/]+)\/release$/);if(method==='POST'&&release){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,service.releaseDispute(release[1],principal.sub,principal.role))}
 const resolveAgainst=url.pathname.match(/^\/v1\/admin\/commission-ledger\/([^/]+)\/resolve-against-partner$/);if(method==='POST'&&resolveAgainst){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,service.resolveDisputeAgainstPartner(resolveAgainst[1],{clawbackPaid:input.clawbackPaid===undefined?0:integerField(input,'clawbackPaid',{min:0})},principal.sub,principal.role))}
 const finalize=url.pathname.match(/^\/v1\/admin\/settlements\/([^/]+)\/finalize$/);if(method==='POST'&&finalize){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,200,service.finalizeSettlement(finalize[1]))}
 const taxError=url.pathname.match(/^\/v1\/admin\/settlements\/([^/]+)\/tax-error$/);if(method==='POST'&&taxError){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,200,service.markTaxError(taxError[1],stringField(input,'reason',{max:500})!,principal.sub))}
 const taxVerify=url.pathname.match(/^\/v1\/admin\/settlements\/([^/]+)\/verify-tax$/);if(method==='POST'&&taxVerify){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,200,service.verifyTax(taxVerify[1],principal.sub))}
 const pay=url.pathname.match(/^\/v1\/admin\/settlements\/([^/]+)\/pay$/);if(method==='POST'&&pay){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,service.paySettlement(pay[1],principal.sub,principal.role))}
 const review=url.pathname.match(/^\/v1\/admin\/partners\/([^/]+)\/review$/);if(method==='POST'&&review){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,200,service.startPartnerReview(review[1],stringField(input,'reason',{max:100})!,principal.sub))}
 const reviewComplete=url.pathname.match(/^\/v1\/admin\/partners\/([^/]+)\/review-complete$/);if(method==='POST'&&reviewComplete){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,service.completePartnerReview(reviewComplete[1],principal.sub,principal.role))}
 const partnerEnd=url.pathname.match(/^\/v1\/admin\/partners\/([^/]+)\/end$/);if(method==='POST'&&partnerEnd){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,service.endPartner(partnerEnd[1],principal.sub,principal.role))}
 if(method==='POST'&&url.pathname==='/v1/admin/coupons'){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,201,admin.createCoupon({code:stringField(input,'code',{max:50})!,target:stringField(input,'target',{max:100})!,partnerId:stringField(input,'partnerId',{required:false,max:100}),benefit:stringField(input,'benefit',{max:100})!},principal.sub))}
 const couponSuspend=url.pathname.match(/^\/v1\/admin\/coupons\/([^/]+)\/suspend$/);if(method==='POST'&&couponSuspend){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,admin.suspendCoupon(decodeURIComponent(couponSuspend[1]),stringField(input,'reason',{max:500})!,principal.sub,principal.role))}
 const couponRestore=url.pathname.match(/^\/v1\/admin\/coupons\/([^/]+)\/restore$/);if(method==='POST'&&couponRestore){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,admin.restoreCoupon(decodeURIComponent(couponRestore[1]),principal.sub,principal.role))}
 if(method==='POST'&&url.pathname==='/v1/webhooks/medusa'){webhooks.verify(payload.raw,String(req.headers['x-medusa-signature']||''));const result=await webhooks.process(String(req.headers['idempotency-key']||''),input);return json(res,202,result)}
 const rentalFinal=url.pathname.match(/^\/v1\/admin\/rentals\/([^/]+)\/finalize-commission$/);if(method==='POST'&&rentalFinal){const principal=await authenticate(req);requireRole(principal,['FINANCE','OPERATOR','SUPER_ADMIN']);const rate=Number(input.rate);if(!(rate>0&&rate<1))throw new DomainError('VALIDATION_ERROR','rate는 0과 1 사이여야 합니다.',422,{field:'rate'});return json(res,201,service.finalizeRentalCommission({contractId:decodeURIComponent(rentalFinal[1]),partnerId:stringField(input,'partnerId',{max:100})!,period:stringField(input,'period',{max:20})!,committedRent:integerField(input,'committedRent'),recognizedCommitment:integerField(input,'recognizedCommitment'),rate,terminationType:stringField(input,'terminationType',{required:false,max:30})},principal.sub))}
 if(method==='GET'&&url.pathname==='/v1/admin/negative-commissions'){const principal=await authenticate(req);requireRole(principal,['FINANCE','OPERATOR','SUPER_ADMIN']);const partnerId=url.searchParams.get('partnerId')||undefined;return json(res,200,{items:[...service.db.negatives.values()].filter(n=>!partnerId||n.partnerId===partnerId)})}
 if(method==='POST'&&url.pathname==='/v1/admin/negative-commissions/offset'){const principal=await authenticate(req);requireRole(principal,['FINANCE','OPERATOR','SUPER_ADMIN']);return json(res,200,service.offsetNegativeCommissions(stringField(input,'partnerId',{max:100})!,integerField(input,'availableCommission'),principal.sub))}
 const negReclaim=url.pathname.match(/^\/v1\/admin\/negative-commissions\/([^/]+)\/reclaim$/);if(method==='POST'&&negReclaim){const principal=await authenticate(req);requireRole(principal,['FINANCE','OPERATOR','SUPER_ADMIN']);return json(res,200,service.convertNegativeToReclaim(decodeURIComponent(negReclaim[1]),stringField(input,'reason',{max:500})!,principal.sub))}
 const negDeposit=url.pathname.match(/^\/v1\/admin\/negative-commissions\/([^/]+)\/deposit$/);if(method==='POST'&&negDeposit){const principal=await authenticate(req);requireRole(principal,['FINANCE','OPERATOR','SUPER_ADMIN']);return json(res,200,service.confirmNegativeDeposit(decodeURIComponent(negDeposit[1]),integerField(input,'amount',{min:1}),principal.sub))}
 const negOverdue=url.pathname.match(/^\/v1\/admin\/negative-commissions\/([^/]+)\/overdue$/);if(method==='POST'&&negOverdue){const principal=await authenticate(req);requireRole(principal,['FINANCE','OPERATOR','SUPER_ADMIN']);return json(res,200,service.markNegativeOverdue(decodeURIComponent(negOverdue[1]),principal.sub))}
 const negUnrec=url.pathname.match(/^\/v1\/admin\/negative-commissions\/([^/]+)\/unrecoverable$/);if(method==='POST'&&negUnrec){const principal=await authenticate(req);requireRole(principal,['SUPER_ADMIN']);return json(res,200,service.markNegativeUnrecoverable(decodeURIComponent(negUnrec[1]),stringField(input,'reason',{max:500})!,principal.sub,principal.role))}
 const partialCancel=url.pathname.match(/^\/v1\/admin\/coupons\/([^/]+)\/partial-cancellation$/);if(method==='POST'&&partialCancel){const principal=await authenticate(req);requireRole(principal,['CS','FINANCE','OPERATOR','SUPER_ADMIN']);const items=Array.isArray(input.items)?input.items.map((it:any)=>({id:stringField(it,'id',{max:100})!,price:integerField(it,'price')})):null;if(!items||!items.length)throw new DomainError('VALIDATION_ERROR','items는 1개 이상의 배열이어야 합니다.',422,{field:'items'});const cancelledIds=Array.isArray(input.cancelledIds)?input.cancelledIds.map(String):[];return json(res,200,service.partialCancellation(decodeURIComponent(partialCancel[1]),{items,cancelledIds},principal.sub))}
 if(method==='GET'&&url.pathname==='/v1/audit-events'){const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN']);return json(res,200,{items:service.db.audit})}
 return json(res,404,{error:{code:'ROUTE_NOT_FOUND',message:'경로를 찾을 수 없습니다.'}});
};

return{route,service,backoffice,database,snapshot:()=>exportSnapshot(service,backoffice,admin)};
}
