import {DomainError,PlatformService} from './domain.ts';
import type {Role} from './domain.ts';

type Coupon={code:string;target:string;partnerId:string|null;benefit:string;status:string;memberId:string|null;orderId:string|null;updatedAt:string;reason?:string;actor?:string};

export class AdminService{
 private platform:PlatformService;
 private coupons:Coupon[]=[
  {code:'WELCOME50',target:'신규회원',partnerId:'P-A',benefit:'50,000원',status:'USED',memberId:'M-1029',orderId:'O-0291',updatedAt:'2026-09-12T11:14:00.000Z'},
  {code:'PARTNERA10',target:'A Partner',partnerId:'P-A',benefit:'10%',status:'ACTIVE',memberId:null,orderId:null,updatedAt:'2026-09-12T00:00:00.000Z'},
  {code:'VIP100',target:'M-1012',partnerId:null,benefit:'100,000원',status:'USED',memberId:'M-1012',orderId:'O-0271',updatedAt:'2026-09-10T00:00:00.000Z'},
  {code:'OLDSEP5',target:'B Partner',partnerId:'P-B',benefit:'5%',status:'REVOKED',memberId:null,orderId:null,updatedAt:'2026-09-08T05:22:00.000Z',reason:'프로모션 조기종료',actor:'admin02'}
 ];
 constructor(platform:PlatformService){this.platform=platform}
 dashboard(memberId='M-1029',partnerId='P-A',period='2026-09-01'){
  const member=this.platform.db.members.get(memberId);if(!member)throw new DomainError('MEMBER_NOT_FOUND','회원을 찾을 수 없습니다.',404);
  const partner=this.platform.db.partners.get(partnerId);if(!partner)throw new DomainError('PARTNER_NOT_FOUND','파트너를 찾을 수 없습니다.',404);
  const requests=[...this.platform.db.requests.values()].filter(request=>request.memberId===memberId).reverse();
  const ledger=[...this.platform.db.ledger.values()].filter(item=>item.partnerId===partnerId&&item.period===period);
  const settlement=[...this.platform.db.settlements.values()].find(item=>item.partnerId===partnerId&&item.period===period);
  if(!settlement)throw new DomainError('SETTLEMENT_NOT_FOUND','정산을 찾을 수 없습니다.',404);
  const couponCounts=this.coupons.reduce((counts,item)=>({...counts,[item.status]:(counts[item.status]||0)+1}),{} as Record<string,number>);
  const negatives=[...this.platform.db.negatives.values()].filter(negative=>negative.partnerId===partnerId);
  return{member,request:requests[0]||null,referrals:[...this.platform.db.referrals.values()].filter(referral=>referral.status==='ACTIVE'),ledger,settlement,partner,coupons:this.coupons,couponCounts,negatives,audit:this.platform.db.audit};
 }
 rejectAttribution(requestId:string,reason:string,actor:string,role:Role){if(role!=='SUPER_ADMIN')throw new DomainError('FORBIDDEN','슈퍼관리자 권한이 필요합니다.',403);const request=this.platform.db.requests.get(requestId);if(!request||request.status!=='PENDING')throw new DomainError('REQUEST_NOT_PENDING','승인 대기 요청이 없습니다.',404);if(request.requestedBy===actor)throw new DomainError('SEGREGATION_OF_DUTIES','요청자와 승인자는 같을 수 없습니다.');request.status='REJECTED';request.approvedBy=actor;this.platform.db.log('ATTRIBUTION_CHANGE_REJECTED',actor,{requestId,reason,requestedBy:request.requestedBy,approvedBy:actor});return request}
 createCoupon(input:{code:string;target:string;partnerId?:string;benefit:string},actor:string){const code=input.code.trim().toUpperCase();if(this.coupons.some(item=>item.code===code))throw new DomainError('COUPON_CODE_DUPLICATED','이미 존재하는 쿠폰코드입니다.',409);const coupon={...input,code,partnerId:input.partnerId||null,status:'ACTIVE',memberId:null,orderId:null,updatedAt:new Date().toISOString()};this.coupons.unshift(coupon);this.platform.db.log('COUPON_CAMPAIGN_CREATED',actor,{code,target:input.target,partnerId:coupon.partnerId,benefit:input.benefit});return coupon}
 suspendCoupon(code:string,reason:string,actor:string,role:Role){if(role!=='SUPER_ADMIN')throw new DomainError('FORBIDDEN','쿠폰 중지는 슈퍼관리자 권한이 필요합니다.',403);const coupon=this.coupons.find(item=>item.code===code);if(!coupon)throw new DomainError('COUPON_NOT_FOUND','쿠폰을 찾을 수 없습니다.',404);if(coupon.status==='USED')throw new DomainError('COUPON_ALREADY_USED','사용 완료 쿠폰은 중지할 수 없습니다.',409);coupon.status='SUSPENDED';coupon.updatedAt=new Date().toISOString();Object.assign(coupon,{reason,actor});this.platform.db.log('COUPON_CAMPAIGN_SUSPENDED',actor,{code,reason,softDelete:true});return coupon}
 restoreCoupon(code:string,actor:string,role:Role){if(role!=='SUPER_ADMIN')throw new DomainError('FORBIDDEN','쿠폰 복원은 슈퍼관리자 권한이 필요합니다.',403);const coupon=this.coupons.find(item=>item.code===code);if(!coupon||!['SUSPENDED','REVOKED'].includes(coupon.status))throw new DomainError('COUPON_NOT_RESTORABLE','복원 가능한 쿠폰이 아닙니다.',409);coupon.status='ACTIVE';coupon.updatedAt=new Date().toISOString();this.platform.db.log('COUPON_CAMPAIGN_RESTORED',actor,{code});return coupon}
}
