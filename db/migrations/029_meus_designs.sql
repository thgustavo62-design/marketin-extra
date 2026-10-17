-- Meus designs: artes livres (sem planilha) usando o mesmo editor, camadas, imagens e aprovação das promoções.
-- Um design é uma linha de promo_campaigns com kind = 'design', um formato fixo e N peças (design_pages), sem encartes.
-- Rollback: delete from promo_campaigns where kind = 'design'; alter table promo_campaigns drop column design_pages, drop column design_format, drop column kind;
alter table promo_campaigns
  add column kind text not null default 'promocao' check (kind in ('promocao', 'design')),
  add column design_format text check (design_format in ('story', 'feed', 'a4')),
  add column design_pages integer not null default 1 check (design_pages between 1 and 30);
alter table promo_campaigns add constraint promo_campaigns_design_chk check (kind = 'promocao' or design_format is not null);
create index promo_campaigns_kind_idx on promo_campaigns (kind, created_at desc);
