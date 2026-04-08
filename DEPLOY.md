# Auto-Coin 웹 배포 가이드

이 문서 하나만 따라가면 로컬 개발 → Vercel 배포까지 완료됩니다.

---

## 현재 상태 (이미 완료됨)

- ✅ Supabase 프로젝트 `auto_coin` 생성 (ref: `cqgjpndvbfuudqahntav`, 싱가포르)
- ✅ 레거시 경공매/포커 테이블 전부 드롭
- ✅ 새 스키마 적용: `profiles`, `exchange_keys`, `bots`, `bot_state`, `trades`, `equity_history`, `bot_runs`
- ✅ RLS 정책 (유저 본인 데이터만 접근)
- ✅ Realtime 퍼블리케이션 등록
- ✅ Next.js 15 App Router 앱 `web/` 폴더에 31개 파일 생성

`blockchain_holdum` 프로젝트는 **전혀 건드리지 않았습니다**.

---

## 1. 로컬 실행 (5분)

```bash
cd auto_coin/web
npm install
cp .env.local.example .env.local
```

`.env.local` 편집 — `ENCRYPTION_KEY`만 채우면 됩니다 (나머지는 이미 세팅됨):

```bash
# 터미널에서 생성
openssl rand -hex 32
# 출력을 복사해서 .env.local 의 ENCRYPTION_KEY 값으로 붙여넣기
```

**중요**: 이 키는 **절대 잃어버리면 안 됩니다**. 키를 잃으면 저장된 HTX 키를 복호화 못 해요. 1Password나 안전한 곳에 백업.

```bash
npm run dev
# → http://localhost:3000
```

회원가입 → 로그인 → 대시보드 → 새 봇 만들기 순으로 테스트.

---

## 2. Supabase Auth 설정 (2분)

Supabase 대시보드 (https://supabase.com/dashboard/project/cqgjpndvbfuudqahntav) → **Authentication → URL Configuration**:

- **Site URL**: 일단 `http://localhost:3000` (배포 후 도메인으로 교체)
- **Redirect URLs** (전부 추가):
  - `http://localhost:3000/auth/callback`
  - `https://auto-coin.vercel.app/auth/callback` (배포 후 실제 도메인)

**Google OAuth 선택사항**: Authentication → Providers → Google 활성화 후 Google Cloud Console에서 OAuth client 만들고 client ID/secret 등록.

---

## 3. Vercel 배포 (10분)

### 3-1. Vercel CLI 설치 및 로그인

```bash
npm i -g vercel
vercel login
```

### 3-2. 프로젝트 첫 배포

```bash
cd auto_coin/web
vercel
```

질문에 답변:
- Set up and deploy? **Y**
- Which scope? **본인 계정**
- Link to existing project? **N**
- What's your project's name? **auto-coin**
- In which directory is your code located? **./**
- Want to modify settings? **N**

### 3-3. 환경변수 설정 (필수)

Vercel 대시보드 → 방금 만든 `auto-coin` 프로젝트 → Settings → Environment Variables:

| 이름 | 값 | 환경 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cqgjpndvbfuudqahntav.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_X25bHqEmxXKoyaLovuhCkg_LkXJ6vFM` | Production, Preview, Development |
| `ENCRYPTION_KEY` | `(openssl rand -hex 32 결과)` | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 대시보드 → Settings → API → `service_role` 키 | Production |
| `CRON_SECRET` | `(openssl rand -hex 16 결과)` | Production |

**`SUPABASE_SERVICE_ROLE_KEY` 가져오는 법**: Supabase 대시보드 → Project Settings → API → Project API keys 섹션의 `service_role` (secret) 키 복사. 이 키는 RLS를 우회하므로 **절대 클라이언트에 노출 금지**.

### 3-4. 프로덕션 배포

```bash
vercel --prod
```

배포 완료 후 URL (예: `https://auto-coin.vercel.app`) 을 받게 됩니다. 이 URL을 Supabase Auth Redirect URLs 에 추가 (2번 단계로 돌아가서).

---

## 4. Vercel Cron 주의사항

`vercel.json` 에 `* * * * *` (매분) 으로 cron 등록되어 있는데, **Vercel Hobby (무료) 플랜은 cron이 하루 1회만 동작**합니다. 옵션:

1. **Pro 플랜 ($20/월)** — 매분 가능. 가장 깔끔.
2. **Supabase pg_cron + Edge Function** — 무료. `supabase/functions/tick` 에 Edge Function을 만들어서 pg_cron으로 1분마다 호출. (나중에 추가 가능)
3. **외부 cron 서비스** — cron-job.org, EasyCron 등으로 `/api/cron/tick` 에 `Authorization: Bearer $CRON_SECRET` 헤더 달고 1분마다 GET. 무료.

초기에는 **옵션 3 또는 수동 Tick** (봇 상세 페이지의 "▶ Tick" 버튼) 으로 테스트하시고, 실사용 시 2번이나 1번 권장합니다.

---

## 5. 첫 봇 만들기 체크리스트

1. `/login` 에서 회원가입 → 이메일 확인
2. `/dashboard` → "새 봇" 클릭
3. 이름/심볼/주기/전략 선택 → **모드는 "페이퍼"** 로 시작
4. 봇 상세 페이지에서 "▶ Tick" 클릭 → HTX 데이터 수신 확인
5. 몇 번 Tick 돌려보고 → 체결 로그/Equity 곡선 그려지는지 확인
6. 며칠 돌린 후 성과 괜찮으면 → API 키 등록 → 실거래 봇 생성 (소액)

---

## 6. 실거래 전환 체크리스트 (Phase 2)

- [ ] 페이퍼트레이드로 최소 1주 검증
- [ ] HTX API 키 발급 (Withdraw 권한 **OFF**, Trade 권한만)
- [ ] HTX IP 화이트리스트 설정 (Vercel 서버리스는 고정 IP 어려움 — 가능하면 외부 Worker로)
- [ ] `/settings/keys` 에서 키 등록
- [ ] 실거래 봇 생성 시 **초기 자본 최소 금액** (10만원 이하)
- [ ] 첫 24시간은 사람이 직접 모니터링
- [ ] 일 손실 한도 (서킷브레이커) 설정 검토

---

## 7. 보안 요약

- RLS: 모든 테이블에 적용, 유저는 본인 데이터만 접근
- API 키: AES-256-GCM 암호화 후 DB 저장. 마스터키(`ENCRYPTION_KEY`)는 Vercel 환경변수에만
- Service Role Key: Cron 엔드포인트에서만 사용, 클라이언트 노출 X
- Cron: `CRON_SECRET` Bearer 토큰 검증
- 인증: Supabase Auth (이메일 확인 + OAuth 옵션)
- 미들웨어: `/dashboard`, `/bots`, `/settings` 는 로그인 필수

---

## 8. 문제 해결

**Q. 로그인 후 무한 리다이렉트**
→ Supabase Redirect URLs 에 실제 배포 URL 추가 확인

**Q. "ENCRYPTION_KEY must be 64 hex chars" 에러**
→ `openssl rand -hex 32` 결과를 그대로 붙여넣었는지 확인. 공백/줄바꿈 없이

**Q. HTX fetch 실패 (502)**
→ Vercel 서버가 HTX 차단되는 리전에 있을 수 있음. Vercel 프로젝트 Settings → Functions Region 을 `hnd1` (도쿄) 또는 `sin1` (싱가포르)로 변경

**Q. Realtime 업데이트 안 됨**
→ Supabase 대시보드 → Database → Replication → `supabase_realtime` publication에 `bot_state`, `equity_history`, `trades` 포함돼있는지 확인 (마이그레이션에서 이미 추가함)

---

## 다음 단계 (선택)

- [ ] `compareDashboard` 스타일의 멀티 봇 비교 페이지 추가
- [ ] 백테스트/워크포워드를 웹 UI에서 실행
- [ ] Telegram/Discord 알림 (체결/손절 발생 시)
- [ ] 실거래 주문 실행 (`htxTrader.js` 의 서명 로직을 `lib/trading/htx.ts` 로 포팅)
- [ ] 관리자 페이지 (`role='admin'`)
