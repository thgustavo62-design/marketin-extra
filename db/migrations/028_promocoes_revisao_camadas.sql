-- Controle otimista dos elementos livres: duas abas (ou duas pessoas) não sobrescrevem uma à outra em silêncio.
-- Rollback: alter table promo_campaigns drop column layers_rev;
alter table promo_campaigns add column layers_rev integer not null default 0;
