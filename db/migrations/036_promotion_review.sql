-- Rascunhos de importação e decisões por empresa. Reutiliza promo_items, studio_pages,
-- promo_themes, promo_library e versionamento existentes, sem duplicar essas entidades.
create table promo_grouping_rules (
  brand_id uuid primary key references brands(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table promo_imports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  name text not null,
  filename text not null,
  file_hash text not null,
  original_file bytea not null,
  original_rows jsonb not null,
  groups jsonb not null,
  diagnostics jsonb not null,
  rules jsonb not null,
  revision integer not null default 1,
  campaign_id uuid references promo_campaigns(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index promo_imports_brand_idx on promo_imports(brand_id,updated_at desc);
create table promo_grouping_memory (
  brand_id uuid not null references brands(id) on delete cascade,
  signature text not null,
  decision text not null check(decision in ('approved','rejected')),
  title text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(brand_id,signature)
);
alter table promo_campaigns add column brand_id uuid references brands(id);
alter table promo_items add column photo_image_ids uuid[] not null default '{}';
alter table products add column commercial_attributes jsonb not null default '{}'::jsonb;
alter table promo_themes add column active boolean not null default true,
  add column version integer not null default 1,
  add column category text not null default 'outro';
create table promo_theme_versions (
  theme_id uuid not null references promo_themes(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(theme_id,version)
);
-- Novas tabelas só são usadas pelo servidor PostgreSQL; nenhuma política permite acesso pelo Data API.
do $$ declare n text; r text; begin
  foreach n in array array['promo_grouping_rules','promo_imports','promo_grouping_memory','promo_theme_versions'] loop
    execute format('alter table %I enable row level security', n);
    execute format('revoke all on %I from public', n);
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on %I from %I',n,r); end if;
    end loop;
  end loop;
end $$;
alter table promo_library drop constraint promo_library_category_check;
alter table promo_library add constraint promo_library_category_check check(category in ('icone','logo','selo','fundo','foto','outro','etiqueta','faixa','textura','moldura','mascote','rodape','campanha'));
