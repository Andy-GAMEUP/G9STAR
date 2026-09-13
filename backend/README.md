# 지구별놀이터 Backend

확정된 추천인·쿠폰·파트너 정산 정책과 Figma A-01~A-13 백오피스 업무를 집행하는 백엔드다. Node.js 22로 실행되며 개발용 메모리 모드와 PostgreSQL 운영 모드를 모두 제공한다.

## 실행

```bash
npm test
ALLOW_DEV_TOKEN=true npm run dev
npm run worker
```

기본 주소는 `http://localhost:4100`이다. 로컬 개발에서 관리자 화면의 무인증 `/dev/token`을 쓰려면 `ALLOW_DEV_TOKEN=true`로 실행한다. 이 값이 없으면 서버는 운영 배포로 간주해 32자 이상의 `JWT_SECRET`과 `MEDUSA_WEBHOOK_SECRET`(기본값 불가)을 요구하며, 누락 시 기동을 중단한다.

로컬 PostgreSQL을 사용할 수 있는 환경에서는 `docker compose up -d postgres`로 DB를 시작하고 `.env.example`을 기준으로 환경변수를 설정한다. PostgreSQL 17에서 마이그레이션·트랜잭션 rollback을 실제 검증했으며, `TEST_DATABASE_URL`이 설정되면 정산 Worker의 지급 격리와 Outbox 재시도까지 통합시험한다.

환경변수:

- `DATABASE_URL`: 설정하면 PostgreSQL 모드, 없으면 개발용 메모리 모드
- `JWT_SECRET`: 32자 이상의 관리자 API 서명 키
- `MEDUSA_WEBHOOK_SECRET`: Medusa 웹훅 HMAC-SHA256 검증 키
- `NODE_ENV=production`: 개발용 토큰 발급 경로 비활성화

운영 DB에는 `npm run migrate`로 `001`~`005_backoffice_policy_sync.sql` 마이그레이션을 순서대로 적용한다. 적용 이력과 SHA-256 checksum은 `schema_migrations`에 저장되며, 동시 실행은 PostgreSQL advisory lock으로 직렬화된다. 이미 적용된 파일이 변경되면 배포를 중단한다.

실 PostgreSQL 통합 검증:

```bash
DATABASE_URL=postgresql://earthplayground:change-me@localhost:5432/earthplayground npm run migrate
TEST_DATABASE_URL=postgresql://earthplayground:change-me@localhost:5432/earthplayground npm run test:postgres
```

API 계약은 서버의 `/openapi.json`에서 확인한다. 잘못된 JSON은 `400 INVALID_JSON`, 스키마 입력 오류는 `422 VALIDATION_ERROR`, 1MB 초과 본문은 `413 PAYLOAD_TOO_LARGE`로 응답한다. 오류 본문은 `code`, `message`, `details`, `correlationId`를 가지며 `x-correlation-id` 요청 헤더가 있으면 응답에서도 유지한다.

관리자 프런트 실행:

```bash
cd ..
python3 -m http.server 4200 --directory prototype
```

브라우저에서 `http://localhost:4200/admin.html`을 연다. 기본 API 주소는 `http://127.0.0.1:4100`이며, 필요하면 브라우저 콘솔에서 `localStorage.setItem('earthplayground-api','https://api.example.com')`으로 변경할 수 있다. 개발 모드에서는 화면 상단에서 운영관리자와 슈퍼관리자 권한을 전환해 권한별 흐름을 시험한다.

고객 프런트는 `http://localhost:4200/signup.html?ref=RS-A001-KIM`에서 시작한다. 추천코드 확인과 회원가입, 파트너 쿠폰 등록, 주문 쿠폰 예약·사용, 결제 실패 해제와 전체 취소 복원을 실제 API로 처리한다.

Worker 환경변수:

- `DATABASE_URL`: 필수
- `OUTBOX_TARGET_URL`: 이벤트 수신 서비스 주소
- `OUTBOX_TOKEN`: 수신 서비스 인증 토큰

Worker는 1분마다 이의신청 기한 종료, 지급 가능 정산 처리와 Outbox 발행을 실행한다. 실패한 Outbox 이벤트는 지수 백오프로 재시도한다.

## 구현 범위

- `/v1/admin/ops` 하위 16개 모듈: 파트너, 추천, 쿠폰, 상품, 재고, 쇼케이스, 주문, 클레임, 견적, 렌탈, 회원, 콘텐츠, 알림, 정산, 관리자, 연동
- 모듈 공통 CRUD, 검색·필터·정렬·페이징, CSV 내보내기, 원자적 대량 상태 변경
- Role Matrix(`MD`, `CS`, `FINANCE`, `PARTNER`, `OPERATOR`, `SUPER_ADMIN`) 및 파트너 소유 범위 강제
- 상품 옵션 SKU 생성, 입고·조정·안전재고, Hotspot 좌표·상품 검증
- 주문 배송, 반품 검수, PG 환불·쿠폰·정산 조정 연계
- 견적 Revision·담당자·고객발송 게이트, 렌탈 계약·설치인수·첫 납부 게이트
- 회원 360·CRM 메모·강제 쿠폰, 콘텐츠 예약, 멱등 알림 자동화
- 퍼널·GMV·파트너 분석, 정산 재계산·직무분리 확정·잠금
- API Key 해시 보관·1회 표시, 실패 연동 재처리, 변경 감사 기록

- 추천코드 정규화·상태 검증과 최초/현재 귀속
- 미래 귀속 변경 요청과 슈퍼관리자 승인
- 캠페인 마스터에서 회원 쿠폰 발급
- `ISSUED → RESERVED → USED`, 실패 복구와 전액취소 복원
- 구매 수수료 및 렌탈 50% 선 정산 계산
- 개별 분쟁 건 HOLD와 마이너스 수수료
- 월 정산 확정, 세금계산서 파트너·월 단위 HOLD
- 파트너 재검증 지급 HOLD와 계약 종료 차단
- 모든 변경의 append-only 감사 이벤트
- PostgreSQL 연결 풀과 트랜잭션 rollback
- JWT 인증 및 운영관리자·슈퍼관리자 역할 검사
- Medusa 웹훅 HMAC 서명 검증과 멱등 처리
- OpenAPI 3.1 명세
- Figma A-01B/A-10D 기반 관리자 대시보드와 쿠폰 Lifecycle
- 회원 귀속 승인·반려, 거래 HOLD, 월 정산·세금계산서·지급, 파트너 재검증 UI
- 관리자 권한별 제어, 확인 모달, 감사로그 검색, 로딩·오류·반응형 상태
- 핵심 쓰기 경로 PostgreSQL repository
- 정산·지급 worker와 대한민국 영업일 계산
- Outbox publisher 및 지수 백오프 재시도

## 경계

- Medusa: 상품·가격·재고·주문·결제의 원장 소유
- 본 API: 추천인 귀속, 쿠폰 정책 오케스트레이션, 파트너·수수료·정산 원장 소유
- Strapi: 쇼케이스·Hotspot·에디토리얼 콘텐츠 소유
- PostgreSQL: 금액·상태·승인·감사 기록의 최종 저장소

금액은 모두 원 단위 정수이며 시간은 UTC로 저장한다. 고객 정책 표시는 `Asia/Seoul`을 사용한다.
