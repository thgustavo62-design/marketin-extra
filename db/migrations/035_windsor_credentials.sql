-- Chave compartilhada apenas por este workspace; segredo cifrado com AES-256-GCM.
-- Rollback: drop table integration_credentials;
create table integration_credentials (
  provider text primary key check (provider = 'windsor'),
  encrypted_secret text,
  enabled boolean not null default true,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (not enabled or encrypted_secret is not null)
);
alter table integration_credentials enable row level security;
revoke all on integration_credentials from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on integration_credentials from %I', role_name);
    end if;
  end loop;
end $$;
