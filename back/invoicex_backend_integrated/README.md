# InvoiceX backend 연동본

## 포함 파일
- `frontend/register.html`
- `frontend/invoice.html`
- `frontend/admin-risk-agent.html`
- `backend/server.js`
- `backend/sql/001_create_invoices.sql`
- `backend/.env.example`

## 실행 순서

1. Supabase SQL Editor에서 `backend/sql/001_create_invoices.sql` 실행
2. 기존 backend 폴더에 `backend/server.js` 내용을 붙이거나, 이 backend 폴더를 그대로 사용
3. `.env.example`을 `.env`로 복사 후 실제 값 입력
4. 의존성 설치 및 서버 실행

```bash
cd backend
npm install
npm run dev
```

5. 프론트 HTML을 Live Server 등으로 열고 아래 흐름 확인

```txt
register.html
→ POST http://localhost:3000/api/invoices
→ Supabase invoices 저장(status=needs_review)
→ invoice.html?invoice=#INV-...
→ 발행 승인
→ PATCH /api/invoices/:publicId/status(status=admin_pending)
→ admin-risk-agent.html?invoice=#INV-...
→ GET /api/admin/invoices?status=admin_pending
```

## 프론트 API 주소 변경
기본값은 `http://localhost:3000`입니다. 다른 주소를 쓰면 HTML 로딩 전에 아래 값을 주면 됩니다.

```html
<script>
  window.INVOICEX_API_BASE_URL = 'https://your-api.example.com';
</script>
```
