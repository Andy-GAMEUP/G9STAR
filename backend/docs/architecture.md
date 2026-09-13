# Backend Architecture Decision 001

## 결정

초기 백엔드는 모듈형 모놀리스로 구축한다. 추천인·쿠폰·파트너·수수료·정산을 하나의 트랜잭션 경계에서 처리하되 모듈별 저장소 인터페이스를 유지한다. PostgreSQL을 최종 원장으로 사용하고 모든 금액·상태 변경은 감사 이벤트를 남긴다.

## 원칙

1. 회원의 최초 귀속은 갱신하지 않는다. 현재 귀속과 효력 시작일만 변경한다.
2. 주문에는 추천인·파트너·쿠폰·수수료 규칙 snapshot을 저장한다.
3. 쿠폰 예약은 조건 검증과 같은 DB 트랜잭션에서 원자적으로 처리한다.
4. 결제·취소 webhook은 idempotency key로 중복 처리를 막는다.
5. 분쟁 HOLD는 거래 원장 항목에 적용하고 정산 전체 상태와 구분한다.
6. 세금계산서 및 재검증 HOLD는 partner-period 지급에만 적용한다.
7. 운영관리자와 슈퍼관리자 권한을 분리하고 요청자와 승인자를 분리한다.

## 구현 완료

- PostgreSQL 연결 풀과 트랜잭션 경계
- JWT 인증 및 역할 미들웨어
- OpenAPI 3.1 명세
- Medusa 주문·렌탈 webhook 서명·멱등 처리

## 다음 단계

- 도메인 Map 저장소를 PostgreSQL repository 구현으로 교체
- 정산 마감·이의기간·지급일 스케줄러
- webhook outbox publisher와 재시도 정책
- 운영용 secret manager 및 key rotation
