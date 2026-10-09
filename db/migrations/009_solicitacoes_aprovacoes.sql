-- Fase 2 — Solicitações de peças, versões de conteúdo e aprovações.

-- Política por filial: exige aprovação registrada antes de "aprovado/agendado/publicado".
alter table brands add column approval_required boolean not null default true;

-- Trilha da revisão farmacêutica (quem marcou e quando) e observação de conformidade.
alter table posts
  add column compliance_note text check (compliance_note is null or length(compliance_note) <= 1000),
  add column pharma_reviewed_by uuid references users(id) on delete set null,
  add column pharma_reviewed_at timestamptz;

create table content_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  requested_by uuid references users(id) on delete set null,
  title text not null check (length(title) between 1 and 140),
  type text not null check (type in ('arte', 'carrossel', 'reels', 'story', 'video', 'outro')),
  briefing text not null default '' check (length(briefing) <= 4000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at date,
  -- briefing de oferta: nada é reaproveitado de campanhas antigas sem nova confirmação
  offer_item text check (offer_item is null or length(offer_item) <= 200),
  offer_price numeric(12, 2) check (offer_price is null or offer_price >= 0),
  offer_valid_until date,
  info_confirmed_at timestamptz,
  info_confirmed_by uuid references users(id) on delete set null,
  status text not null default 'recebida' check (status in ('recebida', 'precisa_info', 'aceita', 'em_producao', 'concluida', 'cancelada')),
  linked_post_id uuid references posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_requests_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id)
);
create index content_requests_brand_idx on content_requests (brand_id, status, created_at desc);

-- Foto imutável do conteúdo no momento do envio para aprovação.
create table content_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  title text not null,
  caption text not null,
  script text not null,
  reels jsonb not null default '{}'::jsonb,
  origin text not null default '',
  campaign_id uuid,
  asset_manifest jsonb not null default '[]'::jsonb,
  content_checksum text not null,
  change_reason text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_id, version_number)
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  brand_id uuid not null,
  version_id uuid not null references content_versions(id),
  submitted_by uuid references users(id) on delete set null,
  reviewer_id uuid references users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes_requested', 'invalidated')),
  reason text check (reason is null or length(reason) <= 2000),
  decided_by uuid references users(id) on delete set null,
  decided_at timestamptz,
  invalidated_reason text,
  created_at timestamptz not null default now(),
  foreign key (post_id, brand_id) references posts (id, brand_id) on delete cascade
);
-- no máximo uma aprovação pendente por conteúdo
create unique index approvals_one_pending_idx on approvals (post_id) where status = 'pending';
create index approvals_post_idx on approvals (post_id, created_at desc);
create index approvals_queue_idx on approvals (brand_id, status);

create table approval_events (
  id bigserial primary key,
  approval_id uuid not null references approvals(id) on delete cascade,
  event text not null check (event in ('submitted', 'approved', 'rejected', 'changes_requested', 'invalidated', 'withdrawn')),
  actor_id uuid references users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index approval_events_idx on approval_events (approval_id, created_at);

alter table content_requests enable row level security;
alter table content_versions enable row level security;
alter table approvals enable row level security;
alter table approval_events enable row level security;
