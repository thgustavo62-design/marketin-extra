-- Fase 4 — Publicações reais, snapshots de métricas e metas.
-- Rollback: drop table publication_metric_snapshots, account_metric_snapshots, brand_targets, external_publications cascade;

-- Publicação real encontrada na rede (hoje: Instagram, via Windsor). Uma linha por mídia externa.
-- O vínculo com o conteúdo planejado é opcional e sempre registra quem fez e como.
create table external_publications (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  platform text not null check (platform in ('instagram')),
  external_account_id text not null,
  account_name text not null,
  external_media_id text not null,
  permalink text check (permalink is null or permalink ~ '^https://'),
  media_type text,
  media_product_type text,
  caption_excerpt text check (caption_excerpt is null or length(caption_excerpt) <= 160),
  published_at timestamptz,
  content_id uuid,
  link_method text check (link_method in ('api', 'manual', 'verified_match')),
  linked_by uuid references users(id) on delete set null,
  linked_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (platform, external_account_id, external_media_id),
  -- o conteúdo precisa ser da mesma filial da publicação
  constraint external_publications_content_fk foreign key (content_id, brand_id) references posts (id, brand_id) on delete restrict,
  constraint external_publications_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete restrict,
  check ((content_id is null) = (link_method is null))
);
create index external_publications_brand_idx on external_publications (brand_id, published_at desc);
create index external_publications_content_idx on external_publications (content_id) where content_id is not null;

-- Um retrato por publicação por dia de coleta. Valores ausentes ficam NULL (N/D), nunca 0.
create table publication_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references external_publications(id) on delete cascade,
  collected_on date not null,
  collected_at timestamptz not null default now(),
  window_start date,
  window_end date not null,
  source text not null default 'windsor',
  metric_schema_version smallint not null default 1,
  reach integer check (reach >= 0),
  views integer check (views >= 0),
  likes integer check (likes >= 0),
  comments integer check (comments >= 0),
  saves integer check (saves >= 0),
  shares integer check (shares >= 0),
  reel_interactions integer check (reel_interactions >= 0),
  data_quality text not null check (data_quality in ('complete', 'partial')),
  collected_by uuid references users(id) on delete set null,
  unique (publication_id, collected_on)
);

-- Retrato da conta (usado como histórico das metas quando o Windsor está fora do ar).
create table account_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  kind text not null check (kind in ('instagram', 'ads')),
  external_account_id text not null,
  account_name text not null,
  period_start date not null,
  period_end date not null,
  collected_on date not null,
  collected_at timestamptz not null default now(),
  metric_schema_version smallint not null default 1,
  followers integer check (followers >= 0),
  views bigint check (views >= 0),
  interactions bigint check (interactions >= 0),
  spend numeric(14, 2) check (spend >= 0),
  conversations integer check (conversations >= 0),
  data_quality text not null check (data_quality in ('complete', 'partial')),
  collected_by uuid references users(id) on delete set null,
  unique (kind, external_account_id, period_start, period_end, collected_on),
  constraint account_metric_snapshots_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete restrict
);
create index account_metric_snapshots_idx on account_metric_snapshots (brand_id, period_start, collected_at desc);

-- Metas mensais por filial (e, opcionalmente, por unidade).
create table brand_targets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  period_start date not null check (extract(day from period_start) = 1),
  period_end date not null,
  metric_key text not null check (metric_key in ('posts_planned', 'posts_published', 'ig_views', 'ig_interactions', 'ig_followers', 'ads_spend', 'ads_conversations', 'ads_cost_per_conversation')),
  target_value numeric(16, 2) not null check (target_value >= 0),
  unit text not null check (unit in ('count', 'brl')),
  expected_source text not null check (expected_source in ('internal', 'instagram', 'ads')),
  owner_id uuid references users(id) on delete set null,
  notes text check (notes is null or length(notes) <= 500),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  constraint brand_targets_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete restrict
);
-- no máximo uma meta por indicador, mês e escopo (NULL de unidade conta como "todas")
create unique index brand_targets_unique_idx on brand_targets (brand_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, metric_key);

alter table external_publications enable row level security;
alter table publication_metric_snapshots enable row level security;
alter table account_metric_snapshots enable row level security;
alter table brand_targets enable row level security;
