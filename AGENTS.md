# AGENTS.md

## Project Name

InvoiceX

## Purpose of This File

This file gives coding agents the project context, development rules, and implementation constraints for InvoiceX.

Before making any code changes, read this file and `docs/business-context.md`.

---

## Required Context Files

Always read these files before planning or implementing backend features:

- `docs/business-context.md`
- Existing README files
- Existing database schema or migration files
- Existing API route/controller/service files

If any of these files are missing, infer from the current codebase and clearly state assumptions before implementing.

---

## Project Summary

InvoiceX is an XRPL-based invoice RWA early settlement platform.

The service helps SMEs receive early settlement based on verified invoices. A Buyer confirms the payment obligation, an Admin/Verifier reviews the invoice and issues a Risk Passport, and a verified Funder provides early settlement liquidity through an Invoice RWA structure.

The project is currently being built as a hackathon/demo product. Prioritize a clear working flow over excessive production-level complexity.

---

## Core User Roles

The main roles are:

- SME: A company that registers invoices and requests early settlement.
- Buyer / Payer: A company that confirms the invoice payment obligation and participates in maturity settlement.
- Funder: A verified capital provider that supplies early settlement funds to invoice RWAs.
- Admin / Verifier: A platform-side operator who reviews KYB, invoice validity, buyer confirmation, Risk Passport issuance, and RWA approval.

Important:
- Buyer and Payer may refer to the same payment-side company in the demo flow.
- Buyer is not a passive reference field. Buyer must be treated as a core user.
- Risk Passport must be issued by Admin/Verifier, not by SME.
- Invoice RWA and Risk Passport must be treated as separate concepts.

---

## Current Demo Flow

The current common user flow is:

1. User opens the service.
2. User signs up or logs in with email.
3. During signup, the user selects a role and enters a company name.
4. After login, the user is redirected to the role-specific my page.
5. On my page, the user can connect an XRPL wallet.
6. When a wallet is connected, the my page displays:
   - Wallet address
   - RLUSD balance
7. On my page, the user can start KYB verification.
8. User enters KYB information.
9. Admin reviews the KYB request.
10. When approved, the my page displays:
   - KYB completed status
   - KYB verified badge

There is no separate first-login onboarding step anymore. Role selection and company name input happen during signup.

---

## Backend Implementation Principles

### 1. Keep the backend simple for the demo

This is a hackathon/demo project. Prefer a clear, working implementation over a complex architecture.

Do not over-engineer:
- Do not add unnecessary microservices.
- Do not add queues unless already present.
- Do not add complex blockchain settlement logic unless requested.
- Do not add unnecessary packages.

### 2. Preserve the existing project structure

Before creating new folders or changing architecture, inspect the existing structure.

Follow existing patterns for:
- Routes
- Controllers
- Services
- Models
- Middleware
- Supabase client usage
- Error handling
- Naming conventions

If no clear structure exists, use a simple Express-style separation:

```txt
src/
├─ routes/
├─ controllers/
├─ services/
├─ middleware/
├─ utils/
└─ config/