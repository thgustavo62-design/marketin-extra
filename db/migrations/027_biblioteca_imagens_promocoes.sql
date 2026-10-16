-- Biblioteca de imagens das promoções: ícones, logos, selos, fundos e fotos para usar nas criações (valem para todas as promoções).
-- Ao usar numa promoção, a imagem é copiada para promo_assets (excluir da biblioteca não quebra peças já feitas).
-- Rollback: drop table promo_library;
create table promo_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'outro' check (category in ('icone', 'logo', 'selo', 'fundo', 'foto', 'outro')),
  data bytea not null,
  mime text not null default 'image/webp',
  width integer not null,
  height integer not null,
  sha256 text not null unique,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index promo_library_category_idx on promo_library (category, created_at desc);
alter table promo_library enable row level security;
