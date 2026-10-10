-- Fase 5 — Alertas (central de notificações), registro de coletas e relatórios gerados.
-- Rollback: drop table notification_user_state, notification_events, alert_sync_state, integration_sync_runs, reports cascade;

-- Alerta = fato calculado pelo sistema sobre um registro de uma filial. A mesma condição nunca gera dois alertas
-- (dedupe_key) e some sozinha (resolved_at) quando deixa de valer. Leitura/dispensa são por pessoa.
create table notification_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  type text not null check (type in ('post_overdue', 'post_no_owner', 'approval_stale', 'campaign_unconfirmed', 'final_missing', 'integration_stale', 'collect_failed', 'target_pace')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  object_type text not null check (object_type in ('post', 'approval', 'campaign_instance', 'brand', 'sync_run', 'target')),
  object_id uuid,
  dedupe_key text not null unique,
  title text not null check (length(title) <= 200),
  detail text check (detail is null or length(detail) <= 400),
  href text not null check (href like '/%'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint notification_events_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete cascade
);
create index notification_events_open_idx on notification_events (brand_id, created_at desc) where resolved_at is null;

create table notification_user_state (
  event_id uuid not null references notification_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  primary key (event_id, user_id)
);

-- Uma linha: controla de quanto em quanto tempo os alertas são reavaliados (quem pega a vez roda; os outros pulam).
create table alert_sync_state (
  id smallint primary key default 1 check (id = 1),
  last_run timestamptz not null default 'epoch'
);
insert into alert_sync_state (id) values (1);

-- Cada tentativa de coleta (ou, no futuro, de relatório agendado) fica registrada, sem dados sensíveis.
create table integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('windsor')),
  job_type text not null check (job_type in ('collect_metrics', 'generate_report')),
  brand_id uuid references brands(id),
  status text not null check (status in ('ok', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer,
  error_summary_safe text check (error_summary_safe is null or length(error_summary_safe) <= 300),
  requested_by uuid references users(id) on delete set null
);
create index integration_sync_runs_idx on integration_sync_runs (brand_id, started_at desc);

-- Relatórios gerados. `snapshot` guarda os números exatamente como estavam na geração (regenerar cria outro retrato).
-- Mesmo tipo + filial + unidade + período + filtros no mesmo dia = o mesmo relatório (reprocessar não duplica).
create table reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  type text not null check (type in ('operacional', 'resultados', 'executivo')),
  period_start date not null,
  period_end date not null,
  filters jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  snapshot jsonb not null,
  data_through timestamptz,
  generated_by uuid references users(id) on delete set null,
  generated_at timestamptz not null default now(),
  check (period_end >= period_start),
  constraint reports_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id) on delete cascade
);
create index reports_brand_idx on reports (brand_id, generated_at desc);

alter table notification_events enable row level security;
alter table notification_user_state enable row level security;
alter table alert_sync_state enable row level security;
alter table integration_sync_runs enable row level security;
alter table reports enable row level security;
