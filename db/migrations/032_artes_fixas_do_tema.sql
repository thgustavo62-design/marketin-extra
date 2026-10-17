-- Artes fixas do tema: fundos, bonecos, logos e selos que aparecem num lugar definido de TODA promoção que usa o tema
-- (por formato; todas as peças, só a primeira, só a última ou todas menos a primeira; por cima ou por baixo dos produtos).
-- A posição de cada arte fica em promo_themes.fixed (mesmo formato dos elementos livres); as imagens ficam em promo_theme_arts.
-- Rollback: alter table promo_themes drop column fixed; drop table promo_theme_arts;
create table promo_theme_arts (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references promo_themes(id) on delete cascade,
  name text not null,
  kind text not null default 'outro' check (kind in ('fundo', 'boneco', 'logo', 'selo', 'outro')),
  data bytea not null,
  mime text not null default 'image/webp',
  width integer not null,
  height integer not null,
  sha256 text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (theme_id, sha256)
);
alter table promo_theme_arts enable row level security;
alter table promo_themes add column fixed jsonb;
