-- Kit de marca por filial: cores, fontes aprovadas e textos prontos (logos ficam na biblioteca de imagens, ligados à filial).
-- Rollback: alter table promo_library drop column brand_id; drop table brand_kits;
create table brand_kits (
  brand_id uuid primary key references brands(id) on delete cascade,
  colors jsonb not null default '[]',
  fonts jsonb not null default '[]',
  texts jsonb not null default '[]',
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table brand_kits enable row level security;
alter table promo_library add column brand_id uuid references brands(id) on delete set null;
create index promo_library_brand_idx on promo_library (brand_id) where brand_id is not null;
