-- Fase 1 — Central de Produção.
-- posts.stage continua sendo a ÚNICA fonte de status; o quadro Kanban é só outra visão de posts.

-- 1) etapas: de 5 para 9 (rascunho vira ideia)
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%rascunho%';
  if c is not null then execute format('alter table posts drop constraint %I', c); end if;
end $$;

update posts set stage = 'ideia' where stage = 'rascunho';

alter table posts
  add constraint posts_stage_check
  check (stage in ('ideia','briefing','producao','revisao','aprovacao','aprovado','agendado','publicado','cancelado'));
alter table posts alter column stage set default 'ideia';

-- 2) campos de produção
alter table posts
  add column assigned_to uuid references users(id) on delete set null,
  add column reviewer_id uuid references users(id) on delete set null,
  add column priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column due_at date,
  add column blocked_reason text check (blocked_reason is null or length(blocked_reason) <= 300),
  add column updated_by uuid references users(id) on delete set null;

create index posts_brand_stage_idx on posts(brand_id, stage);
create index posts_assigned_idx on posts(assigned_to) where assigned_to is not null;

-- 3) a unidade de um conteúdo precisa pertencer à mesma filial (antes só a aplicação garantia)
alter table branches add constraint branches_id_brand_key unique (id, brand_id);
alter table posts
  add constraint posts_branch_brand_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete restrict;

-- 4) checklist, comentários e histórico de etapas
create table post_checklist_items (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  label text not null check (length(label) between 1 and 200),
  is_complete boolean not null default false,
  completed_by uuid references users(id) on delete set null,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index post_checklist_post_idx on post_checklist_items(post_id, sort_order);

create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on post_comments(post_id, created_at);

create table post_status_events (
  id bigserial primary key,
  post_id uuid not null references posts(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  actor_id uuid references users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index post_status_events_post_idx on post_status_events(post_id, created_at);

alter table post_checklist_items enable row level security;
alter table post_comments enable row level security;
alter table post_status_events enable row level security;
