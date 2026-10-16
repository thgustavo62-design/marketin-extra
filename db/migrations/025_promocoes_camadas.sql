-- Elementos livres sobre as peças (texto, imagem, formas), como no Canva: camadas por formato e as imagens enviadas para elas.
-- Rollback: drop table promo_assets; alter table promo_campaigns drop column layers;
alter table promo_campaigns
  -- { story: Layer[], feed: Layer[], a4: Layer[] } (ver src/lib/domain/promo-layers.ts)
  add column layers jsonb;

create table promo_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references promo_campaigns(id) on delete cascade,
  data bytea not null,
  mime text not null default 'image/webp',
  width integer not null,
  height integer not null,
  sha256 text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, sha256)
);
alter table promo_assets enable row level security;
