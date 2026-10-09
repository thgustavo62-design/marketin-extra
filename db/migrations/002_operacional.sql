-- Etapa 2: base operacional (unidades, campanhas, conteúdos, base de informações).
-- RLS ligado e sem policies em todas as tabelas (acesso só pelo servidor).

alter table branches
  add column address text,
  add column phone text,
  add column hours text,
  add column active boolean not null default true;

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  objective text not null default '',
  briefing text not null default '',
  approver text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index campaigns_brand_idx on campaigns(brand_id, starts_on);

create table posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  -- null = "Todas as unidades"
  branch_id uuid references branches(id) on delete restrict,
  -- ao excluir a campanha o conteúdo fica; o nome é guardado como referência histórica
  campaign_id uuid references campaigns(id) on delete set null,
  campaign_name text,
  title text not null,
  post_date date not null,
  post_time time,
  format text not null check (format in ('feed', 'carrossel', 'reels')),
  pillar text not null check (pillar in ('institucional','campanha','bastidores','servicos','educacao','medicamentos','relacionamento')),
  stage text not null default 'rascunho' check (stage in ('rascunho','producao','revisao','aprovado','publicado')),
  caption text not null default '',
  script text not null default '',
  reels jsonb not null default '{}'::jsonb,
  origin text not null default '',
  pharma_review boolean not null default false,
  reach integer check (reach >= 0),
  saves integer check (saves >= 0),
  shares integer check (shares >= 0),
  revision integer not null default 1,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_brand_date_idx on posts(brand_id, post_date);
create index posts_date_idx on posts(post_date);

create table knowledge (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  kind text not null check (kind in ('posicionamento','publico','tom_de_voz','identidade_visual','contatos','horarios','servicos','campanhas_recorrentes','fidelidade','termos_evitar')),
  title text not null,
  content text not null default '',
  source text not null default '',
  owner text not null default '',
  valid_until date,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index knowledge_brand_idx on knowledge(brand_id, kind);

alter table campaigns enable row level security;
alter table posts enable row level security;
alter table knowledge enable row level security;
