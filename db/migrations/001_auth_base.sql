-- Etapa 1: autenticação própria + redes/unidades base.
-- Todas as tabelas têm RLS ligado e NENHUMA policy: a chave publishable
-- (front-end) não lê nem escreve nada aqui. Só o servidor, via DATABASE_URL.

create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text not null unique,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  password_changed_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text
);
create index sessions_user_idx on sessions(user_id);

create table login_attempts (
  id bigserial primary key,
  username_normalized text not null,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_user_idx on login_attempts(username_normalized, created_at desc);
create index login_attempts_ip_idx on login_attempts(ip, created_at desc);

create table audit_events (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  action text not null,
  target text,
  ip text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_created_idx on audit_events(created_at desc);

create table brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  city text,
  created_at timestamptz not null default now(),
  unique (brand_id, name)
);

insert into brands (slug, name) values
  ('minas-farma', 'Minas Farma'),
  ('farma-e-farma', 'Farma e Farma');

alter table users enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;
alter table audit_events enable row level security;
alter table brands enable row level security;
alter table branches enable row level security;
