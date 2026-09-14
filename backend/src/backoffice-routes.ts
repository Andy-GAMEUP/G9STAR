import type {IncomingMessage} from 'node:http';
import {authenticate,requireRole} from './infrastructure/auth.ts';
import {BackofficeService,isModule} from './backoffice-service.ts';
import {DomainError} from './domain.ts';

type Result={status:number;data:unknown};
const ok=(data:unknown,status=200):Result=>({status,data});

export async function handleBackofficeRoute(req:IncomingMessage,url:URL,method:string,input:Record<string,unknown>,ops:BackofficeService):Promise<Result|null>{
 if(!url.pathname.startsWith('/v1/admin/ops'))return null;
 const principal=await authenticate(req);requireRole(principal,['OPERATOR','SUPER_ADMIN','MD','CS','FINANCE','PARTNER']);
 const path=url.pathname.slice('/v1/admin/ops'.length).split('/').filter(Boolean).map(decodeURIComponent);
 if(method==='GET'&&path.length===0)return ok({modules:ops.modules()});
 if(method==='GET'&&path[0]==='dashboard')return ok(ops.dashboard(principal.role==='PARTNER'?principal.sub:undefined));
 if(method==='GET'&&path[0]==='analytics'){ops.authorize(principal.role,'orders','read');return ok(ops.analytics(principal.role==='PARTNER'?principal.sub:undefined))}
 if(method==='GET'&&path[0]==='roles'){requireRole(principal,['SUPER_ADMIN']);return ok({roles:ops.roleMatrix})}
 if(method==='POST'&&path[0]==='roles'&&path[2]==='permissions')return ok(ops.updateRole(path[1],input.permissions,principal.sub,principal.role));
 if(method==='POST'&&path[0]==='partners'&&path[2]==='api-key')return ok(ops.rotateApiKey(path[1],principal.sub,principal.role));
 if(method==='POST'&&path[0]==='products'&&path[2]==='generate-skus'){ops.authorize(principal.role,'products','write');return ok(ops.generateSkus(path[1],principal.sub),201)}
 if(method==='POST'&&path[0]==='inventory'&&['adjust','receive'].includes(path[2])){ops.authorize(principal.role,'inventory','write');return ok(ops.adjustInventory(path[1],input.delta,input.reason,principal.sub,path[2]==='receive'?'RECEIPT':'ADJUSTMENT'))}
 if(method==='POST'&&path[0]==='showcases'&&path[2]==='hotspots'){ops.authorize(principal.role,'showcases','write');return ok(ops.setHotspots(path[1],input.hotspots,principal.sub))}
 if(method==='POST'&&path[0]==='orders'&&path[2]==='shipment'){ops.authorize(principal.role,'orders','write');return ok(ops.registerShipment(path[1],input,principal.sub))}
 if(method==='POST'&&path[0]==='claims'&&path[2]==='inspect'){ops.authorize(principal.role,'claims','write');return ok(ops.inspectClaim(path[1],input,principal.sub))}
 if(method==='POST'&&path[0]==='claims'&&path[2]==='refund'){ops.authorize(principal.role,'claims','write');return ok(ops.approveRefund(path[1],input,principal.sub,principal.role))}
 if(method==='POST'&&path[0]==='estimates'&&path[2]==='assign'){ops.authorize(principal.role,'estimates','write');return ok(ops.assignEstimate(path[1],input.assignee,input.nextContactAt,principal.sub))}
 if(method==='POST'&&path[0]==='estimates'&&path[2]==='revisions'){ops.authorize(principal.role,'estimates','write');return ok(ops.saveRevision(path[1],input,principal.sub),201)}
 if(method==='POST'&&path[0]==='rentals'&&path[2]==='contract'){ops.authorize(principal.role,'rentals','write');return ok(ops.uploadRentalContract(path[1],input,principal.sub),201)}
 if(method==='POST'&&path[0]==='members'&&path[2]==='memos'){ops.authorize(principal.role,'members','write');return ok(ops.addMemberMemo(path[1],input.text,principal.sub),201)}
 if(method==='POST'&&path[0]==='members'&&path[2]==='force-coupon'){ops.authorize(principal.role,'members','write');return ok(ops.forceMemberCoupon(path[1],input.campaignCode,input.expiresAt,principal.sub),201)}
 if(method==='POST'&&path[0]==='coupons'&&path[2]==='issue'){ops.authorize(principal.role,'coupons','write');return ok(ops.issueMemberCoupon(String(input.memberId||''),path[1],input.expiresAt,principal.sub),201)}
 if(method==='POST'&&path[0]==='coupons'&&path[2]==='suspend'){ops.authorize(principal.role,'coupons','write');return ok(ops.suspendCoupon(path[1],input.reason,Boolean(input.emergency),principal.sub,principal.role))}
 if(method==='POST'&&path[0]==='coupons'&&path[2]==='delete'){ops.authorize(principal.role,'coupons','write');return ok(ops.deleteCoupon(path[1],input.reason,principal.sub,principal.role))}
 if(method==='POST'&&path[0]==='notifications'&&path[1]==='dispatch'){ops.authorize(principal.role,'notifications','write');return ok(ops.dispatchNotification(input.trigger,input.recipient,input.payload,input.idempotencyKey,principal.sub),202)}
 if(method==='POST'&&path[0]==='settlements'&&path[2]==='recalculate'){ops.authorize(principal.role,'settlements','write');return ok(ops.recalculateSettlement(path[1],principal.sub))}
 if(method==='POST'&&path[0]==='settlements'&&path[2]==='confirm'){ops.authorize(principal.role,'settlements','write');return ok(ops.confirmSettlement(path[1],input.expectedAmount,principal.sub,principal.role))}
 if(method==='POST'&&path[0]==='integrations'&&path[2]==='reprocess'){ops.authorize(principal.role,'integrations','write');return ok(ops.reprocessIntegration(path[1],principal.sub),202)}
 if(path.length&&isModule(path[0])){
  const module=path[0];
  const partnerId=principal.role==='PARTNER'&&module!=='partners'?principal.sub:url.searchParams.get('partnerId')||undefined;
  const listQuery={q:url.searchParams.get('q')||undefined,status:url.searchParams.get('status')||undefined,partnerId,category:url.searchParams.get('category')||undefined,page:Number(url.searchParams.get('page')||1),pageSize:Number(url.searchParams.get('pageSize')||20),sort:url.searchParams.get('sort')||undefined,direction:url.searchParams.get('direction')==='asc'?'asc' as const:'desc' as const};
  if(method==='GET'&&path[1]==='export'){ops.authorize(principal.role,module,'read');if(principal.role==='PARTNER'&&module==='partners')throw new DomainError('FORBIDDEN','파트너 마스터 내보내기 권한이 없습니다.',403);return ok(ops.exportRows(module,listQuery))}
  if(method==='POST'&&path[1]==='bulk-status'){ops.authorize(principal.role,module,'write');return ok(ops.bulkTransition(module,input.ids,input.status,principal.sub))}
  if(method==='GET'&&path.length===1){ops.authorize(principal.role,module,'read');if(principal.role==='PARTNER'&&module==='partners')return ok({items:[ops.assertPartnerScope(module,principal.sub,principal.sub)],page:1,pageSize:1,total:1,totalPages:1});return ok(ops.list(module,listQuery))}
  if(method==='POST'&&path.length===1){ops.authorize(principal.role,module,'write');return ok(ops.create(module,input,principal.sub),201)}
  if(method==='GET'&&path.length===2){ops.authorize(principal.role,module,'read');if(principal.role==='PARTNER')ops.assertPartnerScope(module,path[1],principal.sub);return ok(ops.detail(module,path[1]))}
  if(method==='POST'&&path[2]==='update'){ops.authorize(principal.role,module,'write');return ok(ops.update(module,path[1],input,principal.sub,principal.role))}
  if(method==='POST'&&path[2]==='status'){ops.authorize(principal.role,module,'write');return ok(ops.transition(module,path[1],String(input.status||''),principal.sub))}
 }
 throw new DomainError('ROUTE_NOT_FOUND','백오피스 경로를 찾을 수 없습니다.',404);
}
