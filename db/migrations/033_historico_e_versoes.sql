-- Histórico da arte: (1) registro de quem mudou preço/nome/foto dos encartes e quando; (2) versões (retratos) dos elementos, do fundo e dos textos da promoção/design, com restauração.
-- Versões NÃO guardam os encartes (nome, preço, foto): para isso existe o registro de alterações.
-- Rollback: drop table promo_versions; drop table promo_item_audit;
create table promo_item_audit (
  id bigserial primary key,
  campaign_id uuid not null references promo_campaigns(id) on delete cascade,
  item_id uuid,
  item_name text not null,
  user_id uuid references users(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  at timestamptz not null default now()
);
create index promo_item_audit_campaign_idx on promo_item_audit (campaign_id, at desc);
alter table promo_item_audit enable row level security;

create table promo_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references promo_campaigns(id) on delete cascade,
  kind text not null check (kind in ('manual', 'aprovacao', 'auto', 'antes-de-restaurar')),
  label text,
  layers jsonb,
  overrides jsonb,
  design_pages integer,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index promo_versions_campaign_idx on promo_versions (campaign_id, created_at desc);
alter table promo_versions enable row level security;
