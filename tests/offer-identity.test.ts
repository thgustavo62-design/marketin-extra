import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dynamicPriceParts,
  fitPrice,
  normalizeOfferIdentity,
  safeRibbonText,
  DEFAULT_OFFER_IDENTITY,
} from "../src/lib/domain/offer-identity.ts";
import {
  normalizeTheme,
  normalizeItemStyle,
  DEFAULT_THEME,
} from "../src/lib/domain/promo.ts";
for (const price of [0.99, 4.99, 29.99, 199.99, 1299.99])
  test(`preço ${price}: partes independentes e ajuste à caixa`, () => {
    const p = dynamicPriceParts(price);
    assert.equal(p.cents, "99");
    const fit = fitPrice(100, 220, (t, s) => t.length * s * 0.75, price, 6);
    assert.ok(fit.width <= 220.0001);
    assert.ok(fit.size > 0);
    assert.equal(p.reais, Math.floor(price).toLocaleString("pt-BR"));
  });
test("não aprova preço negativo, infinito ou ausente", () => {
  for (const n of [-1, NaN, Infinity])
    assert.throws(() => dynamicPriceParts(n));
});
test("identidade ausente mantém o estilo das outras empresas", () => {
  assert.equal(normalizeTheme(DEFAULT_THEME).offerIdentity, undefined);
  assert.equal(normalizeItemStyle({ nameScale: 90 }).offerIdentity, undefined);
});
test("modelo e exceção preservam os ajustes gráficos válidos", () => {
  const c = normalizeOfferIdentity({
    ...DEFAULT_OFFER_IDENTITY,
    angle: -90,
    photoCount: 3,
    labelScale: 300,
  })!;
  assert.equal(c.angle, -8);
  assert.equal(c.photoCount, 2);
  assert.equal(c.labelScale, 110);
  assert.deepEqual(
    normalizeTheme({ ...DEFAULT_THEME, offerIdentity: c }).offerIdentity,
    c,
  );
  assert.deepEqual(normalizeItemStyle({ offerIdentity: c }).offerIdentity, c);
});
test("todas as fragrâncias exige confirmação explícita, nunca é inferido de fotos", () => {
  assert.equal(
    safeRibbonText("TODAS AS FRAGRÂNCIAS"),
    "FRAGRÂNCIAS SELECIONADAS",
  );
  assert.equal(
    safeRibbonText("TODAS AS FRAGRÂNCIAS", true),
    "TODAS AS FRAGRÂNCIAS",
  );
  assert.equal(safeRibbonText("TODAS AS CORES"), "CORES SELECIONADAS");
});
