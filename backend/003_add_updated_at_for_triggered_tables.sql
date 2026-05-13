alter table public.companies
  add column if not exists updated_at timestamptz default now();

alter table public.users
  add column if not exists updated_at timestamptz default now();

alter table public.verifications
  add column if not exists updated_at timestamptz default now();

alter table public.wallets
  add column if not exists updated_at timestamptz default now();
