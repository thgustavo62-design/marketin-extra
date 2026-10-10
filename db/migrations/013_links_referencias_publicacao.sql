-- Fase 7 — Links UTM/QR, referências (concorrentes) manuais e confirmação manual de publicação.
-- Rollback: drop table inspirations, reference_accounts, campaign_links cascade; alter table posts drop column publication_method, drop column published_url, drop column published_confirmed_by, drop column published_confirmed_at;

-- Link de campanha: destino https + parâmetros UTM. O QR só sai depois de aprovado por outra pessoa (ou administrador),
-- que confirma ter aberto o destino. Não há medição de cliques aqui: nada de conversão inventada.
create table campaign_links (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  campaign_id uuid references campaigns(id) on delete set null,
  label text not null check (length(label) between 2 and 120),
  destination_url text not null check (destination_url ~ '^https://' and length(destination_url) <= 2000),
  utm_source text not null check (utm_source ~ '^[a-z0-9_-]{1,60}$'),
  utm_medium text not null check (utm_medium ~ '^[a-z0-9_-]{1,60}$'),
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9_-]{1,80}$'),
  utm_term text check (utm_term is null or utm_term ~ '^[a-z0-9_-]{1,60}$'),
  utm_content text check (utm_content is null or utm_content ~ '^[a-z0-9_-]{1,60}$'),
  final_url text not null check (length(final_url) <= 2600),
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'arquivado')),
  notes text check (notes is null or length(notes) <= 500),
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'aprovado') = (approved_at is not null) or status = 'arquivado'),
  constraint campaign_links_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete restrict
);
create unique index campaign_links_final_idx on campaign_links (brand_id, final_url) where status <> 'arquivado';
create index campaign_links_brand_idx on campaign_links (brand_id, created_at desc);

-- Contas públicas de referência. Cadastro manual: nada de coleta automática nem credenciais de terceiros.
create table reference_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  name text not null check (length(name) between 2 and 120),
  network text not null check (network in ('instagram', 'facebook', 'tiktok', 'youtube', 'site', 'outro')),
  url text check (url is null or (url ~ '^https://' and length(url) <= 500)),
  category text check (category is null or length(category) <= 80),
  region text check (region is null or length(region) <= 80),
  relevance smallint not null default 2 check (relevance between 1 and 3),
  notes text check (notes is null or length(notes) <= 1000),
  active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, brand_id)
);
create index reference_accounts_brand_idx on reference_accounts (brand_id, active);

-- Biblioteca de inspirações: ideias, formatos, datas sazonais e exemplos. Não copia material de terceiros; guarda só a anotação e o endereço da fonte.
create table inspirations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  reference_id uuid,
  campaign_id uuid references campaigns(id) on delete set null,
  post_id uuid,
  asset_id uuid,
  kind text not null check (kind in ('ideia', 'formato', 'data_sazonal', 'exemplo')),
  title text not null check (length(title) between 2 and 140),
  description text not null default '' check (length(description) <= 2000),
  source_url text check (source_url is null or (source_url ~ '^https://' and length(source_url) <= 500)),
  tags text[] not null default '{}',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inspirations_reference_fk foreign key (reference_id, brand_id) references reference_accounts (id, brand_id) on delete set null (reference_id),
  constraint inspirations_post_fk foreign key (post_id, brand_id) references posts (id, brand_id) on delete set null (post_id),
  constraint inspirations_asset_fk foreign key (asset_id, brand_id) references media_assets (id, brand_id) on delete set null (asset_id)
);
create index inspirations_brand_idx on inspirations (brand_id, created_at desc);

-- Publicação: o sistema só agenda por dentro, lembra e registra a confirmação humana (com o endereço da publicação).
-- 'api' fica reservado: não é habilitado sem prova de viabilidade em conta de teste autorizada (ver docs/VIABILIDADE-PUBLICACAO.md).
alter table posts
  add column publication_method text not null default 'manual' check (publication_method in ('manual', 'assistido', 'api')),
  add column published_url text check (published_url is null or (published_url ~ '^https://' and length(published_url) <= 500)),
  add column published_confirmed_by uuid references users(id) on delete set null,
  add column published_confirmed_at timestamptz;

alter table campaign_links enable row level security;
alter table reference_accounts enable row level security;
alter table inspirations enable row level security;
