# 지구별놀이터 Cloudflare 공개 베타

고객 화면은 공개하며 관리자 API만 로그인과 역할 검사를 적용한다. 결제와 쿠폰 사용은 비활성화한다. 견적은 서버에 저장한 뒤 등록된 운영 이메일으로 알림을 보낸다. Gmail 계정의 비밀번호는 필요하지 않다.

## 구성

- Cloudflare Workers Static Assets: `prototype/` HTML·CSS·JavaScript
- 같은 도메인의 `/api/*`: 기존 Node 업무 로직을 재사용하는 Workers API
- Neon PostgreSQL: 회원·쿠폰·견적·상품·관리자 설정·감사 기록의 영구 저장
- R2: 관리자 상품·쇼케이스 이미지 업로드
- Resend: 견적 알림. 먼저 저장하고 발송하며 실패 건은 5분마다 재시도
- Turnstile: 공개 견적·가입·관리자 로그인 요청의 자동화 악용 방지

단순 Pages 정적 배포만으로는 API·저장 기능이 실행되지 않는다. 이번 베타는 **Workers + Static Assets + Neon PostgreSQL** 프로젝트로 배포한다. PostgreSQL은 Neon의 관리형 서비스를 사용한다.

## 계정 연결 후 배포 순서

1. Neon Free에서 `g9star-beta` 프로젝트와 운영 브랜치를 생성한다. 한국과 가까운 제공 리전을 선택하고 Connect에서 PostgreSQL 연결 문자열을 복사한다. Neon SQL Editor에서 `cloudflare/migrations/0001_beta.sql`을 실행한다. 연결 문자열은 Cloudflare Worker의 `DATABASE_URL` Secret에 저장한다.
2. R2 `g9star-beta-assets` 버킷을 생성한다. R2 사용 조건은 계정 화면에서 확인한다.
3. Turnstile 위젯을 생성한다. 허용 호스트에 `g9star.co.kr`, `www.g9star.co.kr`, 실제 베타 Worker 호스트를 등록한다.
4. Resend에서 발신 도메인 `g9star.co.kr`을 인증한다. 안내된 DNS 레코드를 실제 DNS 제공자에 등록한다. 가비아 DNS를 쓰면 가비아에, Cloudflare 네임서버를 쓰면 Cloudflare에 등록한다. 기존 MX 레코드를 임의로 바꾸지 않는다.
5. Worker에 아래 설정값을 등록한다. 비밀값은 저장소나 채팅에 입력하지 않고 Worker Secrets 또는 비밀 설정 화면에 입력한다.
6. Neon SQL Editor에서 테이블 생성 완료를 확인하고 Worker를 배포한다.
7. Worker 커스텀 도메인에 `g9star.co.kr`과 `www.g9star.co.kr`을 연결한다. Cloudflare가 안내하는 네임서버를 가비아에서 설정한다.
8. 실제 도메인에서 접수→관리자 조회→Gmail 수신, 회원→쿠폰→재접속, 재배포 후 데이터 유지, 모바일, 결제 차단을 확인한다.

| 설정 | 종류 | 값 |
|---|---|---|
| `DATABASE_URL` | Secret | Neon Connect에서 받은 SSL PostgreSQL 연결 문자열 |
| `JWT_SECRET` | Secret | 무작위 32자 이상 |
| `ADMIN_PASSWORD` | Secret | 베타 운영자용 무작위 32자 이상 |
| `RESEND_API_KEY` | Secret | 발신 도메인에 대해 발송 가능한 키 |
| `TURNSTILE_SECRET_KEY` | Secret | 서버 검증 키 |
| `ADMIN_LOGIN` | Variable | 등록된 운영 이메일 |
| `QUOTE_RECIPIENT` | Variable | 등록된 운영 이메일 |
| `QUOTE_FROM` | Variable | Resend에서 인증된 발신 주소 (Worker 콘솔 확인) |
| `TURNSTILE_SITE_KEY` | Variable | 공개 사이트 키 |
| `BETA_HOSTNAME` | Variable | 실제 Worker 베타 호스트명, URL scheme 제외 |
| `CHALLENGE_REQUIRED` | Variable | `true`; 공개 배포에서 끄지 않음 |

## 명령과 GitHub 자동 배포 설정

Node.js 24 기준:

```bash
npm ci --prefix backend
npm ci --prefix cloudflare
cd cloudflare
npx wrangler login
npx wrangler r2 bucket create g9star-beta-assets
# Neon SQL Editor에서 migrations/0001_beta.sql 실행
# 각 비밀값은 wrangler secret put <변수명> 또는 Cloudflare 설정 화면에서 등록
npx wrangler deploy
```

Workers GitHub 연결 시 저장소는 `Andy-GAMEUP/G9STAR`, Root directory는 `cloudflare`를 선택한다. 빌드 명령은 `npm ci --prefix ../backend && npm ci`, 배포 명령은 `npx wrangler deploy`이다. 현재 변경 브랜치에서 검증한 뒤 실제 배포 브랜치를 선택한다. 실제 Neon DB·R2 버킷과 Secrets를 사용한다. DATABASE_URL은 브라우저 코드나 GitHub에 넣지 않는다. Workers는 @neondatabase/serverless HTTP 드라이버로 연결한다. D1 바인딩은 사용하지 않는다.

## 로컬 검증

```bash
npm test --prefix backend
npm test --prefix cloudflare
cd cloudflare
# Neon 테스트 브랜치에 마이그레이션 실행
# .dev.vars에 테스트용 DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD를 설정
npx wrangler dev --var CHALLENGE_REQUIRED:false
```

`CHALLENGE_REQUIRED:false`는 로컬 테스트에만 사용한다. `.dev.vars`, `.wrangler/`, 업로드 테스트 데이터는 Git에서 제외한다.

## 범위와 남은 실계정 검증

- 저장소 연결을 다시 열어도 데이터 유지, 동시 저장 시 버전 충돌 재시도, 고객·관리자 권한 검사를 로컬에서 검증한다.
- 결제 버튼은 준비중으로 안내한다. 결제·쿠폰 예약/사용·환불·지급 API는 서버에서도 차단한다.
- 메일 알림의 수신처·멱등키·오류 동작은 모의 발송으로 검증한다. 실제 메일 발송·Gmail 수신·도메인 HTTPS는 계정 연결 후 검증해야 한다.
- `SENT`는 발송 서비스의 접수 성공이다. Gmail 받은편지함에 도착했다는 보장은 아니며 실제 수신을 별도로 확인한다.
- 이번 Neon 저장 방식은 작은 베타용 전체 상태 JSONB 스냅샷이다. D1 구현의 900KB 제한은 제거했지만, 모든 업무 상태를 읽고 쓰므로 데이터 증가에 따라 응답시간·Worker 메모리·CPU 비용이 증가한다. 버전 조건부 갱신으로 동시 저장 유실을 방지한다. 대규모 사용자 테스트 전에는 회원·쿠폰·견적·감사를 개별 테이블로 정규화해야 한다. 현재 코드의 처리량과 무료 Worker CPU 한도는 실계정에서 확인해야 한다.
- Cloudflare 검사에서는 PGlite(PostgreSQL 엔진)로 SQL·저장소 재연결·동시 쓰기를 확인한다. Neon 운영망 연결·재배포 후 유지·컴퓨팅 절전 후 응답은 별도 실계정 검증 대상이다.
- Neon 무료 사용량과 유휴 컴퓨팅 정책을 확인한다. 5분마다 메일 재시도 cron이 DB를 조회하므로 컴퓨팅을 깨울 수 있다. 사용량을 모니터링하고 무료 한도에 접근하면 재시도 주기를 조정한다. 백업은 별도로 export해 보관한다.
- 회원은 이메일 인증 및 추천코드 확인 후 가입한다. 로그인·로그아웃·암호 복구를 지원하며 고객 토큰은 1시간이다.
- 마스터 SUPER_ADMIN 및 추가 관리자 계정을 지원한다. 역할과 세션은 서버에서 검증하며 같은 계정의 새 로그인은 이전 세션을 종료한다.

참고: https://developers.cloudflare.com/workers/static-assets/ · https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/ · https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ · https://resend.com/docs/api-reference/emails/send-email

## 기존 저장소에서 이전

이번 전환은 아직 운영 D1에 배포하지 않은 상태를 기준으로 한다. D1 또는 기존 PostgreSQL에 실제 고객 데이터가 있으면 자동 이전되지 않는다. 먼저 쓰기를 중지하고 백업·테이블/스냅샷 변환·복원 검증을 수행해야 한다. 이 베타의 beta_state 스키마는 기존 Node backend의 정규화 PostgreSQL 테이블과 별개다.

## GitHub 빌드 시작과 첫 배포

기존 정적 파일 전용 Worker의 New deployment는 파일 업로드 화면이다. 이 프로젝트는 GitHub Workers Builds로 worker.ts와 정적 파일을 함께 배포한다. 올바른 브랜치·루트·빌드 명령을 저장한 후 해당 브랜치에 커밋을 push하면 빌드가 시작된다. 파일 감시 필터가 있으면 cloudflare 변경이 포함되어야 한다. 배포 성공 후 Runtime Variables and Secrets에 DATABASE_URL 등 운영 비밀값을 등록한다. Builds 내부 Variables and secrets는 빌드용이므로 구분한다.

## 관리자 비밀번호와 이메일 복구

- 비밀번호는 영문·숫자·특수문자를 포함한 8~200자로 설정한다. 추가·변경·재설정 화면의 눈 아이콘으로 보기/숨기기를 전환한다.
- 로그인 화면의 `비밀번호를 잊으셨나요?`에서 등록된 관리자 이메일을 입력하면 기존 `RESEND_API_KEY`와 검증된 `QUOTE_FROM` 발신자를 사용해 임시 비밀번호를 발송한다. 별도 SQL이나 새 환경변수는 필요 없다.
- 임시 비밀번호는 15분간 유효하며 로그인에 한 번만 사용할 수 있다. 임시 로그인은 세션 확인·로그아웃·비밀번호 변경만 허용하고, 새 비밀번호를 설정해야 업무 화면을 사용할 수 있다.
- 메일 요청만으로 기존 비밀번호나 세션을 무효화하지 않는다. 임시 비밀번호를 실제로 사용하면 기존 비밀번호와 이전 세션이 종료된다. 비밀번호 변경 시 미사용 복구 비밀번호도 취소된다.
- Turnstile과 IP별 요청 제한, 계정별 60초 간격·시간당 3회 제한을 적용한다. 미등록·중지된 계정과 제한된 요청은 동일한 안내를 반환한다.
- 임시 비밀번호 원문은 Resend 메일 요청에만 사용하고 Neon에는 해시만 저장한다. 관리자 API·감사 로그에 복구 해시나 비밀번호를 포함하지 않는다. 저장 충돌 시 동일한 발송 상태·멱등키를 재사용해 중복 발송을 방지한다.
- 실제 수신 여부는 관리자 이메일의 받은편지함·스팸함에서 확인한다. 자동 테스트는 메일 공급자를 모의 처리하며 실제 메일을 발송하지 않는다.

### 프론트 회원 인증 (2026-10-02)
- `/login`: 이메일·비밀번호 로그인, 임시 비밀번호 메일 요청, 임시 로그인 후 비밀번호 변경.
- `/signup`: 이메일 6자리 인증번호(10분), 이메일 인증 확인, 가입 완료. 가입 비밀번호는 영문·숫자·특수문자 8~200자, 휴대전화·추천코드 및 약관·개인정보 동의 필요. 이름은 선택 입력.
- API `/api/v1/member-auth/{send-verification,verify-email,login,password-recovery,session,logout,password}`. 기존 `/api/v1/members`도 인증 토큰·필수 정보를 검증하여 우회 가입 차단.
- 계정·인증 대기 상태는 기존 Neon `beta_state`에 저장. 추가 SQL/환경변수 불필요. 기존 `RESEND_API_KEY`·`QUOTE_FROM` 사용. 메일 재발송은 1분 간격, 이메일별 시간당 3회. 인증번호는 5번까지 검증, Turnstile/IP 제한 적용.
- 비밀번호·인증번호·가입 인증 토큰은 해시만 저장. 메일 공급자 멱등키와 요청 내 상태로 저장 충돌 재시도 시 중복 발송 차단.
- 이전 데모 가입은 이메일·암호를 수집하지 않아 로그인 계정으로 자동 전환할 수 없음. 기존 자료는 유지하고 새로운 인증 가입 필요.
- 로그인은 동일 회원의 이전 세션을 종료하며 로그아웃/암호 변경 후 토큰을 차단. 임시 암호는 15분, 한 번 사용 후 강제 변경.

현재 운영 구성과 인수인계는 [개발자 인수인계](../DOCS/developer-handover-20261002.md)를 참고한다.
