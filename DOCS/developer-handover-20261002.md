# G9STAR 개발자 인수인계

작성 기준: 2026-10-02. 실제 저장소 코드, 배포 검증 결과 및 공개 DNS를 기준으로 작성했다. 계정 콘솔에서 확인하지 못한 항목은 확인 필요로 표시했다. 비밀번호, API 키, DB 연결 문자열 및 고객 데이터는 이 문서에 포함하지 않는다.

## 1. 운영 서비스와 소스 기준

- 저장소: https://github.com/Andy-GAMEUP/G9STAR
- 운영 배포 브랜치: `beta/cloudflare-preflight-20261001` (기본 브랜치와 구분).
- 이 문서 작성 시 운영 코드 기준 커밋: `2474a53348edf3e6d60fb64b2120d4ce7824e42b`.
- 공개 홈페이지: https://www.g9star.co.kr
- 관리자 콘솔: https://www.g9star.co.kr/admin
- 상태 확인: https://www.g9star.co.kr/api/health
- Worker 이름: `g9star-beta`. 기존 Worker 주소: `https://g9star-beta.andy-25a.workers.dev`.
- 공개 베타: 일반 사용자는 누구나 접근 가능하다. 관리자 업무와 회원 API는 인증 및 권한 검사를 거친다.

| 서비스 | 실제 용도 | 설정 기준 |
| --- | --- | --- |
| Cloudflare Workers + Static Assets | 프론트 파일 배포, 같은 출처의 `/api/*` 실행 | `cloudflare/wrangler.jsonc` |
| Neon PostgreSQL | 회원·관리자·견적·업무 상태와 요청 제한 데이터 영속 저장 | `DATABASE_URL` Secret |
| Cloudflare R2 | 백오피스 업로드 파일 저장 | `UPLOADS`, 버킷 `g9star-beta-assets` |
| Cloudflare Turnstile | 가입·로그인·메일 요청·견적 접수 등의 봇 방어 | 사이트 키와 Secret |
| Resend | 견적 알림, 이메일 인증, 임시 비밀번호 발송 | API 키와 인증된 발신 주소 |
| 가비아 | `g9star.co.kr` 도메인 등록·갱신 | 네임서버는 Cloudflare로 위임 |
| Cloudflare DNS | 도메인 DNS 및 Worker Custom Domain | 아래 도메인 항목 참고 |

초기 소규모 무료 서비스 구성을 전제로 한다. 각 서비스의 실제 플랜, 사용량, 무료 한도 및 결제 설정은 해당 콘솔에서 확인해야 한다. Render, D1, Medusa, Strapi는 현재 공개 베타의 배포 대상으로 사용하지 않는다. 소스의 관련 코드·문서는 확장 또는 기존 Node 서버 구성이다.

## 2. 코드 구성

| 위치 | 내용 |
| --- | --- |
| `prototype/` | HTML, CSS, 브라우저 JavaScript. 별도 프론트 빌드 없이 Static Assets로 배포 |
| `prototype/admin.html`, `admin-auth.js`, `admin-pages.js`, `admin.js` | 관리자 인증, 메뉴별 화면, 업무 UI |
| `prototype/login.html`, `signup.html`, `member-auth.js` | 회원 로그인·가입·인증·복구 |
| `prototype/beta.js`, `portal.js`, `rental-data.js`, `estimate.js` | API 연결, 회원 상태, 렌탈 목록, 견적 접수 |
| `prototype/responsive.css` | 모바일 공통 반응형 보정 |
| `cloudflare/worker.ts` | API 진입, 인증, Origin 검사, Turnstile, 요청 제한, 메일 재시도 Cron |
| `cloudflare/state.ts` | Neon 상태 읽기·쓰기 및 R2 연동 |
| `cloudflare/admin-accounts.ts`, `member-accounts.ts`, `email.ts` | 계정·세션·복구·이메일 처리 |
| `cloudflare/migrations/0001_beta.sql` | 현재 베타 DB의 두 테이블 생성 |
| `backend/src/` | 도메인·백오피스 업무 로직. Worker에서 재사용 |
| `backend/src/server.ts`, `backend/migrations/` | 별도 Node 서버 실행 및 정규화 DB 구성. 현재 Worker DB와 구분 |
| `cloudflare/test/`, `backend/test/` | 자동 테스트 |
| `cloudflare/README.md` | Cloudflare 초기 설정 및 배포 안내 |

`/api/*`는 Worker가 먼저 처리하고 나머지는 정적 파일로 전달한다. 공개 프론트의 API 기준은 같은 출처의 `/api`다. `/admin?page=...`는 메뉴별 페이지 주소이며 메뉴 변경 시 문서를 다시 로드한다. 로그인 화면이 잠깐 나타나던 현상은 초기 인증 표시를 수정했고, 자동 목록 조회의 성공 알림은 화면 내 건수 표시로 변경했다.

## 3. 개발 환경과 로컬 실행

Node.js 22 이상이 필요하다. 이번 검증 환경은 Node.js `v24.19.0`이다. npm 잠금 파일을 사용한다. 저장소 루트에는 통합 npm 프로젝트가 없다.

```bash
git clone https://github.com/Andy-GAMEUP/G9STAR.git
cd G9STAR
git switch beta/cloudflare-preflight-20261001
npm ci --prefix backend
npm ci --prefix cloudflare
```

권장 로컬 개발 대상은 현재 운영 구조와 같은 Worker다.

1. 운영 DB와 분리된 Neon 개발 브랜치 또는 개발 DB를 준비한다.
2. 그 DB에 `cloudflare/migrations/0001_beta.sql`을 실행한다.
3. `cloudflare/.dev.vars`에 아래 Secret을 개발용 값으로 설정한다. 이 파일은 Git 제외 대상이다.
4. 개발용 Turnstile 설정을 준비한다. 필요하면 로컬 실행에 한해서 `CHALLENGE_REQUIRED`를 끈다.
5. `cloudflare` 폴더에서 `npm run dev`를 실행하고 터미널에 표시된 주소를 사용한다.

```dotenv
DATABASE_URL="<개발용 Neon SSL 연결 문자열>"
JWT_SECRET="<개발용 무작위 32자 이상 값>"
ADMIN_PASSWORD="<개발용 초기 마스터 비밀번호>"
RESEND_API_KEY="<개발용 Resend 키>"
TURNSTILE_SECRET_KEY="<개발용 Turnstile Secret>"
```

```bash
cd cloudflare
npm run dev
# 로컬 봇 검증을 끄는 경우에만 사용
npm run dev -- --var CHALLENGE_REQUIRED:false
```

운영 DB·운영 메일 수신자를 연결한 채 테스트하지 않는다. 로컬 메일 수신자·발신자 변수도 개발용으로 덮어쓴다. 정적 HTTP 서버만 실행하면 Worker API와 인증이 제공되지 않는다. `backend`의 `npm run dev`는 별도 Node 개발 모드이며 현재 Worker의 계정 인증 흐름과 동일한 배포 환경이 아니다.

## 4. Cloudflare 설정과 비밀값 관리

현재 `wrangler.jsonc`: `main=worker.ts`, `compatibility_date=2026-10-01`, `nodejs_compat`, 정적 자산 `../prototype`, `run_worker_first=["/api/*"]`, `keep_vars=true`, 관측 로그 활성화, Cron `*/5 * * * *`.

| 이름 | 종류 | 용도 / 확인된 설정 |
| --- | --- | --- |
| `DATABASE_URL` | Secret | Neon PostgreSQL 연결 문자열. SSL 연결 사용. 실제 값은 Neon 콘솔에서 확인 |
| `JWT_SECRET` | Secret | 토큰 서명용 무작위 32자 이상. 변경하면 기존 토큰 검증에 영향 |
| `ADMIN_PASSWORD` | Secret | 최초 마스터 계정 생성용. 생성 후 DB에 저장된 비밀번호가 기준 |
| `RESEND_API_KEY` | Secret | Resend 발송 키 |
| `TURNSTILE_SECRET_KEY` | Secret | 서버 측 Turnstile 검증 |
| `ADMIN_LOGIN` | Variable | 등록된 운영 이메일(Worker 콘솔 확인) |
| `QUOTE_RECIPIENT` | Variable | 견적 수신자 등록된 운영 이메일(Worker 콘솔 확인) |
| `QUOTE_FROM` | Variable | Resend에서 인증한 발신 주소. 현재 정확한 주소는 콘솔 확인 필요 |
| `TURNSTILE_SITE_KEY` | Variable | 공개 사이트 키. 실제 값은 콘솔 확인 필요 |
| `CHALLENGE_REQUIRED` | Variable | 운영 `true` |
| `BETA_HOSTNAME` | Variable | 추가 Turnstile 허용 호스트. 설정 여부와 값은 콘솔 확인 필요 |

Secret은 Worker의 런타임 Variables and Secrets 또는 `npx wrangler secret put DATABASE_URL` 같은 명령의 입력창으로 등록한다. 빌드 환경 변수와 런타임 Secret을 혼동하지 않는다. Secret을 프론트 파일, MD, 커밋, 명령 인자 또는 로그에 붙여 넣지 않는다.

`ADMIN_PASSWORD` 환경값만 바꿔도 기존 관리자 비밀번호가 변경되는 것은 아니다. 관리자 화면의 비밀번호 변경·복구 기능을 사용한다. `keep_vars=true`는 콘솔 변수 보존 설정이며, 저장소에 명시된 변수도 변경 시 함께 검토한다.

## 5. Neon DB와 영속성

현재 Worker는 `beta_state`와 `beta_rate_limits` 두 테이블을 사용한다.

- `beta_state`: `id=1`, 증가하는 `version`, JSONB `payload`, `updated_at`. 도메인 데이터, 백오피스 데이터, 관리자·회원 계정 상태를 함께 보관한다.
- `beta_rate_limits`: 요청 제한 키, 횟수, 만료 시각. 만료된 행은 Cron으로 정리한다.
- 동시 저장은 상태 버전을 비교하여 충돌 시 재시도한다. 현재 구현의 최대 재시도는 8회다.
- 업로드 바이너리는 R2에 저장한다. DB 백업만으로 업로드까지 복구되지 않는다.

회원·관리자 기능 추가는 기존 JSON 상태 구조 확장이므로 별도 신규 테이블 마이그레이션이 필요하지 않았다. **현재 베타 Neon DB에 `backend/migrations` 또는 Node 서버의 `npm run migrate`를 임의로 적용하지 않는다.** 이것은 별도 정규화 DB 방식이다.

조회용 확인 SQL:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('beta_state', 'beta_rate_limits');
SELECT id, version, updated_at FROM beta_state;
```

전체 JSON 상태를 읽고 저장하는 방식은 소규모 베타용이다. 데이터와 동시 접속이 늘면 테이블 분리·트랜잭션·쿼리 최적화를 검토한다. 자동 백업 정책은 확인되지 않았다. 담당자는 Neon 복구 기능의 보존 범위, 별도 DB 백업과 R2 백업 절차를 정해야 한다. 백업 파일에는 개인정보와 계정 해시가 포함되므로 Git에 올리지 않는다.

## 6. 인증 및 업무 흐름

### 관리자

- 마스터 `SUPER_ADMIN`과 추가 관리자 `OPERATOR`, `MD`, `CS`, `FINANCE` 역할을 지원한다. 계정 관리 권한은 서버에서 검사한다.
- 같은 계정의 새 로그인은 이전 세션을 종료한다. 서로 다른 관리자 계정은 독립적으로 사용한다.
- 브라우저 `sessionStorage`의 `g9star-admin-session`에 세션을 저장하며 토큰 유효 시간은 1시간이다. 주기적으로 서버 세션을 확인한다.
- 비밀번호는 영문·숫자·특수문자 포함 8자 이상, 최대 200자다. 입력마다 보기 아이콘이 있다. PBKDF2 SHA-256 해시로 저장한다.
- 임시 비밀번호는 등록 이메일로 발송하며 15분, 일회용이다. 임시 로그인 후 새 비밀번호를 정해야 업무 API를 사용할 수 있다.
- 복구 메일 요청만으로 기존 비밀번호가 무효화되지 않는다. 임시 비밀번호 사용 및 비밀번호 변경 시 이전 세션을 종료한다.
- 복구 요청은 60초 간격, 시간당 3회 제한과 Turnstile 검증을 적용한다.
- 프론트 상단은 유효한 관리자 세션이면 로그아웃과 콘솔 이동 아이콘을 표시한다.

### 회원

- 일반 로그인·회원가입 성공 후 세션 저장과 함께 홈 문서를 다시 불러온다. 임시 비밀번호 로그인은 변경 화면을 먼저 표시한다.
- 로그인과 회원가입 화면을 분리했다. 가입은 이메일, 비밀번호, 휴대폰, 선택 추천인 코드, 필수 동의 및 이메일 인증으로 진행한다.
- 추천인 코드는 선택 항목이다. 미입력은 최초·현재 귀속을 `null`로 저장하며 임의 파트너를 지정하지 않는다. 입력한 코드의 유효성은 검사한다. 추천 링크로 채워진 코드를 지우면 추천인 없이 가입한다.
- 이메일 인증 코드는 6자리, 10분 유효, 오입력 최대 5회다. 발송은 60초 간격·시간당 3회 제한이다. 인증 증명은 이메일에 귀속된 일회용 값이다.
- 회원도 동일 계정의 새 로그인으로 이전 세션을 종료한다. 토큰은 1시간이며 로그아웃·암호 변경 후 서버에서 차단한다.
- 회원 임시 비밀번호는 15분·일회용이고 변경을 강제한다.
- 프론트 상태 키는 `localStorage`의 `earthplayground-portal-v2`다. 토큰 및 회원·쿠폰 상태를 포함하므로 지원 과정에서 원문을 공개하지 않는다.
- 주요 API: `/api/v1/member-auth/{send-verification,verify-email,login,password-recovery,session,logout,password}`, 가입 `/api/v1/members`.
- 기존 데모 회원에는 이메일·비밀번호 인증 정보가 없을 수 있다. 자동으로 정상 로그인 계정으로 전환되지 않으므로 이메일 인증 후 새 가입 흐름을 사용한다.

### 견적·쿠폰·결제

견적은 먼저 DB에 접수하고 Resend로 알린다. 발송 실패 건은 5분 Cron에서 재시도한다. Resend 발송 성공은 수신함 도착 확인과 다르다. 수신 담당자의 메일 도착 확인은 별도 진행해야 한다.

쿠폰·회원 데이터는 Neon에 영속 저장한다. 만료 쿠폰은 사용 가능 집계에서 제외한다. 렌탈 목록은 공개 API를 사용하며 조회 실패 시 가짜 상품 데이터로 대체하지 않는다.

결제는 보류 상태다. 버튼은 준비중으로 안내하고 Worker의 업무 애플리케이션에도 `payments:false`를 적용한다. 관련 결제·환불·웹훅 요청은 `PAYMENTS_NOT_READY`로 차단한다. 테스트 범위에 실결제, 실제 정산 지급을 포함하지 않는다.

## 7. 도메인 및 DNS 인수인계

도메인 등록기관은 가비아이며 네임서버를 Cloudflare로 변경했다. 따라서 현재 DNS 레코드는 Cloudflare에서 관리한다. 가비아는 도메인 소유·갱신·네임서버 변경 창구다.

2026-10-02 공개 DNS 조회 결과:

| 항목 | 확인 결과 | 주의 |
| --- | --- | --- |
| `g9star.co.kr` NS | `ken.ns.cloudflare.com`, `zita.ns.cloudflare.com` | 가비아 위임 값과 일치하는지 유지 확인 |
| `www.g9star.co.kr` A | `172.67.132.232`, `104.21.13.161` | Cloudflare 응답 IP. 고정 원본 IP로 복사하여 설정하지 않음 |
| `send.g9star.co.kr` CNAME | `send.forge.rmta.net` | 대상의 MX/SPF 응답도 확인. 직접 MX/TXT와 중복 등록하지 않음 |
| `resend._domainkey.g9star.co.kr` TXT | `p=`로 시작하는 DKIM 공개키 존재 | 원문 키는 Resend 콘솔 값과 대조. CNAME 목적지와 서로 다른 형식이 정상 |

Worker의 **Custom Domain**으로 웹 도메인을 연결하는 구성이다. 웹 도메인 연결은 Worker `g9star-beta`의 Domains & Routes에서 확인한다. `www`에 `workers.dev` 주소를 임의로 CNAME 추가하는 것으로 대체하지 않는다. 루트 도메인 `g9star.co.kr`은 조회 시 HTTPS 200으로 직접 응답했다. `www` 리디렉션은 관찰되지 않았다. 연결 방식, 인증서 및 HTTPS 강제 설정의 정확한 콘솔 값은 인계 시 확인해야 한다.

메일 DNS는 Resend 콘솔이 안내하는 레코드를 그대로 유지한다. DKIM TXT, 발송용 SPF TXT 및 MX, 제공된 CNAME은 각각 목적이 다르다. 이전 설정 과정에 안내된 `rsend-apne1.forge.rmta.net`은 현재 DKIM TXT 공개키와 같은 값이어야 하는 항목이 아니다. 레코드 타입과 이름을 먼저 대조한다. 메일용 CNAME에는 프록시를 적용하지 않는다. TXT/MX에는 웹 프록시를 설정하지 않는다.

네임서버 전환 후에는 Resend 인증 레코드도 Cloudflare 영역에 존재해야 한다. 가비아에만 남아 있는 레코드는 현재 위임된 DNS 응답에 반영되지 않는다. 기존 레코드를 삭제하기 전에 영역 내용을 기록하고 메일 서비스를 확인한다. 가비아의 CNAME 값 끝 점(`.`) 요구는 가비아 입력 규칙이며 Cloudflare의 모든 값에 일괄 적용하지 않는다.

## 8. 배포, 검증, 복구

운영은 GitHub 변경을 Cloudflare Workers Builds가 배포하는 흐름이다. 콘솔의 실제 연결 브랜치와 아래 명령을 인계 시 대조한다.

| 항목 | 설정 |
| --- | --- |
| 연결 저장소 | `Andy-GAMEUP/G9STAR` |
| 배포 브랜치 | `beta/cloudflare-preflight-20261001` |
| Root directory | `cloudflare` |
| Build command | `npm ci --prefix ../backend && npm ci` |
| Deploy command | `npx wrangler deploy` |

Pages의 로컬 폴더 업로드 화면은 현재 운영 배포 경로가 아니다. 수동 배포는 승인된 계정으로 Wrangler 인증 후 `cloudflare`에서 `npm run deploy`를 사용한다. 자동 배포와 수동 배포를 동시에 실행하지 않는다.

```bash
npm test --prefix backend
npm test --prefix cloudflare
npm run check --prefix cloudflare
curl -fsS https://www.g9star.co.kr/api/health
```

배포 전 테스트, Wrangler dry-run, 배포 로그를 확인하고 운영 health의 `databaseHealthy:true`를 확인한다. 이번 문서 작성 시 backend 테스트는 69개 통과, 실제 PostgreSQL 연결이 필요한 4개는 미설정으로 제외했다. Worker 테스트는 31개 모두 통과했다. 운영 health의 `databaseHealthy:true`도 확인했다. PGlite·모의 메일 테스트는 실제 계정의 메일 도착을 증명하지 않는다.

수동 확인 항목: 관리자·회원 로그인/로그아웃/중복 로그인, 암호 복구 메일 및 강제 변경, 이메일 인증 가입, 견적 저장·검색·상세·수신, 쿠폰 조회, 렌탈 견적 전달, 모바일 폭·메뉴·키보드·Turnstile, 결제 준비중 안내. 개인정보가 들어간 결과나 토큰을 공개 로그에 남기지 않는다.

문제가 있으면 먼저 Cloudflare Worker 요청 로그와 Resend 발송 로그를 확인한다. 코드 복구는 원인 커밋을 revert하여 배포하거나 검증된 Worker 버전으로 되돌린다. DB 스냅샷 복구는 코드 롤백과 별개이며 이후 가입·견적 데이터가 사라질 수 있으므로 백업 시점과 스키마 호환성을 검토한다. 로그에 Secret이나 임시 비밀번호를 출력하지 않는다.

### 자주 발생한 문제

- `relation "backoffice_entities" does not exist`: 과거 Node 정규화 DB 경로에서 발생했던 오류다. 현재 배포 버전·DB 연결·실행 경로를 먼저 확인하고 현재 Worker의 두 테이블 방식과 혼동하지 않는다.
- Runtime Variables 메뉴가 없거나 파일 업로드를 요구함: Workers 프로젝트인지, Pages/정적 업로드 화면인지 확인한다.
- 로그인 직후 업무 요청 실패: 만료·다른 기기 로그인·계정 비활성·임시 비밀번호 강제 변경 상태를 확인한다.
- 도메인 접속 실패: 네임서버 위임, Cloudflare 영역 활성화, Custom Domain, 인증서 순서로 확인한다.
- 메일 미도착: 접수 저장과 발송 상태를 구분하고 Resend 도메인 인증·발신 주소·수신자·스팸함을 확인한다.
- 화면이 이전 상태: 배포 버전과 정적 자산 버전 문자열을 확인한 다음 새로고침한다. 캐시만으로 원인을 단정하지 않는다.

## 9. 남은 점검과 기능 제한

- 실제 수신함의 견적·회원 인증·관리자 및 회원 임시 비밀번호 도착 확인이 필요하다.
- 반응형 코드와 메뉴 자동 테스트를 보완했으나 모든 실제 모바일 기기에서 검증한 것은 아니다.
- 프론트의 상단 보조 프레임을 제거하고 헤더에 로그인/로그아웃·마이페이지(관리자는 콘솔)·알림 아이콘을 배치했다. 알림벨은 준비중 안내이며 회원별 메시지 조회 API는 아직 연결하지 않았다.
- 일부 프론트 장바구니·리뷰·찜·검색 UI에는 데모 또는 로컬 상태·자리표시자 흐름이 남아 있다. 전체 상거래 완성을 의미하지 않는다.
- 결제·결제 기반 주문 확정·실제 정산 지급은 보류 상태다.
- 전체 JSON DB 상태 저장 방식의 규모 한계와 동시 요청 충돌, 무료 서비스 사용량을 관찰해야 한다.
- 운영 계정 소유자·초대 권한, Neon 프로젝트/지역/브랜치/DB 역할, 서비스별 실제 플랜, 백업 보존 기간, 도메인 만료일은 콘솔 인계가 필요하다.
- Secret은 별도 안전한 관리 수단으로 전달하고 인계 후 접근 권한을 정리한다. 공개 GitHub 문서에 추가하지 않는다.

## 10. 관련 문서

- [Cloudflare 설정 가이드](../cloudflare/README.md)
- [초기 베타 사전 점검](beta-preflight-20261001.md): 작성일 당시 기록이며 현재 인증 기능은 본 문서를 우선 참고한다.
- [별도 Node 백엔드 안내](../backend/README.md): 현재 Worker DB와 배포 절차에 바로 적용하지 않는다.
