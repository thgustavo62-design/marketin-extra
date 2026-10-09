-- Usuários com nome de exibição e senha provisória; contas de integração mapeadas a rede/filial.

alter table users
  add column display_name text,
  add column must_change_password boolean not null default false;

update users set display_name = username where display_name is null;

-- Cada conta externa (ex.: Instagram, conta de anúncios) pertence a uma rede e, opcionalmente, a uma filial.
create table integration_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'windsor',
  kind text not null check (kind in ('instagram', 'ads')),
  account_name text not null,
  brand_id uuid references brands(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, kind, account_name)
);

alter table integration_accounts enable row level security;
