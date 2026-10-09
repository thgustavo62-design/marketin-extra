-- Fase 2 — Biblioteca de mídias com versões, tags e vínculo a conteúdos.
-- Os bytes ficam em tabela à parte (media_blobs) para listas nunca carregarem arquivo.
-- Todo vínculo prende a mídia e o conteúdo à MESMA filial por chave composta (o banco impede mistura).

alter table posts add constraint posts_id_brand_key unique (id, brand_id);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  branch_id uuid,
  kind text not null check (kind in ('file', 'link')),
  title text not null check (length(title) between 1 and 160),
  original_name text,
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes between 1 and 4194304),
  checksum_sha256 text,
  external_url text check (external_url is null or external_url ~ '^https://'),
  storage_provider text not null default 'postgres' check (storage_provider in ('postgres', 'supabase', 'r2')),
  -- versões da mesma peça compartilham group_id (v1, v2, ...)
  group_id uuid not null default gen_random_uuid(),
  version_number integer not null default 1 check (version_number >= 1),
  is_final boolean not null default false,
  reusable_approved boolean not null default false,
  notes text check (notes is null or length(notes) <= 1000),
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint media_assets_branch_fk foreign key (branch_id, brand_id) references branches (id, brand_id),
  constraint media_assets_id_brand_key unique (id, brand_id),
  constraint media_assets_group_version_key unique (group_id, version_number),
  constraint media_assets_shape check (
    (kind = 'file' and mime_type is not null and size_bytes is not null and checksum_sha256 is not null)
    or (kind = 'link' and external_url is not null)
  )
);
create index media_assets_brand_idx on media_assets (brand_id, created_at desc) where deleted_at is null;
-- o mesmo arquivo não entra duas vezes na mesma filial
create unique index media_assets_checksum_idx on media_assets (brand_id, checksum_sha256) where checksum_sha256 is not null and deleted_at is null;

create table media_blobs (
  asset_id uuid primary key references media_assets(id) on delete cascade,
  data bytea not null
);

create table media_asset_tags (
  asset_id uuid not null references media_assets(id) on delete cascade,
  tag text not null check (length(tag) between 1 and 40),
  primary key (asset_id, tag)
);
create index media_asset_tags_tag_idx on media_asset_tags (tag);

create table content_asset_links (
  post_id uuid not null,
  asset_id uuid not null,
  brand_id uuid not null,
  role text not null default 'reference' check (role in ('reference', 'draft', 'final', 'thumbnail')),
  sort_order integer not null default 0,
  linked_by uuid references users(id) on delete set null,
  linked_at timestamptz not null default now(),
  primary key (post_id, asset_id),
  foreign key (post_id, brand_id) references posts (id, brand_id) on delete cascade,
  foreign key (asset_id, brand_id) references media_assets (id, brand_id)
);
create index content_asset_links_asset_idx on content_asset_links (asset_id);

alter table media_assets enable row level security;
alter table media_blobs enable row level security;
alter table media_asset_tags enable row level security;
alter table content_asset_links enable row level security;
