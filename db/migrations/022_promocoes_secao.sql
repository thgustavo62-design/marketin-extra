-- Aba (seção) da planilha de origem de cada produto da promoção: permite uma peça por aba (fralda, leite, perfumaria...).
-- Rollback: alter table promo_items drop column section;
alter table promo_items add column section text;
