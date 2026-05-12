# InvoiceX Business Context

## One-Line Summary

InvoiceX is an XRPL-based invoice RWA early settlement platform that helps SMEs convert verified invoices into short-term cash-flow assets and receive early settlement from verified capital providers.

---

## What Problem InvoiceX Solves

SMEs often provide goods or services first and receive payment later.

This creates a cash-flow gap.

Even when the Buyer is expected to pay, the SME may need working capital before the invoice due date.

InvoiceX solves this by creating a verified invoice-based early settlement flow.

The platform verifies:

- The SME
- The Buyer / Payer
- The invoice
- The payment obligation
- The risk profile

After verification, the invoice can be converted into an Invoice RWA and listed for funding participation.

A verified Funder can then supply early settlement capital based on the Risk Passport.

---

## Core Value Proposition

InvoiceX connects three things:

1. Real invoice payment claims
2. Verified business and payment confirmation data
3. XRPL-based asset issuance, settlement, and transparency

The result is a platform where SMEs can access early liquidity, while Funders can participate in verified short-term cash-flow assets.

---

## Why XRPL

InvoiceX uses XRPL because the project needs fast, low-cost, transparent, and programmable settlement infrastructure.

XRPL is relevant to this product because it can support:

- Fast payment settlement
- Low transaction fees
- RLUSD-based settlement flow
- Invoice RWA issuance
- Trustline-based participation control
- Escrow-based maturity payment management
- Transparent transaction history
- Freeze / Clawback-related risk controls when needed

For the demo, not every XRPL feature needs to be fully implemented on-chain.

However, the product structure should clearly show how XRPL would be used in the real version.

---

## Main Users

## 1. SME

SME means the company that registers an invoice.

The SME wants to receive money earlier than the invoice due date.

The SME can:

- Sign up
- Select SME role
- Register company information
- Connect wallet
- Submit KYB
- Register invoices
- Request Buyer confirmation
- Request Risk Passport issuance
- List verified Invoice RWA
- Receive early settlement

The SME does not issue the Risk Passport by itself.

---

## 2. Buyer / Payer

Buyer or Payer means the company that is expected to pay the invoice.

The Buyer is not just a reference field.

The Buyer must be treated as a core user because the Buyer confirms whether the invoice payment obligation is valid.

The Buyer can:

- Sign up
- Select Buyer role
- Register company information
- Connect wallet
- Submit KYB if required
- View confirmation requests
- Confirm or reject invoice payment obligation
- Participate in maturity settlement

In the demo, Buyer and Payer can be treated as the same role if needed.

---

## 3. Funder

Funder means a verified capital provider.

The Funder supplies early settlement capital to verified Invoice RWAs.

The Funder can:

- Sign up
- Select Funder role
- Register company information
- Connect wallet
- Submit KYB
- View listed Invoice RWAs
- Review Risk Passport data
- Supply funds to selected Invoice RWAs
- Receive principal and settlement return after maturity settlement

Preferred terminology:

- Use “Funder”
- Use “capital provider”
- Use “funding participation”
- Avoid “investor” if possible

---

## 4. Admin / Verifier

Admin / Verifier means the platform-side reviewer.

Admin / Verifier is responsible for trust and risk validation.

Admin / Verifier can:

- Review KYB
- Approve or reject KYB
- Review invoice data
- Review Buyer confirmation status
- Issue Risk Passport
- Approve Invoice RWA issuance
- Manage marketplace listing state
- Review settlement status

Risk Passport must be issued by Admin / Verifier, not by SME.

---

## Core Product Flow

The full product flow is:

```txt
SME KYB
→ Invoice registration
→ Buyer payment confirmation
→ Admin invoice verification
→ Risk Passport issuance
→ Invoice RWA issuance approval
→ Market listing
→ Funder funding participation
→ SME early settlement
→ Buyer maturity payment
→ Funder principal + settlement return
```

For the current demo, the first priority is only the common flow:

```txt
Signup
→ Role selection and company name input
→ Login
→ Role-specific my page
→ Wallet connection
→ RLUSD balance display
→ KYB submission
→ Admin KYB approval
→ KYB verified badge display
```

---

## Current Signup Flow

The service no longer uses a separate first-login onboarding step.

Role selection and company name input happen during signup.

Signup input should include:

- Email
- Password
- Name
- Role type
- Company name

After signup, the backend should create:

- User profile
- Company record
- User role or company membership record
- Initial KYB status

Initial KYB status should be:

```txt
NOT_SUBMITTED
```

After login, the user should be routed based on role type.

Example routes:

```txt
SME → /mypage/sme
BUYER → /mypage/buyer
FUNDER → /mypage/funder
ADMIN → /admin
```

---

## My Page Requirements

The my page should show role-specific user status.

Common my page data:

- User name
- Email
- Role
- Company name
- KYB status
- KYB badge
- Wallet connection status
- Wallet address
- RLUSD balance

The my page should have:

- Wallet connection button
- KYB verification button
- KYB status display
- KYB verified badge display after approval

---

## Wallet Connection Flow

Wallet connection is not the login method.

The user logs in with email first.

After login, the user can connect an XRPL wallet from the my page.

When connected, the backend stores:

- User ID
- Company ID if relevant
- Wallet address
- Wallet type
- Connected status
- Connected timestamp

The my page should display:

- Wallet address
- RLUSD balance

For the demo, RLUSD balance may be mocked if real XRPL balance query is not implemented.

Important:

Do not claim a real on-chain balance or transaction unless the backend actually queries XRPL.

---

## KYB Flow

KYB means company verification.

The user submits KYB information from the KYB screen.

KYB information may include:

- Company name
- Business registration number
- Representative name
- Business address
- Business type
- Contact email
- Uploaded document URL

After submission:

```txt
KYB status = PENDING
```

Admin reviews the KYB request.

If approved:

```txt
KYB status = APPROVED
```

The my page should display:

- KYB completed status
- KYB verified badge

If rejected:

```txt
KYB status = REJECTED
```

The user should be able to see the rejection reason.

---

## Risk Passport

Risk Passport is a trust and risk explanation document.

It is not the invoice itself.

It should contain information such as:

- Invoice ID
- SME company
- Buyer company
- Payment amount
- Due date
- Currency
- Buyer confirmation status
- KYB status
- Verification status
- Dispute status
- Risk grade
- Expected return
- Verifier signature or issuer
- Issued timestamp

Important:

Risk Passport is issued by Admin / Verifier after review.

SME may request Risk Passport issuance, but SME does not issue it directly.

---

## Invoice RWA

Invoice RWA is the asset representation of a verified invoice.

It is different from the Risk Passport.

The Invoice RWA is the asset record that can be listed in the marketplace and receive Funder participation.

Invoice RWA may include:

- Invoice ID
- XRPL asset ID
- Issuer wallet
- Currency
- Face value
- Funding target amount
- Due date
- Market status
- Linked Risk Passport ID

---

## Difference Between Invoice, Risk Passport, and Invoice RWA

### Invoice

The original payment claim.

It contains:

- Who should pay
- Who should receive payment
- How much should be paid
- When it should be paid
- What transaction it is based on

### Risk Passport

The verification and risk explanation document.

It answers:

- Has the Buyer confirmed the payment obligation?
- Has KYB been completed?
- Has the invoice been reviewed?
- What is the risk grade?
- What is the expected settlement return?

### Invoice RWA

The fundable asset created from the verified invoice.

It answers:

- Can Funders participate?
- How much funding is needed?
- What is the market / listing status?
- What XRPL asset or record represents this invoice?

---

## Marketplace Flow

The marketplace should show listed Invoice RWAs.

Funder can browse listed assets and review the linked Risk Passport.

Funder should not need to inspect raw internal admin data.

Funder-facing data should be clear and trust-oriented:

- SME company summary
- Buyer confirmation status
- Invoice amount
- Due date
- Risk grade
- Expected return
- Funding progress
- Settlement status

---

## Settlement Flow

There are two important settlement stages.

### 1. Early Settlement

Funder supplies funds.

SME receives early settlement before the invoice due date.

### 2. Maturity Settlement

Buyer pays on or near the due date.

Funder receives principal plus settlement return.

For the demo, this can be simulated through database status changes if real XRPL settlement is not ready.

---

## Important Business Rules

1. Role selection happens during signup.
2. Wallet connection happens after login.
3. KYB approval is required before sensitive financial actions.
4. Buyer confirmation is required before Risk Passport issuance.
5. Risk Passport is issued by Admin / Verifier.
6. Invoice RWA is separate from Risk Passport.
7. Funder participates based on the listed Invoice RWA and linked Risk Passport.
8. Admin review steps should be visible in the database.
9. Demo shortcuts are allowed, but they must be clearly marked as demo-only.
10. Do not describe the product as a speculative investment platform.

---

## Preferred Language

Use the following terms:

- SME
- Buyer
- Payer
- Funder
- Admin
- Verifier
- Invoice
- Buyer Confirmation
- Risk Passport
- Invoice RWA
- Funding Participation
- Early Settlement
- Maturity Settlement
- Settlement Return
- Verified Capital Provider
- Short-Term Cash-Flow Asset

Avoid these terms when possible:

- Investor
- Investment product
- Investment return
- Security token
- Loan product

---

## Current Backend Priority

The current backend priority is the common flow.

Build this first:

1. Signup with role and company name
2. Login
3. Current user state API
4. Role-specific my page API
5. Wallet connection API
6. RLUSD balance display API
7. KYB submission API
8. Admin KYB review API
9. KYB approval / rejection API
10. KYB verified badge display

Do not start implementing detailed invoice, Buyer confirmation, Risk Passport, RWA issuance, funding, escrow, or settlement APIs until the user provides the next flow.

---

## Recommended API Scope for Current Phase

### Auth

```txt
POST /api/auth/signup
POST /api/auth/login
GET  /api/me
```

### My Page

```txt
GET /api/mypage
```

### Wallet

```txt
POST   /api/wallets/connect
GET    /api/wallets/me
GET    /api/wallets/me/balance
DELETE /api/wallets/me
```

### KYB

```txt
POST /api/kyb/verifications
GET  /api/kyb/me
```

### Admin KYB Review

```txt
GET   /api/admin/kyb/verifications
GET   /api/admin/kyb/verifications/:verification_id
PATCH /api/admin/kyb/verifications/:verification_id/approve
PATCH /api/admin/kyb/verifications/:verification_id/reject
```

---

## Demo Assumptions

These assumptions are acceptable for the demo:

- Role-based test accounts can be used.
- RLUSD balance can be mocked.
- XRPL Escrow can be simulated in the database.
- KYB can be manually approved by Admin.
- Uploaded KYB documents can be represented by URLs.
- Admin dashboard can be simple.
- Buyer / Payer can be simplified as one role if needed.

These assumptions should not be hidden.

Mark them clearly as demo behavior in comments or documentation.