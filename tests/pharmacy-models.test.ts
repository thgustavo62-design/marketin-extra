import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHARMACY_MODELS,
  modelInk,
  pharmacyModel,
  pharmacyModelTheme,
} from "../src/lib/domain/pharmacy-models.ts";
import {
  applyOverrides,
  normalizeOverrides,
  normalizeTheme,
  paginateSections,
  PROMO_FORMAT_KEYS,
  parsePrice,
} from "../src/lib/domain/promo.ts";
import { offerEditVersion } from "../src/lib/domain/offer-editing.ts";

test("Global models are generic, have unique identities and never carry private pharmacy assets", () => {
  assert.equal(new Set(PHARMACY_MODELS.map((m) => m.key)).size, 6);
  assert.equal(pharmacyModel("../../minas-farma"), undefined);
  for (const model of PHARMACY_MODELS) {
    const cfg = pharmacyModelTheme(model.key, normalizeTheme({}));
    assert.equal(cfg.offerIdentity, undefined);
    assert.deepEqual(cfg.footerLines, []);
    assert.ok(
      !/minas|farma e farma|https?:|company_id|brand_id/i.test(
        JSON.stringify(cfg),
      ),
    );
    assert.equal(normalizeTheme(cfg).visual?.style, model.style);
  }
});
test("Model selection is a versioned snapshot and round-trips without changing the source theme", () => {
  const base = normalizeTheme({
    title: "IDENTIDADE PRIVADA",
    footerLines: ["Outra empresa"],
  });
  const before = structuredClone(base);
  const selected = pharmacyModelTheme("bebe-carinho", normalizeTheme({}), {
    primary: "#123456",
    accent: "#abcdef",
  });
  const raw = { model: { key: "bebe-carinho", version: 1, theme: selected } };
  const snapshot = normalizeOverrides(JSON.parse(JSON.stringify(raw)));
  const actual = applyOverrides(base, snapshot);
  assert.equal(actual.colors.skyTop, "#123456");
  assert.equal(actual.colors.badge, "#abcdef");
  assert.equal(actual.title, "PEQUENOS CUIDADOS");
  assert.deepEqual(base, before);
  assert.deepEqual(normalizeOverrides(snapshot), snapshot);
  selected.colors.skyTop = "#000000";
  assert.equal(actual.colors.skyTop, "#123456");
});
test("Unknown models, unsupported versions and malformed snapshots cannot become campaign identities", () => {
  for (const model of [
    { key: "unknown", version: 1, theme: {} },
    { key: "farma-essencial", version: 2, theme: {} },
    { key: "farma-essencial", version: 1, theme: [] },
  ])
    assert.deepEqual(normalizeOverrides({ model }), {});
  const cfg = pharmacyModelTheme("farma-essencial", normalizeTheme({}), {
    primary: "url(evil)",
    accent: "#123",
  });
  assert.equal(cfg.colors.skyTop, "#075E54");
  assert.equal(cfg.colors.badge, "#C9F275");
});
test("Global campaign grids retain every imported offer and preserve prices in all formats", () => {
  const prices = ["0,99", "4,99", "29,99", "199,99", "1.299,99"].map(
    parsePrice,
  );
  const offers = Array.from({ length: 31 }, (_, i) => ({
    id: i,
    section: i < 12 ? "Bebê" : "Cuidados",
    price: prices[i % prices.length],
  }));
  const before = structuredClone(offers);
  for (const m of PHARMACY_MODELS) {
    const theme = pharmacyModelTheme(m.key, normalizeTheme({}));
    for (const f of PROMO_FORMAT_KEYS) {
      const pages = paginateSections(
        offers,
        theme.grid[f].cols * theme.grid[f].rows,
        theme.breakBySection[f],
      );
      assert.deepEqual(
        pages.flat().map((p) => p.id),
        offers.map((p) => p.id),
      );
      assert.ok(
        pages.every((p) => p.length <= theme.grid[f].cols * theme.grid[f].rows),
      );
    }
  }
  assert.deepEqual(offers, before);
});
test("Existing themes keep their identity unless a global model is explicitly selected", () => {
  const official = normalizeTheme({
    title: "CORTA PREÇO",
    offerIdentity: { kind: "glossy-price" },
  });
  assert.equal(
    applyOverrides(official, normalizeOverrides({})).offerIdentity?.kind,
    "glossy-price",
  );
  assert.equal(applyOverrides(official, {}).title, "CORTA PREÇO");
});
test("Custom color foreground selection preserves readable contrast", () => {
  assert.equal(modelInk("#ffffff"), "#111827");
  assert.equal(modelInk("#000000"), "#FFFFFF");
  function luminance(hex: string) {
    const v = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
  }
  for (const color of [
    ...PHARMACY_MODELS.flatMap((m) => [m.primary, m.accent]),
    "#777777",
    "#808080",
    "#8e7fee",
  ]) {
    const a = luminance(color),
      b = luminance(modelInk(color));
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, color);
  }
});
test("Quick-edit concurrency token notices changes to price, description and selected photos", () => {
  const base = {
    name: "SABONETE 100G",
    price: 4.99,
    note: null,
    photo_image_id: null,
    photo_image_ids: [],
  };
  const token = offerEditVersion(base);
  assert.notEqual(offerEditVersion({ ...base, price: 5.99 }), token);
  assert.notEqual(offerEditVersion({ ...base, name: "SABONETE 200G" }), token);
  assert.notEqual(
    offerEditVersion({ ...base, photo_image_ids: ["foto"] }),
    token,
  );
  assert.equal(offerEditVersion({ ...base, note: "" }), token);
});
