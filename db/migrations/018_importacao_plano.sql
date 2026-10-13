-- Importação de plano de conteúdo em PDF: o PDF é lido no servidor, a pessoa confere a prévia e confirma; só então viram pautas.
-- Rollback: alter table posts drop column plan_import_id, drop column plan_code; drop table plan_imports;

create table plan_imports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid references branches(id) on delete set null,
  file_name text not null check (length(file_name) between 1 and 200),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  pages integer not null check (pages >= 1),
  -- previa: lido e aguardando confirmação · importado: pautas criadas · desfeito: pautas removidas
  status text not null default 'previa' check (status in ('previa', 'importado', 'desfeito')),
  -- plano lido (entradas e avisos), gravado pelo servidor; a confirmação lê daqui e nunca confia no navegador
  parsed jsonb not null,
  options jsonb not null default '{}'::jsonb,
  period_start date,
  period_end date,
  campaign_id uuid references campaigns(id) on delete set null,
  created_count integer,
  skipped_count integer,
  kept_count integer,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  imported_by uuid references users(id) on delete set null,
  undone_at timestamptz,
  undone_by uuid references users(id) on delete set null
);
create index plan_imports_brand_idx on plan_imports(brand_id, created_at desc);
-- o mesmo arquivo não entra duas vezes na mesma filial/unidade (para reimportar, desfaça a importação anterior)
create unique index plan_imports_once_idx on plan_imports(brand_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), file_sha256) where status = 'importado';
alter table plan_imports enable row level security;

alter table posts
  add column plan_import_id uuid references plan_imports(id) on delete set null,
  add column plan_code text check (plan_code is null or length(plan_code) <= 20);
create unique index posts_plan_code_idx on posts(plan_import_id, plan_code) where plan_import_id is not null and plan_code is not null;
create index posts_plan_import_idx on posts(plan_import_id) where plan_import_id is not null;
