create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  issuer_name text not null,
  buyer_name text not null,
  buyer_email text not null,
  amount numeric(16, 0) not null check (amount > 0),
  currency text not null default 'KRW',
  due_date date not null,
  delivery_date date not null,
  description text not null,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint,
  doc_url text,
  status text not null default 'needs_review' check (
    status in ('needs_review', 'admin_pending', 'rejected', 'supplement_requested', 'rwa_approved')
  ),
  admin_approval text not null default 'none' check (
    admin_approval in ('none', 'pending', 'approved', 'rejected')
  ),
  passport_issued boolean not null default false,
  risk_grade text,
  admin_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_public_id on public.invoices(public_id);
create index if not exists idx_invoices_created_at on public.invoices(created_at desc);

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
