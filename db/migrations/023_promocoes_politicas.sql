-- Política de encartes: variações (tamanho/fragrância) reunidas num encarte só, resumo da importação e aprovação dos encartes.
-- Rollback: alter table promo_items drop column variants; alter table promo_campaigns drop column status, drop column approved_by, drop column approved_at, drop column import_report, drop column group_variants;
alter table promo_items add column variants jsonb;
alter table promo_campaigns
  add column status text not null default 'rascunho' check (status in ('rascunho', 'aprovada')),
  add column approved_by uuid references users(id) on delete set null,
  add column approved_at timestamptz,
  add column import_report jsonb,
  add column group_variants boolean not null default true;
