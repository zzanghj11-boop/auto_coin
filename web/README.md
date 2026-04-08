# Auto-Coin Web

Next.js 15 (App Router) + Supabase Auth + Tailwind 로 만든 Auto-Coin SaaS 프론트엔드.

## 구조

```
web/
├─ app/
│  ├─ page.tsx                  # 랜딩
│  ├─ login/                    # Supabase Auth 로그인/가입
│  ├─ auth/callback/            # OAuth 콜백
│  ├─ dashboard/                # 봇 목록 (보호됨)
│  ├─ bots/
│  │  ├─ new/                   # 봇 생성
│  │  └─ [id]/                  # 봇 상세 + 실시간 차트
│  ├─ settings/keys/            # HTX API 키 등록 (암호화)
│  └─ api/
│     ├─ keys/                  # 키 등록 (AES-256-GCM)
│     ├─ bots/[id]/tick/        # 수동 실행
│     └─ cron/tick/             # Vercel Cron → 활성 봇 전부
├─ lib/
│  ├─ supabase/                 # SSR · 브라우저 · 미들웨어 클라이언트
│  ├─ crypto.ts                 # AES-256-GCM 유틸
│  └─ trading/                  # indicators · strategies · runner
├─ components/                  # DashNav 등
├─ middleware.ts                # 인증 보호
├─ tailwind.config.ts
└─ vercel.json                  # 1분 cron
```

## 로컬 개발

```bash
cd web
npm install
cp .env.local.example .env.local
# ENCRYPTION_KEY 생성:
openssl rand -hex 32
# 결과를 .env.local 의 ENCRYPTION_KEY 에 붙여넣기

npm run dev
# → http://localhost:3000
```

## 환경변수

| 이름 | 용도 | 공개 여부 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | 공개 |
| `ENCRYPTION_KEY` | AES-256-GCM 마스터키 (hex 64자) | **비공개** |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron 에서 전 유저 봇 실행 | **비공개** |
| `CRON_SECRET` | Vercel Cron Authorization 토큰 | **비공개** |

## Supabase 설정

### 1) Auth Redirect URLs
Supabase 대시보드 → Authentication → URL Configuration 에서:
- **Site URL**: `https://your-domain.vercel.app`
- **Redirect URLs**:
  - `https://your-domain.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (로컬 테스트)

### 2) Google OAuth (선택)
Authentication → Providers → Google 활성화, OAuth client 등록.

### 3) Email 확인
Authentication → Providers → Email → Confirm email 활성화 권장.

## Vercel 배포

```bash
# 한 번만
npm i -g vercel

# 첫 배포
vercel
# 프로젝트 연결 후, 환경변수 전부 입력

# 이후
vercel --prod
```

또는 GitHub 연동 → 자동 배포.

**중요**: Vercel Cron 은 Hobby 플랜에서 **하루 1회**만 동작합니다. 1분 주기가 필요하면 Pro 플랜 ($20/월) 이 필요해요. 대안: Supabase Edge Function + pg_cron (무료).

## 마스터키 관리 (중요)

- `ENCRYPTION_KEY` 가 유출되면 모든 유저의 HTX 키가 복호화 가능합니다.
- Vercel 환경변수에만 저장. 절대 git에 커밋 금지.
- 키 로테이션 시 기존 DB 암호문을 재암호화하는 마이그레이션 필요.

## 데이터베이스 스키마

Supabase 프로젝트 `auto_coin` (ref: `cqgjpndvbfuudqahntav`) 에 이미 적용됨.

- `profiles` — auth.users 확장
- `exchange_keys` — HTX API 키 (암호화)
- `bots` — 봇 정의
- `bot_state` — 현재 포지션/현금 스냅샷
- `trades` — 체결 로그
- `equity_history` — 시계열 자산
- `bot_runs` — 실행 로그

모든 테이블 RLS 적용. 유저는 본인 데이터만 접근 가능.
