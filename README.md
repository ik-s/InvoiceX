# InvoiceX

InvoiceX는 XRPL 기반 인보이스 RWA 조기정산 플랫폼입니다.

SME가 검증된 인보이스를 등록하면 Buyer가 지급 의무를 확인하고, Admin/Verifier가 KYB와 인보이스를 검토한 뒤 Risk Passport를 발급합니다. 이후 승인된 Invoice RWA는 마켓에 등록되고, 검증된 Funder가 조기정산 유동성을 공급할 수 있습니다.

현재 프로젝트는 해커톤/PoC 데모 제품입니다. 복잡한 금융 인프라보다 역할별 흐름이 명확하게 동작하는 것을 우선합니다.

## 핵심 역할

- **SME / Registrar**: 인보이스를 등록하고 조기정산을 요청하는 기업
- **Buyer / Payer**: 인보이스 지급 의무를 확인하고 만기 정산에 참여하는 기업
- **Funder**: 검증된 Invoice RWA에 조기정산 자금을 공급하는 자본 제공자
- **Admin / Verifier**: KYB, 인보이스, Risk Passport, RWA 등록을 검토/승인하는 플랫폼 운영자

## 데모 흐름

1. 사용자가 이메일, 역할, 회사명으로 회원가입합니다.
2. 로그인 후 역할별 마이페이지로 이동합니다.
3. 마이페이지에서 XRPL Testnet 지갑을 연결합니다.
4. 기업 KYB 서류를 제출합니다.
5. Admin이 KYB를 검토하고 승인합니다.
6. SME가 인보이스를 등록합니다.
7. Buyer가 인보이스 지급 의무를 확인합니다.
8. Admin이 인보이스를 검토하고 Risk Passport를 발급합니다.
9. Admin이 Invoice RWA 마켓 등록을 승인합니다.
10. Funder가 RWA 마켓에서 Funding Participation을 진행합니다.

## 기술 스택

### Frontend

- HTML
- Tailwind CSS
- Vanilla JavaScript

### Backend

- Node.js
- Express
- Supabase
- XRPL Testnet SDK

## 폴더 구조

```txt
frontend/
  pages/              # 정적 HTML 화면
  assets/
    js/               # 공통 프론트엔드 API 헬퍼

backend/
  src/                # Express 백엔드 소스
  .env                # 로컬 전용 백엔드 환경 변수
```

## 백엔드 환경 변수 설정

백엔드를 실행하기 전에 `backend/.env` 파일을 생성해야 합니다.

`backend/env.example`을 복사해서 사용합니다.

```bash
cd backend
cp env.example .env
```

Windows PowerShell에서는 다음 명령을 사용합니다.

```powershell
Copy-Item env.example .env
```

이후 `.env` 값을 실제 Supabase/XRPL 설정에 맞게 채웁니다.

```env
PORT=3000
JWT_SECRET=replace_with_a_long_random_secret

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 환경 변수 설명

| 이름 | 필수 여부 | 설명 |
| --- | --- | --- |
| `PORT` | 선택 | 로컬 백엔드 포트입니다. 기본값은 `3000`입니다. |
| `JWT_SECRET` | 필수 | 로그인 토큰 서명에 사용합니다. 긴 랜덤 문자열을 사용하세요. |
| `SUPABASE_URL` | 필수 | Supabase 프로젝트 URL입니다. |
| `SUPABASE_SERVICE_ROLE_KEY` | 필수 | 백엔드 전용 Supabase service role key입니다. 프론트엔드에 노출하면 안 됩니다. |

기존 로컬 환경에서 `SUPABASE_KEY`를 사용하던 경우가 있을 수 있습니다. 현재 백엔드에서는 `SUPABASE_SERVICE_ROLE_KEY` 사용을 권장합니다.

## 보안 주의사항

- `backend/.env`는 커밋하지 않습니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 브라우저 JavaScript에 절대 노출하지 않습니다.
- PoC 단계에서는 XRPL Testnet 주소와 Testnet 트랜잭션을 사용합니다.
- Testnet 지갑 seed도 민감정보로 취급합니다.

## 로컬 실행

백엔드 의존성을 설치합니다.

```bash
cd backend
npm install
```

백엔드를 실행합니다.

```bash
npm run dev
```

브라우저에서 다음 주소로 접속합니다.

```txt
http://localhost:3000
```

백엔드는 정적 프론트엔드 페이지를 서빙하고, 같은 origin에서 API를 제공합니다.

## 주요 페이지

```txt
/start.html
/signup.html
/login.html
/mypage.html?role=registrar
/mypage.html?role=payer
/mypage.html?role=funder
/kyb.html
/register.html
/invoice.html
/admin-kyb-review.html
/admin-risk-agent.html
/rwamarket.html
/payment.html
```

## 주요 API 범위

현재 데모의 주요 API 범위는 다음과 같습니다.

```txt
POST /api/auth/signup
POST /api/auth/login
GET  /api/me
GET  /api/mypage

POST   /api/wallets/connect
GET    /api/wallets/me
GET    /api/wallets/me/balance
DELETE /api/wallets/me

POST /api/kyb/verifications
GET  /api/kyb/me

GET   /api/admin/kyb/verifications
PATCH /api/admin/kyb/verifications/:verification_id/approve
PATCH /api/admin/kyb/verifications/:verification_id/reject

POST  /api/invoices
GET   /api/invoices
PATCH /api/invoices/:publicId/status
```

## 데모 가정

- KYB와 인보이스 검토는 Admin이 수동으로 승인할 수 있습니다.
- 실제 XRPL 잔액 조회가 구현되지 않은 경우 RLUSD 잔액은 데모 값으로 표시될 수 있습니다.
- 업로드된 서류 링크는 데모 URL로 표현될 수 있습니다.
- PoC 단계의 온체인 증빙은 XRPL Testnet을 사용합니다.
- Risk Passport와 Invoice RWA는 별도 개념입니다. Admin이 Risk Passport를 먼저 발급하고, 이후 Invoice RWA 마켓 등록을 승인합니다.
