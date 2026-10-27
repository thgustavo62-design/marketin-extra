import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  parseReviewSheets,
  parseReviewWorkbook,
} from "../src/lib/promo/review-xlsx.ts";
import {
  buildReview,
  commerciallyCompatible,
  chooseDistinctPhotos,
  DEFAULT_GROUPING_RULES,
  normalizeGroupingRules,
  validateReviewedGroup,
  groupSignature,
  type ImportLine,
  type CatalogSku,
} from "../src/lib/domain/promotion-review.ts";
const line = (
  ean: string,
  name: string,
  price = 22.99,
  reference = "",
): ImportLine => ({
  id: ean,
  line: 2,
  block: 0,
  section: "LIMPEZA",
  ean,
  name,
  reference,
  price,
  prices: { approximate: price, promotion: 25, sale: 30 },
  cost: 10,
  stock: 3,
  original: {},
});
const comfort = [
  line("7891150045484", "AMACIANTE COMFORT CONCENTRADO 1L BRISA ELEGANTE"),
  line("7891150045491", "AMACIANTE COMFORT CONCENTRADO 1L FRESCOR INTENSO"),
  line("7891150045507", "AMACIANTE COMFORT CONCENTRADO 1L PURO CUIDADO"),
];
const skus: CatalogSku[] = comfort.map((r, i) => ({
  id: "sku" + i,
  ean: r.ean,
  name: r.name,
  photos: [{ id: "photo" + i, sha: "hash" + i }],
}));
test("importa colunas reordenadas, VALRO, referências sem cabeçalho e preserva preços", () => {
  const p = parseReviewSheets([
    {
      name: "A",
      cells: [
        [
          "REFERENCIAS",
          "Preço de Promoção",
          "Descrição",
          "EAN",
          "VALRO APROXIMADO",
          "Preço de Venda",
        ],
        ["FRAGANCIAS", 27.5, "COMFORT 1L", "7891150045484", "22,99", 34.38],
        [],
      ],
    },
  ]);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].price, 22.99);
  assert.equal(p.rows[0].reference, "FRAGANCIAS");
  assert.equal(p.rows[0].prices.promotion, 27.5);
  const n = parseReviewSheets([
    {
      name: "B",
      cells: [
        ["Barras", "Descrição", "", "Valor Aproximado"],
        ["7891150045484", "SAB DOVE 90G", "FRAGANCIAS", "3,99"],
      ],
    },
  ]);
  assert.equal(n.rows[0].reference, "FRAGANCIAS");
});
test("campo escolhido não confunde preço de promoção com aproximado", () => {
  const s = [
    {
      name: "A",
      cells: [
        ["EAN", "Descrição", "Valor Aproximado", "Preço de Promoção"],
        ["7891150045484", "Produto", 22.99, 27.5],
      ],
    },
  ];
  assert.equal(parseReviewSheets(s, "promotion").rows[0].price, 27.5);
  assert.equal(parseReviewSheets(s, "sale").rows.length, 0);
});
test("separadores e títulos de categorias não são erros; duplicata divergente é sinalizada", () => {
  const p = parseReviewSheets([
    {
      name: "A",
      cells: [
        ["EAN", "Descrição", "Valor"],
        [],
        [null, "SABONETES"],
        ["7891150045484", "Produto", 3.99],
        ["7891150045484", "Produto", 4.99],
      ],
    },
  ]);
  assert.equal(p.rows.length, 1);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0].message, /divergente/);
  assert.equal(p.rows[0].block, 2);
});
test("XLS e XLSX reais preservam GTIN com zero à esquerda", () => {
  for (const bookType of ["xls", "xlsx"] as const) {
    const w = XLSX.utils.book_new(),
      s = XLSX.utils.aoa_to_sheet([
        ["EAN", "Descrição", "Valor Aproximado"],
        ["04006381333931", "PRODUTO TESTE", "4,99"],
      ]);
    XLSX.utils.book_append_sheet(w, s, "A");
    const bytes = XLSX.write(w, { bookType, type: "buffer" });
    const p = parseReviewWorkbook(bytes);
    assert.equal(p.rows[0].ean, "04006381333931");
  }
});
test("agrupamento conserva todos os SKUs, propõe duas fotografias e exige aprovação", () => {
  const g = buildReview(comfort, skus, DEFAULT_GROUPING_RULES);
  assert.equal(g.length, 1);
  assert.equal(g[0].members.length, 3);
  assert.equal(g[0].photoIds.length, 2);
  assert.match(g[0].title, /COMFORT CONCENTRADO 1L$/);
  assert.match(validateReviewedGroup(g[0], DEFAULT_GROUPING_RULES)!, /Aprove/);
  assert.equal(
    validateReviewedGroup({ ...g[0], approved: true }, DEFAULT_GROUPING_RULES),
    null,
  );
});
test("não duplica fotografia por hash nem usa foto de SKU não confirmado", () => {
  const g = buildReview(comfort, skus, DEFAULT_GROUPING_RULES)[0];
  assert.equal(
    chooseDistinctPhotos(
      g.members.map((m) => ({ ...m, photos: [{ id: m.ean, sha: "same" }] })),
    ).length,
    1,
  );
  assert.match(
    validateReviewedGroup(
      { ...g, approved: true, photoIds: ["outside"] },
      DEFAULT_GROUPING_RULES,
    )!,
    /SKU confirmado/,
  );
});
test("preços distintos e blocos distintos permanecem separados", () => {
  assert.equal(
    buildReview(
      [comfort[0], { ...comfort[1], price: 23.99 }],
      [],
      DEFAULT_GROUPING_RULES,
    ).length,
    2,
  );
  assert.equal(
    buildReview(
      [comfort[0], { ...comfort[1], block: 1 }],
      [],
      DEFAULT_GROUPING_RULES,
    ).length,
    2,
  );
});
test("barreiras comerciais impedem tipos, marcas, volumes, kits, FPS e dosagens incompatíveis", () => {
  for (const [a, b] of [
    ["SH HASKELL 1L MANDIOCA", "COND HASKELL 1L MANDIOCA"],
    ["LAVA ROUPAS OMO 3L LAVANDA", "LAVA ROUPAS BRILHANTE 3L LAVANDA"],
    ["AMACIANTE COMFORT 1.6KG LAVANDA", "AMACIANTE COMFORT 2.6KG LAVANDA"],
    ["NEUTROGENA SUNFRESH FPS50 40ML", "NEUTROGENA SUNFRESH FPS70 40ML"],
    ["KIT EUDORA SH 250ML COND 125ML", "KIT EUDORA SH 250ML COND 125ML"],
    ["LOSARTANA 50MG 30CPR", "LOSARTANA 100MG 30CPR"],
  ])
    assert.equal(commerciallyCompatible(a, b), false, `${a} <> ${b}`);
});
test("referência FRAGANCIAS só sugere, não inclui catálogo na oferta", () => {
  const base = line("source", "SAB DOVE 90G", 3.99, "FRAGANCIAS"),
    catalog = [
      {
        id: "1",
        ean: "one",
        name: "SAB DOVE 90G ORIGINAL",
        photos: [{ id: "p1", sha: "s1" }],
      },
      {
        id: "2",
        ean: "two",
        name: "SAB DOVE 90G LAVANDA",
        photos: [{ id: "p2", sha: "s2" }],
      },
      { id: "3", ean: "three", name: "SAB DOVE 100G LAVANDA", photos: [] },
    ];
  const g = buildReview([base], catalog, DEFAULT_GROUPING_RULES)[0];
  assert.equal(g.members.length, 1);
  assert.equal(g.candidates.length, 2);
  assert.equal(g.photoIds.length, 0);
  assert.equal(g.note, "Fragrâncias selecionadas");
  assert.equal(g.status, "review");
});
test("referência explícita é metadado, sem inventar elegibilidade", () => {
  const g = buildReview(
    [
      line(
        "source",
        "SH HASKELL 1L CAVALO FORTE",
        20,
        "CAVALO FORTE, MANDIOCA E MURUMURU",
      ),
    ],
    [],
    DEFAULT_GROUPING_RULES,
  );
  assert.equal(g.length, 1);
  assert.equal(g[0].members.length, 1);
  assert.match(g[0].note, /CAVALO FORTE/);
  assert.equal(g[0].approved, false);
});
test("regra de catálogo compatível ainda exige confirmação, regra sem fotos pode bloquear", () => {
  const base = line("source", "SAB DOVE 90G", 3.99, "FRAGANCIAS"),
    g = buildReview(
      [base],
      [{ id: "1", ean: "one", name: "SAB DOVE 90G ORIGINAL", photos: [] }],
      { ...DEFAULT_GROUPING_RULES, genericEligibility: "compatible" },
    )[0];
  assert.equal(g.members.length, 2);
  assert.equal(g.approved, false);
  assert.match(
    validateReviewedGroup(
      { ...g, approved: true },
      { ...DEFAULT_GROUPING_RULES, missingPhotos: "block" },
    )!,
    /exige fotos/,
  );
});
test("memória identifica exatamente SKUs, descrições e categoria, sem fixar preço antigo", () => {
  const g = buildReview(comfort, skus, DEFAULT_GROUPING_RULES)[0];
  assert.equal(
    g.signature,
    groupSignature([...g.members].reverse(), g.section),
  );
  assert.notEqual(g.signature, groupSignature(g.members.slice(1), g.section));
  assert.notEqual(g.signature, groupSignature(g.members, "OUTRA"));
  assert.equal(
    normalizeGroupingRules({ maxPhotos: 9, diapers: false }).maxPhotos,
    2,
  );
});
test("dimensões de feed quadrado preservam grade e áreas seguras", async () => {
  const { normalizeOverrides, applyOverrides, normalizeTheme, pageLayout } =
    await import("../src/lib/domain/promo.ts");
  const o = normalizeOverrides({
      dimensions: { feed: { w: 1080, h: 1080 } },
      grid: { feed: { cols: 2, rows: 1 } },
    }),
    theme = applyOverrides(normalizeTheme({}), o),
    layout = pageLayout("feed", theme.grid.feed, true, 200, 80, {
      dimensions: theme.dimensions?.feed,
      count: 2,
    });
  assert.equal(layout.height, 1080);
  assert.equal(layout.cells.length, 2);
  assert.ok(layout.cells.every((c) => c.y + c.h <= 1000));
  assert.equal(
    normalizeOverrides({ dimensions: { feed: { w: 1, h: -1 } } }).dimensions,
    undefined,
  );
});
test("atributos comerciais confirmados impedem juntar linhas comerciais diferentes", () => {
  const catalog = skus.map((s, i) => ({
    ...s,
    attributes: {
      validated: true,
      brand: "COMFORT",
      line: i ? "OUTRA LINHA" : "CONCENTRADO",
    },
  }));
  const g = buildReview(comfort, catalog, DEFAULT_GROUPING_RULES);
  assert.equal(g.length, 3);
});
