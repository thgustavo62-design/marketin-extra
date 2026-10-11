-- Central de Inteligência — registro de decisões sobre os achados.
-- Rollback: drop table insight_decisions;

-- Uma decisão por filial e achado. `fingerprint` guarda a "assinatura" da análise no momento da decisão:
-- se a análise mudar depois, a tela avisa que a decisão foi tomada sobre dados diferentes.
create table insight_decisions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  insight_key text not null check (insight_key ~ '^[a-z0-9_:-]{3,80}$'),
  status text not null check (status in ('aceita', 'dispensada', 'concluida')),
  note text check (note is null or length(note) <= 500),
  fingerprint text not null check (length(fingerprint) <= 64),
  decided_by uuid references users(id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (brand_id, insight_key)
);

alter table insight_decisions enable row level security;
