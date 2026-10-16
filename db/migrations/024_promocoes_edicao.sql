-- Edição fina dos encartes (como o console do Criax): preço original ("De R$"), estilo por encarte e textos da promoção.
-- Rollback: alter table promo_items drop column old_price, drop column style; alter table promo_campaigns drop column overrides;
alter table promo_items
  add column old_price numeric(10, 2) check (old_price is null or (old_price >= 0 and old_price < 100000)),
  -- estilo do encarte: { tag, tagColor, badgeColor, priceColor, nameColor, nameAlign, nameScale } (ver src/lib/domain/promo.ts: normalizeItemStyle)
  add column style jsonb;
alter table promo_campaigns
  -- textos da promoção que valem no lugar dos do tema: { tagText, showTag, footerLines, extraText }
  add column overrides jsonb;
