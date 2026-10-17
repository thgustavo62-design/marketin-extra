-- Miniatura da primeira peça (gerada no editor) e modelos de design.
-- Modelo = cópia congelada de um design (kind = 'template') com nome e categoria; criar um design a partir dele copia peças, elementos e imagens.
-- Rollback: delete from promo_campaigns where kind = 'template'; alter table promo_campaigns drop column template_category, drop column thumb_at, drop column thumb; (e recriar o check de kind sem 'template')
alter table promo_campaigns
  add column thumb bytea,
  add column thumb_at timestamptz,
  add column template_category text check (template_category in ('promocao', 'institucional', 'bebe', 'limpeza', 'cupom', 'outro'));
alter table promo_campaigns drop constraint promo_campaigns_kind_check;
alter table promo_campaigns add constraint promo_campaigns_kind_check check (kind in ('promocao', 'design', 'template'));
alter table promo_campaigns drop constraint promo_campaigns_design_chk;
alter table promo_campaigns add constraint promo_campaigns_design_chk check (kind = 'promocao' or design_format is not null);
alter table promo_campaigns add constraint promo_campaigns_template_chk check (kind <> 'template' or template_category is not null);
