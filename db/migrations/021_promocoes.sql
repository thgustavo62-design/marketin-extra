-- Promoções montadas a partir de uma planilha (código de barras + preço): campanhas, itens e temas (artes) para feed, story e A4.
-- Rollback: drop table promo_items, promo_campaigns, promo_theme_assets, promo_themes;

-- Tema = a "cara" da promoção: artes (fundo, cabeçalho, rodapé) por formato e cores/textos.
create table promo_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 2 and 80),
  -- cores, textos e opções (ver src/lib/domain/promo.ts: ThemeConfig)
  config jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table promo_themes enable row level security;

create table promo_theme_assets (
  theme_id uuid not null references promo_themes(id) on delete cascade,
  role text not null check (role in ('background', 'header', 'footer', 'badge', 'tag')),
  format text not null check (format in ('story', 'feed', 'a4')),
  data bytea not null,
  mime text not null,
  width integer not null,
  height integer not null,
  sha256 text not null,
  updated_at timestamptz not null default now(),
  primary key (theme_id, role, format)
);
alter table promo_theme_assets enable row level security;

create table promo_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  theme_id uuid references promo_themes(id) on delete set null,
  -- título e validade impressos na arte (quando o tema não traz o título na imagem)
  title text,
  validity text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table promo_campaigns enable row level security;
create index promo_campaigns_created_idx on promo_campaigns(created_at desc);

create table promo_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references promo_campaigns(id) on delete cascade,
  position integer not null,
  ean text,
  product_id uuid references products(id) on delete set null,
  -- nome impresso na arte (começa igual à descrição do ERP; pode ser editado)
  name text not null check (length(name) between 1 and 160),
  price numeric(10, 2) not null check (price >= 0 and price < 100000),
  -- foto escolhida (se vazia, usa a principal do produto)
  photo_image_id uuid references product_images(id) on delete set null,
  note text,
  unique (campaign_id, position)
);
alter table promo_items enable row level security;
create index promo_items_campaign_idx on promo_items(campaign_id);
