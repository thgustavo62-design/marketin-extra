-- Fase 3 — Campanhas recorrentes: modelos, entregas e instâncias idempotentes.
-- Rollback: drop table campaign_instances, campaign_template_deliverables, campaign_templates cascade; alter table posts drop column campaign_instance_id;

create table campaign_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  -- null = "Todas as unidades"
  branch_id uuid,
  name text not null check (length(name) between 2 and 120),
  objective text not null default '' check (length(objective) <= 500),
  briefing text not null default '' check (length(briefing) <= 4000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  active boolean not null default true,
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  -- regra de recorrência (nada fixo no código: cada filial configura a sua)
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'dates')),
  start_dow smallint check (start_dow between 0 and 6),
  anchor_date date,
  day_of_month smallint check (day_of_month between 1 and 31),
  specific_dates date[] not null default '{}',
  duration_days smallint not null default 1 check (duration_days between 1 and 31),
  valid_from date,
  valid_to date,
  -- prazos relativos ao início da campanha (D-n)
  lead_days smallint not null default 7 check (lead_days between 0 and 60),
  briefing_days smallint not null default 7 check (briefing_days between 0 and 60),
  creation_days smallint not null default 5 check (creation_days between 0 and 60),
  approval_days smallint not null default 2 check (approval_days between 0 and 60),
  default_owner uuid references users(id) on delete set null,
  default_reviewer uuid references users(id) on delete set null,
  checklist text[] not null default '{}',
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint campaign_templates_branch_brand_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete restrict
);
create index campaign_templates_brand_idx on campaign_templates (brand_id, active);

create table campaign_template_deliverables (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references campaign_templates(id) on delete cascade,
  format text not null check (format in ('feed', 'carrossel', 'reels')),
  quantity smallint not null default 1 check (quantity between 1 and 10),
  -- dias depois do início da campanha em que esta peça é publicada (0 = no primeiro dia)
  publish_offset_days smallint not null default 0 check (publish_offset_days between 0 and 31),
  sort_order smallint not null default 0
);
create index campaign_template_deliverables_idx on campaign_template_deliverables (template_id, sort_order);

-- Uma linha por ocorrência gerada. Cancelar não apaga: a chave continua ocupada e a ocorrência nunca é recriada.
create table campaign_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references campaign_templates(id) on delete restrict,
  campaign_id uuid references campaigns(id) on delete set null,
  brand_id uuid not null references brands(id),
  branch_id uuid,
  occurrence_start date not null,
  occurrence_end date not null check (occurrence_end >= occurrence_start),
  status text not null default 'generated' check (status in ('generated', 'cancelled')),
  -- modelo|filial|unidade|início — garante que a mesma ocorrência não é gerada duas vezes
  generation_key text not null unique,
  origin text not null default 'manual' check (origin in ('manual', 'job')),
  -- reconfirmação humana de produtos, preços, validade e estoque
  reconfirmed_at timestamptz,
  reconfirmed_by uuid references users(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  unique (template_id, occurrence_start),
  constraint campaign_instances_branch_brand_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete restrict
);
create index campaign_instances_brand_idx on campaign_instances (brand_id, occurrence_start desc);

alter table posts add column campaign_instance_id uuid references campaign_instances(id) on delete set null;
create index posts_campaign_instance_idx on posts (campaign_instance_id) where campaign_instance_id is not null;

alter table campaign_templates enable row level security;
alter table campaign_template_deliverables enable row level security;
alter table campaign_instances enable row level security;
