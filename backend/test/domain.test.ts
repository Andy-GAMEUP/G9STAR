import test from 'node:test';import assert from 'node:assert/strict';
import {DomainError,PlatformService,purchaseCommission,rentalCommission} from '../src/domain.ts';

test('직접 확인 추천코드로 가입하고 최초 귀속을 보존한다',()=>{const s=new PlatformService(),m=s.signup({name:'홍길동',linkCode:'RS-B002-SEO',directCode:' rs-a001-kim '});assert.equal(m.firstAttribution.code,'RS-A001-KIM');assert.deepEqual(m.firstAttribution,m.currentAttribution)});
test('RF-04 미래 귀속 승인은 현재 귀속을 유지하고 effective_from 이후 신규 거래에만 적용한다',()=>{const s=new PlatformService(),m=s.signup({name:'홍길동',directCode:'RS-A001-KIM'}),r=s.requestAttributionChange({memberId:m.id,targetCode:'RS-B002-SEO',effectiveFrom:'2026-10-01T00:00:00.000Z',reason:'권역 변경'},'operator01','OPERATOR');assert.throws(()=>s.approveAttributionChange(r.id,'operator01','OPERATOR'),(e:DomainError)=>e.code==='FORBIDDEN');const changed=s.approveAttributionChange(r.id,'super01','SUPER_ADMIN');assert.equal(changed.firstAttribution.partnerId,'P-A');assert.equal(changed.currentAttribution.partnerId,'P-A');assert.equal(s.effectiveAttribution(m.id,'2026-09-20T00:00:00.000Z').partnerId,'P-A');assert.equal(s.effectiveAttribution(m.id,'2026-10-02T00:00:00.000Z').partnerId,'P-B')});

test('RF-03 잘못된 직접입력은 유효한 링크 코드를 덮어쓰지 않는다',()=>{const s=new PlatformService();
 assert.equal(s.signup({name:'A',linkCode:'RS-A001-KIM',directCode:'RS-NOPE-XX'}).firstAttribution.code,'RS-A001-KIM');
 assert.equal(s.signup({name:'B',linkCode:'RS-A001-KIM',directCode:'RS-B002-SEO'}).firstAttribution.code,'RS-B002-SEO');
 assert.throws(()=>s.signup({name:'C',linkCode:'RS-NOPE-XX'}),(e:DomainError)=>e.code==='REFERRAL_NOT_FOUND')});

test('RF-04 소급 승인은 즉시 반영하고 정산 재계산을 표시한다',()=>{const s=new PlatformService(),m=s.signup({name:'홍',directCode:'RS-A001-KIM'});
 const r=s.requestAttributionChange({memberId:m.id,targetCode:'RS-B002-SEO',effectiveFrom:'2026-01-01T00:00:00.000Z',reason:'소급',retroactive:true},'reqadmin','SUPER_ADMIN');
 const changed=s.approveAttributionChange(r.id,'super01','SUPER_ADMIN');
 assert.equal(changed.currentAttribution.partnerId,'P-B');assert.equal(s.db.audit[0].detail.recalculationRequired,true)});

test('RF-01 이전 추천코드는 alias로 보존되어 가입·검증에 사용된다',()=>{const s=new PlatformService();
 s.registerReferralAlias('RS-OLD-KIM','RS-A001-KIM','system');
 assert.equal(s.validateReferral('rs-old-kim').partnerId,'P-A');
 assert.equal(s.signup({name:'X',directCode:'RS-OLD-KIM'}).firstAttribution.code,'RS-A001-KIM')});
test('요청자와 승인자를 분리한다',()=>{const s=new PlatformService(),m=s.signup({name:'홍길동',directCode:'RS-A001-KIM'}),r=s.requestAttributionChange({memberId:m.id,targetCode:'RS-B002-SEO',effectiveFrom:'2026-10-01',reason:'예외'},'super01','SUPER_ADMIN');assert.throws(()=>s.approveAttributionChange(r.id,'super01','SUPER_ADMIN'),(e:DomainError)=>e.code==='SEGREGATION_OF_DUTIES')});
test('회원 쿠폰은 귀속을 바꾸지 않고 예약 실패 시 복구된다',()=>{const s=new PlatformService(),m=s.signup({name:'홍길동',directCode:'RS-A001-KIM'}),before=m.currentAttribution,c=s.registerCoupon(m.id,'PARTNERA10');assert.deepEqual(m.currentAttribution,before);s.reserveCoupon(c.id,m.id,780000,'PAY-1');assert.equal(c.status,'RESERVED');s.completeCoupon(c.id,'PAY-1',false);assert.equal(c.status,'ISSUED');s.reserveCoupon(c.id,m.id,780000,'PAY-2');s.completeCoupon(c.id,'PAY-2',true);assert.equal(c.status,'USED');s.restoreFullCancellation(c.id);assert.equal(c.status,'ISSUED')});
test('구매와 렌탈 수수료 산식을 적용한다',()=>{assert.equal(purchaseCommission(780000,10000,0,.08),61600);assert.deepEqual(rentalCommission(12000000,.08),{total:960000,upfront:480000,remaining:480000})});
test('예약 시점에 만료된 쿠폰은 인메모리에서도 거부한다',()=>{const s=new PlatformService();s.db.coupons.set('EXP',{id:'EXP',memberId:'M-1029',campaignCode:'OLD',title:'만료 쿠폰',amount:5000,minAmount:0,status:'ISSUED',expiresAt:'2020-01-01T00:00:00.000Z'});assert.throws(()=>s.reserveCoupon('EXP','M-1029',100000,'PAY-X'),(e:DomainError)=>e.code==='COUPON_EXPIRED');s.db.coupons.set('OK',{id:'OK',memberId:'M-1029',campaignCode:'NEW',title:'유효 쿠폰',amount:5000,minAmount:0,status:'ISSUED',expiresAt:'2999-01-01T00:00:00.000Z'});assert.equal(s.reserveCoupon('OK','M-1029',100000,'PAY-Y').status,'RESERVED')});
test('분쟁은 개별 원장 건만 홀드한다',()=>{const s=new PlatformService();s.db.ledger.set('L1',{id:'L1',partnerId:'P-A',period:'2026-09',transactionId:'O-1',kind:'PURCHASE',amount:61600,status:'READY'});s.db.ledger.set('L2',{id:'L2',partnerId:'P-A',period:'2026-09',transactionId:'O-2',kind:'PURCHASE',amount:80000,status:'READY'});s.holdDispute('O-1','operator01');assert.equal(s.db.ledger.get('L1')?.status,'HOLD');assert.equal(s.db.ledger.get('L2')?.status,'READY')});
test('세금계산서 해소 후 특별 지급, 재검증 중에는 지급만 홀드한다',()=>{const s=new PlatformService();s.db.settlements.set('S1',{id:'S1',partnerId:'P-A',period:'2026-09',status:'REVIEW',disputeWindow:'OPEN',taxStatus:'MISSING'});assert.equal(s.finalizeSettlement('S1').status,'HELD');assert.equal(s.verifyTax('S1','operator01').status,'SPECIAL_PAY');const p=s.startPartnerReview('P-A','ANNUAL','operator01');assert.equal(p.payoutHold,true);assert.equal(p.status,'REVIEW');assert.equal(s.completePartnerReview('P-A','super01','SUPER_ADMIN').payoutHold,false)});
test('계약 종료는 신규 활동을 차단하고 종료 전 정산 표시를 남긴다',()=>{const s=new PlatformService(),p=s.endPartner('P-A','super01','SUPER_ADMIN');assert.equal(p.status,'ENDED');assert.equal(s.db.audit[0].detail.settlePreEndTransactions,true)});

test('ST-02 렌탈 최종 정산은 잔여를 지급하고 부족분은 마이너스 수수료로 등록한다',()=>{const s=new PlatformService();
 const normal=s.finalizeRentalCommission({contractId:'R-1',partnerId:'P-A',period:'2026-09-01',committedRent:12000000,recognizedCommitment:12000000,rate:.08},'finance01');
 assert.equal(normal.kind,'RENTAL_FINAL');assert.equal(normal.total,960000);assert.equal(normal.upfront,480000);assert.equal(normal.amount,480000);
 assert.ok([...s.db.ledger.values()].some(x=>x.kind==='RENTAL_FINAL'&&x.amount===480000));
 const short=s.finalizeRentalCommission({contractId:'R-2',partnerId:'P-A',period:'2026-09-01',committedRent:12000000,recognizedCommitment:3000000,rate:.08,terminationType:'BREACH'},'finance01');
 assert.equal(short.kind,'NEGATIVE');assert.equal(short.amount,240000);
 assert.equal([...s.db.negatives.values()].find(n=>n.transactionId==='R-2')?.remaining,240000)});

test('ST-03 마이너스 수수료를 오래된 건부터 상계하고 반환청구·입금까지 처리한다',()=>{const s=new PlatformService();
 const a=s.registerNegativeCommission('P-A','R-old',100000,'shortfall','finance01');
 const b=s.registerNegativeCommission('P-A','R-new',80000,'shortfall','finance01');
 const r=s.offsetNegativeCommissions('P-A',130000,'finance01');
 assert.equal(r.totalOffset,130000);assert.equal(r.remainingCommission,0);
 assert.equal(s.db.negatives.get(a.id)?.status,'RECOVERED');
 assert.equal(s.db.negatives.get(b.id)?.status,'PARTIALLY_OFFSET');assert.equal(s.db.negatives.get(b.id)?.remaining,50000);
 s.convertNegativeToReclaim(b.id,'계약 종료','finance01');assert.equal(s.db.negatives.get(b.id)?.status,'RECLAIM_REQUESTED');
 s.confirmNegativeDeposit(b.id,50000,'finance01');assert.equal(s.db.negatives.get(b.id)?.status,'RECOVERED');assert.equal(s.db.negatives.get(b.id)?.remaining,0);
 const c=s.registerNegativeCommission('P-B','R-x',10000,'shortfall','finance01');
 assert.throws(()=>s.markNegativeUnrecoverable(c.id,'폐업','finance01','FINANCE'),(e:DomainError)=>e.code==='FORBIDDEN');
 assert.equal(s.markNegativeUnrecoverable(c.id,'폐업','super01','SUPER_ADMIN').status,'UNRECOVERABLE')});

test('ST-04 분쟁 HOLD 거래는 자동확정 시 보류 목록으로 분리한다',()=>{const s=new PlatformService();
 s.db.ledger.set('L1',{id:'L1',partnerId:'P-A',period:'2026-09-01',transactionId:'O-1',kind:'PURCHASE',amount:61600,status:'READY'});
 s.db.ledger.set('L2',{id:'L2',partnerId:'P-A',period:'2026-09-01',transactionId:'O-2',kind:'PURCHASE',amount:80000,status:'READY'});
 s.db.settlements.set('S1',{id:'S1',partnerId:'P-A',period:'2026-09-01',status:'REVIEW',disputeWindow:'OPEN',taxStatus:'VERIFIED'});
 s.holdDispute('O-2','operator01');
 const fin=s.finalizeSettlement('S1');
 assert.equal(fin.status,'FINAL');assert.deepEqual(fin.heldTransactions,['O-2']);assert.equal(s.db.audit[0].detail.noDispute,false)});

test('ST-05 파트너 패소 분쟁은 보류액을 취소하고 기지급분을 마이너스 수수료로 환수한다',()=>{const s=new PlatformService();
 s.db.ledger.set('L1',{id:'L1',partnerId:'P-A',period:'2026-09-01',transactionId:'O-9',kind:'PURCHASE',amount:61600,status:'READY'});
 s.holdDispute('O-9','operator01');
 assert.throws(()=>s.resolveDisputeAgainstPartner('O-9',{},'operator01','OPERATOR'),(e:DomainError)=>e.code==='FORBIDDEN');
 const r=s.resolveDisputeAgainstPartner('O-9',{clawbackPaid:61600},'super01','SUPER_ADMIN');
 assert.equal(s.db.ledger.get('L1')?.status,'CANCELLED');
 assert.ok(r.negativeId);assert.equal([...s.db.negatives.values()].find(n=>n.id===r.negativeId)?.remaining,61600)});

test('CP-07 부분취소는 상품별 비례배분 실결제액만 환불하고 원 쿠폰은 USED를 유지한다',()=>{const s=new PlatformService();
 s.db.coupons.set('C1',{id:'C1',memberId:'M-1',campaignCode:'X',title:'t',amount:0,minAmount:0,discountAmount:30000,status:'USED',expiresAt:'2999-01-01T00:00:00.000Z'});
 const res=s.partialCancellation('C1',{items:[{id:'a',price:100000},{id:'b',price:200000},{id:'c',price:300000}],cancelledIds:['a']},'cs01');
 assert.equal(res.couponStatus,'USED');assert.equal(res.shares.a,5000);assert.equal(res.shares.b,10000);assert.equal(res.shares.c,15000);assert.equal(res.refund,95000);
 assert.equal(s.db.coupons.get('C1')?.status,'USED')});
