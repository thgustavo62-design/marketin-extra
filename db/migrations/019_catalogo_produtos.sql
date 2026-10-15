-- Catálogo de produtos da rede (um só, sem separar por filial) com banco de imagens.
-- Rollback: drop table post_products, product_images, products;

create table products (
  id uuid primary key default gen_random_uuid(),
  -- código de barras (GTIN 8/12/13/14); pode faltar em produto manipulado/avulso
  ean text check (ean is null or ean ~ '^\d{8,14}$'),
  erp_code text,
  -- como está no ERP da rede; é por ela que as imagens são casadas
  description text not null check (length(description) between 2 and 300),
  -- outras descrições do mesmo produto (uma loja escreve diferente da outra); também entram no casamento e na busca
  aliases text[] not null default '{}',
  -- descrição normalizada (sem acento, maiúscula, unidades unificadas) para casar com nome de arquivo
  name_key text not null,
  -- texto de busca: descrição + EAN + laboratório + princípio ativo, sem acento e em minúsculas
  search text not null,
  group_name text,
  active_ingredient text,
  manufacturer text,
  registro_ms text,
  tarja text,
  source text not null default 'erp' check (source in ('erp', 'manual')),
  active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_ean_idx on products(ean) where ean is not null;
-- sem EAN, a descrição normalizada identifica o produto
create unique index products_name_noean_idx on products(name_key) where ean is null;
create index products_name_key_idx on products(name_key);
create index products_group_idx on products(group_name);
alter table products enable row level security;

create table product_images (
  id uuid primary key default gen_random_uuid(),
  -- null = imagem enviada que ainda não foi ligada a um produto (fica na fila de conferência)
  product_id uuid references products(id) on delete cascade,
  is_primary boolean not null default false,
  data bytea not null,
  thumb bytea not null,
  mime text not null default 'image/webp',
  width integer not null,
  height integer not null,
  size_bytes integer not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  source text not null check (source in ('proprio', 'upload', 'open_beauty_facts', 'open_food_facts', 'open_products_facts', 'open_pet_food_facts')),
  -- imagens abertas exigem atribuição e licença (CC BY-SA); as próprias não
  license text,
  attribution text,
  source_url text,
  original_name text,
  -- como foi ligada: exata, similar (conferida por pessoa) ou manual
  match_method text check (match_method is null or match_method in ('exata', 'similar', 'manual', 'ean')),
  match_score numeric(4, 3),
  -- sugestões de produto para a fila de conferência: [{ id, description, score }]
  suggestions jsonb not null default '[]'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- a mesma imagem não entra duas vezes no mesmo produto (nem duas vezes na fila)
create unique index product_images_sha_idx on product_images(coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid), sha256);
create unique index product_images_primary_idx on product_images(product_id) where is_primary;
create index product_images_product_idx on product_images(product_id);
create index product_images_pending_idx on product_images(created_at) where product_id is null;
alter table product_images enable row level security;

-- produtos usados em cada conteúdo (para achar a imagem certa na hora de produzir)
create table post_products (
  post_id uuid not null references posts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  added_by uuid references users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (post_id, product_id)
);
create index post_products_product_idx on post_products(product_id);
alter table post_products enable row level security;
