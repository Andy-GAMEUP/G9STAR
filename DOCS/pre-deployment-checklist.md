# 배포 전 체크리스트 (Pre-Deployment Checklist)

> 지구별놀이터 B2B2C 매장가구·인테리어 플랫폼 정식 배포(퍼블리싱) 전에 반드시 처리해야 할 작업 목록입니다.
> 현재 상태는 **프로토타입/개발 구성**(인메모리 DB · 로컬 스토리지 · 개발용 토큰 · 플레이스홀더 도메인)이므로, 아래 항목을 완료해야 운영 환경에서 안전하게 동작합니다.
>
> 최종 갱신: 2026-09-18

---

## 0. 우선순위 요약

| 순위 | 항목 | 위험도 | 미조치 시 영향 |
|---|---|---|---|
| 1 | 백엔드 필수 시크릿·개발토큰 차단 | 🔴 치명 | 인증 우회·토큰 위조 가능 |
| 2 | 데이터 영속화(PostgreSQL 전환) | 🔴 치명 | 재시작 시 모든 데이터 소실 |
| 3 | 이미지 스토리지 전환 | 🟠 높음 | 재배포·스케일아웃 시 업로드 이미지 유실 |
| 4 | 도메인/URL 적용 (✅ starplayground.com 완료) | 🟠 높음 | SEO·공유·정규 URL 오작동 |
| 5 | 프론트 API 엔드포인트 설정 | 🟠 높음 | 운영에서 API 연결 실패 |
| 6 | HTTPS·CORS·보안 헤더 | 🟠 높음 | 혼합콘텐츠·CORS 차단·보안 취약 |
| 7 | SEO 마무리(OG 이미지·서치콘솔) | 🟡 보통 | 검색 노출·소셜 공유 품질 저하 |
| 8 | 워커/스케줄러·백업·모니터링 | 🟡 보통 | 정산 자동화·장애 대응 공백 |

---

## 1. 🔴 백엔드 필수 시크릿 · 개발용 토큰 차단

운영 기동 시 아래 시크릿이 없거나 기본값이면 **서버가 기동을 중단**합니다(`backend/src/server.ts`).

- [ ] `JWT_SECRET` — 32자 이상, 기본값 금지 (`openssl rand -base64 48` 등으로 생성)
- [ ] `MEDUSA_WEBHOOK_SECRET` — 기본값 금지, Medusa 연동 시크릿과 일치
- [ ] `ALLOW_DEV_TOKEN` — 운영에서는 **미설정 또는 `false`** (개발 전용 무인증 토큰 발급 `/dev/token` 비활성화)
- [ ] 시크릿은 코드/리포지토리에 커밋 금지 → 환경변수·시크릿 매니저로 주입

```bash
# 운영 기동 예시 (개발 토큰 없이)
JWT_SECRET="<32자 이상 랜덤>" \
MEDUSA_WEBHOOK_SECRET="<웹훅 시크릿>" \
DATABASE_URL="postgres://user:pw@host:5432/earthplayground" \
PORT=4100 \
node --experimental-strip-types backend/src/server.ts
```

---

## 2. 🔴 데이터 영속화 — 인메모리 → PostgreSQL

현재 `DATABASE_URL` 미설정 시 **인메모리 모드**로 동작하여 재시작 시 상품·렌탈·쿠폰·정산 등 모든 데이터가 초기화됩니다(`backend/src/infrastructure/database.ts`).

- [ ] PostgreSQL 인스턴스 준비 후 `DATABASE_URL` 설정 → 자동으로 `postgres` 모드 전환
- [ ] 마이그레이션 실행: `cd backend && npm run migrate` (`backend/migrations/001~005_*.sql`)
- [ ] 최초 기동 후 시드/정책 동기화 확인(파트너·추천·쿠폰 캠페인)
- [ ] **렌탈 카탈로그(rentalItems) 반영 확인** — 렌탈 상품이 PostgreSQL에도 영속되는지 점검. 필요 시 `004_full_backoffice.sql` 계열의 `backoffice_entities` 저장 경로로 `rentalItems` 모듈이 포함되는지 확인(참고: 백오피스 엔티티는 `module` 단위 JSON으로 저장됨)
- [ ] 커넥션 풀·타임아웃·SSL 옵션 운영값으로 조정

---

## 3. 🟠 이미지 스토리지 — 로컬 → 서버/오브젝트 스토리지

현재 업로드 이미지는 서버 로컬 디스크(`ASSET_STORAGE_DIR`, 기본 `backend/uploads`)에 저장되고 `/uploads/*`로 서빙됩니다(`backend/src/infrastructure/storage.ts`). 재배포·다중 인스턴스 환경에서 유실·불일치가 발생합니다.

- [ ] 오브젝트 스토리지(S3 · GCS · Naver Object Storage 등)로 교체하거나, 최소한 **영속 볼륨**에 `ASSET_STORAGE_DIR` 마운트
- [ ] CDN 연동 및 `/uploads/` → CDN URL 매핑 검토
- [ ] `ASSET_MAX_BYTES`(기본 8MB) 운영 정책값 확인, 매직바이트 검증 유지
- [ ] 기존 로컬 업로드분 마이그레이션(있는 경우)

> 관련 메모: 상품·쇼케이스 이미지는 "임시 로컬 → 정식 퍼블리싱 시 서버 스토리지 교체"로 합의됨.

---

## 4. ✅ 도메인 / URL — 정식 도메인 적용 완료

정식 도메인 **`https://www.starplayground.com`** 확정에 따라 SEO 메타(canonical·Open Graph)·`sitemap.xml`·`robots.txt`·JSON-LD·동적 SEO 스크립트의 도메인을 **일괄 치환 완료**(2026-09-18).

- [x] 전 페이지 canonical·OG URL 치환
- [x] `prototype/robots.txt`의 `Sitemap:` URL 갱신
- [x] `prototype/sitemap.xml`의 모든 `<loc>` 갱신
- [x] 동적 SEO 스크립트 상수(`detail.js`의 `SITE`, `rental-detail.html`·`rental.html` 절대경로) 갱신

> 도메인이 다시 변경될 경우 아래로 재치환:
> ```bash
> cd prototype
> grep -rl "www.starplayground.com" . robots.txt sitemap.xml \
>   | xargs sed -i '' 's|https://www.starplayground.com|https://<새도메인>|g'
> ```

- [ ] **실제 도메인 연결/DNS·TLS 인증서 발급** 후 위 절대 URL이 실서비스와 일치하는지 확인
- [ ] 도메인이 `www` 유무·http/https 리다이렉트로 canonical과 일치하도록 웹서버 설정

---

## 5. 🟠 프론트엔드 API 엔드포인트 설정

프론트는 API 베이스를 `localStorage['earthplayground-api'] || 'http://127.0.0.1:4100'`로 참조합니다(`app.js`·`detail.js`·`admin.js`·`portal.js`·`rental-data.js`). 운영에서는 localhost 기본값이 동작하지 않습니다.

- [ ] 운영 API 오리진 확정(예: `https://api.<도메인>` 또는 동일 오리진 리버스 프록시 `/api`)
- [ ] 각 파일의 **기본 폴백 값**을 운영 API로 변경(권장) — localStorage 의존은 신규 방문자에게 적용되지 않음
- [ ] HTTPS 페이지 ↔ HTTP API 혼합콘텐츠 금지: API도 HTTPS로 제공

---

## 6. 🟠 HTTPS · CORS · 보안

- [ ] 전 구간 HTTPS(리버스 프록시/로드밸런서 TLS 종단)
- [ ] CORS 허용 오리진을 운영 도메인으로 제한(현재 자산 서빙에 와일드카드 존재 여부 점검: `access-control-allow-origin:*`)
- [ ] 보안 헤더 추가(HSTS, X-Content-Type-Options, Referrer-Policy, 필요 시 CSP)
- [ ] 관리자(`admin.html`)·개인 페이지 접근 통제 및 `noindex` 유지(설정 완료)
- [ ] 레이트리밋·요청 크기 제한 검토

---

## 7. 🟡 SEO 마무리

기본 SEO(메타·OG·Twitter·JSON-LD·robots·sitemap)는 적용 완료. 정식 오픈 시 아래를 추가합니다.

- [ ] **대표 OG 이미지** 제작·교체(1200×630 권장) — 현재 `assets/store-hero.png` 임시 사용
- [ ] Google Search Console · Naver 서치어드바이저 사이트 등록 및 `sitemap.xml` 제출
- [ ] 도메인 소유확인 메타/파일 추가
- [ ] **sitemap 재생성 정책** — 렌탈/상품이 admin에서 늘어나면 `sitemap.xml` 갱신 필요.
      권장: 백엔드 동적 `/sitemap.xml` 엔드포인트(ACTIVE 상품 + rentalItems 기반)로 확장
- [ ] 파비콘: 현재 인라인 SVG 사용 중 → 필요 시 `favicon.ico`/apple-touch-icon 추가
- [ ] 실데이터 기준 title/description 중복·길이 최종 점검, 구조화 데이터 리치결과 테스트(Google Rich Results Test)

---

## 8. 🟡 워커 · 스케줄러 · 운영

- [ ] 정산 스케줄러/아웃박스 워커 기동(`backend/src/worker.ts`, `DATABASE_URL` 필수)
  - [ ] `OUTBOX_TARGET_URL`, `OUTBOX_TOKEN` 설정
- [ ] DB 백업·복구 절차 수립(정기 백업, PITR 등)
- [ ] 로깅·모니터링·알림(에러율, 응답시간, 헬스체크 `/health`)
- [ ] 무중단 배포·롤백 전략, 헬스체크 기반 오케스트레이션
- [ ] 결제(PG)·Medusa 등 외부 연동 운영 키/웹훅 URL 전환 및 연동 테스트

---

## 9. 배포 후 스모크 테스트

- [ ] 홈·쇼케이스·제품·렌탈·렌탈상세·견적 페이지 정상 로드(HTTPS)
- [ ] 제품/렌탈 상세가 운영 API에서 데이터 로드
- [ ] 어드민 로그인·상품/렌탈 등록·수정 → 스토어프론트 반영
- [ ] `robots.txt`·`sitemap.xml` 접근 및 도메인 정합성
- [ ] 소셜 공유 미리보기(OG) 확인(카카오·페이스북 디버거 등)
- [ ] 업로드 이미지가 스토리지에서 정상 서빙

---

### 참고 파일
- 백엔드 환경변수: `backend/src/server.ts`, `backend/src/worker.ts`
- DB/스토리지: `backend/src/infrastructure/database.ts`, `backend/src/infrastructure/storage.ts`
- 마이그레이션: `backend/migrations/*.sql`
- 프론트 API 베이스: `prototype/app.js`·`detail.js`·`admin.js`·`portal.js`·`rental-data.js`
- SEO: 각 `prototype/*.html`, `prototype/robots.txt`, `prototype/sitemap.xml`
