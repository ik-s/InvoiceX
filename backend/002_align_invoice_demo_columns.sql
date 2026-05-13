create extension if not exists pgcrypto;

alter table public.invoices
  add column if not exists invoice_id uuid default gen_random_uuid(),
  add column if not exists issuer_company_id uuid,
  add column if not exists payer_company_id uuid,
  add column if not exists payer_company_name text,
  add column if not exists invoice_number text,
  add column if not exists invoice_amount numeric,
  add column if not exists delivery_completed boolean default false,
  add column if not exists public_id text,
  add column if not exists issuer_name text,
  add column if not exists buyer_name text,
  add column if not exists buyer_email text,
  add column if not exists amount numeric(16, 0),
  add column if not exists delivery_date date,
  add column if not exists file_name text,
  add column if not exists file_mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists doc_url text,
  add column if not exists admin_approval text default 'none',
  add column if not exists passport_issued boolean default false,
  add column if not exists risk_grade text,
  add column if not exists admin_memo text,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_invoices_public_id_unique
  on public.invoices(public_id)
  where public_id is not null;

create index if not exists idx_invoices_status_demo
  on public.invoices(status);

create index if not exists idx_invoices_created_at_demo
  on public.invoices(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();
