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
  normalizeItemStyle,
} from "../src/lib/domain/promo.ts";
import { offerEditVersion } from "../src/lib/domain/offer-editing.ts";
import { PRICE_LABELS, isPriceLabel } from "../src/lib/domain/price-labels.ts";
import { drawPharmacyOffer } from "../src/lib/promo/pharmacy-offer-render.ts";

test("Global models are generic, have unique identities and never carry private pharmacy assets", () => {
  assert.equal(new Set(PHARMACY_MODELS.map((m) => m.key)).size, 10);
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
    normalizeItemStyle,
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

test("Generic offers keep dynamic prices and proportional photos within their separate bands", () => {
  for (const label of PRICE_LABELS)
    for (const price of [0.99, 4.99, 29.99, 199.99, 1299.99]) {
      const texts: { text: string; x: number; y: number; width: number }[] = [],
        photos: number[][] = [];
      const ctx = {
        font: "",
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        closePath() {},
        fill() {},
        stroke() {},
        arc() {},
        fillRect() {},
        createLinearGradient() {
          return { addColorStop() {} };
        },
        measureText(value: string) {
          return {
            width:
              value.length *
              Number(this.font.match(/([\d.]+)px/)?.[1] ?? 12) *
              0.52,
          };
        },
        fillText(value: string, x: number, y: number) {
          texts.push({
            text: value,
            x,
            y,
            width: this.measureText(value).width,
          });
        },
        drawImage(_image: unknown, ...rect: number[]) {
          photos.push(rect);
        },
      };
      const r = { x: 20, y: 300, w: 450, h: 540 };
      drawPharmacyOffer(
        ctx as unknown as CanvasRenderingContext2D,
        r,
        {
          name: "PRODUTO COM APRESENTAÇÃO 200 ML",
          price,
          note: "Informação complementar",
          img: { width: 200, height: 400 } as HTMLImageElement,
        },
        {
          ...pharmacyModelTheme("farma-essencial", normalizeTheme({})),
          priceLabel: label.id,
        },
      );
      assert.ok(texts.some((t) => t.text === "R$"));
      assert.ok(
        texts.some((t) => t.text === Math.floor(price).toLocaleString("pt-BR")),
      );
      assert.ok(texts.some((t) => t.text === ",99"));
      const photo = photos[0];
      assert.equal(photo[2] / photo[3], 0.5);
      assert.ok(photo[1] + photo[3] < r.y + r.h * 0.54);
      for (const t of texts) {
        assert.ok(t.x >= r.x);
        assert.ok(t.x <= r.x + r.w);
        assert.ok(t.y >= r.y && t.y <= r.y + r.h);
      }
      for (const t of texts.filter((t) =>
        ["R$", ",99", Math.floor(price).toLocaleString("pt-BR")].includes(
          t.text,
        ),
      ))
        assert.ok(t.x + t.width <= r.x + r.w);
    }
});

test("Ten reusable price labels are validated independently from the company model", () => {
  assert.equal(PRICE_LABELS.length, 10);
  assert.equal(new Set(PRICE_LABELS.map((l) => l.id)).size, 10);
  for (const l of PRICE_LABELS)
    assert.equal(normalizeItemStyle({ priceLabel: l.id }).priceLabel, l.id);
  assert.equal(isPriceLabel("unknown"), false);
  assert.equal(
    normalizeItemStyle({ priceLabel: "unknown" }).priceLabel,
    undefined,
  );
});

test('Campaign seal version persists for new models while legacy snapshots remain unchanged', () => {
  const selected = pharmacyModelTheme('farma-essencial', normalizeTheme({}));
  assert.equal(selected.visual?.seal, 'retail-v2');
  assert.equal(normalizeTheme(JSON.parse(JSON.stringify(selected))).visual?.seal, 'retail-v2');
  const legacy = structuredClone(selected);
  delete legacy.visual!.seal;
  assert.equal(normalizeTheme(legacy).visual?.seal, undefined);
  assert.equal(normalizeTheme({visual:{style:'essential',eyebrow:'OFERTAS',seal:'invalid'}}).visual?.seal, undefined);
});
