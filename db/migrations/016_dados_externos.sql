-- Inteligência externa — dados públicos buscados de fontes abertas e guardados aqui para cruzar com os resultados.
-- Fontes: BrasilAPI (feriados), IBGE/SIDRA (IPCA), CMED/Anvisa (preços de medicamentos). Nenhuma exige chave; nenhuma é raspagem.
-- Rollback: drop table research_notes, external_imports, cmed_products, external_ipca, external_holidays, external_sources cascade;
--           alter table brands drop column icms_pct; alter table content_requests drop column offer_ean;

create table external_sources (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text not null,
  url text not null check (url ~ '^https://'),
  license_note text not null,
  frequency text not null,
  active boolean not null default true,
  last_run_at timestamptz,
  last_status text not null default 'never' check (last_status in ('never', 'ok', 'failed')),
  last_error text check (last_error is null or length(last_error) <= 300),
  last_records integer,
  last_version text
);

insert into external_sources (key, name, description, url, license_note, frequency) values
  ('feriados', 'Feriados nacionais', 'Feriados do ano atual e do próximo (BrasilAPI), usados no calendário de datas importantes.', 'https://brasilapi.com.br/docs#tag/Feriados-Nacionais', 'BrasilAPI: projeto aberto, dados públicos. Sem chave.', 'anual'),
  ('ipca', 'Inflação ao consumidor (IPCA)', 'IPCA mensal e acumulado em 12 meses: índice geral, Saúde e cuidados pessoais e Produtos farmacêuticos e óticos (IBGE/SIDRA, tabela 7060).', 'https://sidra.ibge.gov.br/tabela/7060', 'IBGE: dados públicos; citar a fonte. Sem chave.', 'mensal'),
  ('cmed', 'Lista de preços de medicamentos (CMED)', 'Preço Fábrica e Preço Máximo ao Consumidor (PMC) por apresentação, por alíquota de ICMS, com EAN, tarja e regime de preço (Anvisa/CMED).', 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos', 'Anvisa/CMED: lista oficial pública, publicada com atualização periódica. Sem chave.', 'mensal');

create table external_holidays (
  id uuid primary key default gen_random_uuid(),
  on_date date not null,
  name text not null check (length(name) <= 120),
  kind text not null default 'national',
  source text not null default 'brasilapi',
  fetched_at timestamptz not null default now(),
  unique (on_date, name)
);

create table external_ipca (
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category text not null check (category in ('geral', 'saude', 'farmaceuticos')),
  monthly_pct numeric(6, 2),
  accumulated_12m_pct numeric(6, 2),
  fetched_at timestamptz not null default now(),
  primary key (period, category)
);

-- Uma linha por apresentação da lista CMED (chave: código GGREM). `pmc` guarda o PMC por alíquota de ICMS, ex.: {"17": 49.66, "17.5": 49.97}.
create table cmed_products (
  ggrem text primary key,
  registro text,
  eans text[] not null default '{}',
  product text not null,
  substance text,
  lab text,
  presentation text,
  therapeutic_class text,
  product_type text,
  price_regime text,
  tarja text,
  pf_sem_impostos numeric(12, 2),
  pmc_sem_impostos numeric(12, 2),
  pmc jsonb not null default '{}'::jsonb,
  hospital_only boolean not null default false,
  published_on date,
  import_id uuid
);
create index cmed_products_eans_idx on cmed_products using gin (eans);
create index cmed_products_name_idx on cmed_products (lower(product));

create table external_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null references external_sources(key),
  status text not null check (status in ('ok', 'failed', 'skipped')),
  version text,
  records integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text check (error is null or length(error) <= 300),
  requested_by uuid references users(id) on delete set null
);
create index external_imports_idx on external_imports (source, started_at desc);

-- Alíquota de ICMS da loja: define qual coluna de PMC vale como teto. Sem ela, o sistema não afirma "acima do teto".
alter table brands add column icms_pct numeric(4, 1) check (icms_pct is null or icms_pct in (0, 12, 17, 17.5, 18, 19, 19.5, 20, 20.5, 21, 22, 22.5, 23));

-- Código de barras (EAN) do item da oferta: permite conferir o preço contra o teto da CMED.
alter table content_requests add column offer_ean text check (offer_ean is null or offer_ean ~ '^\d{8,14}$');

-- Pesquisas externas registradas à mão ou pelo assistente: cada nota leva fonte, data de acesso e nível de confiança.
create table research_notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('regra', 'sazonalidade', 'mercado', 'preco')),
  title text not null unique check (length(title) between 5 and 160),
  summary text not null check (length(summary) between 10 and 2000),
  source_name text not null check (length(source_name) between 2 and 160),
  source_url text not null check (source_url ~ '^https://' and length(source_url) <= 500),
  accessed_on date not null,
  confidence text not null check (confidence in ('alta', 'media', 'baixa')),
  tags text[] not null default '{}',
  brand_id uuid references brands(id),
  status text not null default 'ativa' check (status in ('ativa', 'arquivada')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index research_notes_idx on research_notes (status, kind);

alter table external_sources enable row level security;
alter table external_holidays enable row level security;
alter table external_ipca enable row level security;
alter table cmed_products enable row level security;
alter table external_imports enable row level security;
alter table research_notes enable row level security;
