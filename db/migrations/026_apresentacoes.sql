-- Apresentações (PPTX ou PDF) guardadas no sistema para apresentar em tela cheia.
-- O arquivo é enviado em partes de até 3,5 MB (limite de corpo da Vercel) e remontado no navegador.
-- Rollback: drop table presentation_chunks; drop table presentations;
create table presentations (
  id uuid primary key default gen_random_uuid(),
  -- null = vale para todas as filiais ("Geral")
  brand_id uuid references brands(id) on delete set null,
  title text not null,
  description text,
  file_name text not null,
  kind text not null check (kind in ('pptx', 'pdf')),
  size_bytes bigint not null check (size_bytes > 0),
  chunk_count integer not null check (chunk_count > 0),
  sha256 text,
  status text not null default 'uploading' check (status in ('uploading', 'ready')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index presentations_list_idx on presentations (created_at desc) where deleted_at is null;

create table presentation_chunks (
  presentation_id uuid not null references presentations(id) on delete cascade,
  idx integer not null check (idx >= 0),
  data bytea not null,
  primary key (presentation_id, idx)
);

alter table presentations enable row level security;
alter table presentation_chunks enable row level security;
