import { test } from "node:test";
import assert from "node:assert/strict";
import {
  promoLayout,
  promoLayoutGrid,
} from "../src/lib/domain/promo-layouts.ts";
import {
  applyOverrides,
  normalizeOverrides,
  normalizeTheme,
  paginateSections,
} from "../src/lib/domain/promo.ts";
test("Promotion layouts only allow known presets", () => {
  assert.equal(promoLayout("missing"), null);
  assert.equal(promoLayout("four")?.count, 4);
  assert.deepEqual(promoLayoutGrid("theme"), {});
});
test("Each product layout has the declared capacity in all formats", () => {
  for (const [id, n] of [
    ["one", 1],
    ["four", 4],
    ["six", 6],
  ] as const) {
    const grid = promoLayoutGrid(id);
    for (const f of ["story", "feed", "a4"] as const)
      assert.equal(grid[f]!.cols * grid[f]!.rows, n);
  }
});
test("Campaign grid overrides never mutate the shared theme", () => {
  const theme = normalizeTheme({}),
    before = structuredClone(theme),
    o = normalizeOverrides({ grid: promoLayoutGrid("four") }),
    cfg = applyOverrides(theme, o);
  assert.equal(cfg.grid.story.cols * cfg.grid.story.rows, 4);
  assert.deepEqual(theme, before);
  assert.notEqual(cfg.grid, theme.grid);
});
test("Grid normalization rejects invalid dimensions and unknown format keys", () => {
  assert.deepEqual(
    normalizeOverrides({
      grid: {
        story: { cols: 100, rows: 100 },
        feed: { cols: 1.5, rows: 2 },
        evil: { cols: 1, rows: 1 },
      },
    }),
    {},
  );
  assert.deepEqual(
    normalizeOverrides({ grid: { a4: { cols: 2, rows: 3 } } }).grid,
    { a4: { cols: 2, rows: 3 } },
  );
});
test("Page counts honor campaign layout and include every product", () => {
  const cfg = applyOverrides(
      normalizeTheme({}),
      normalizeOverrides({ grid: promoLayoutGrid("four") }),
    ),
    items = Array.from({ length: 7 }, (_, i) => ({
      section: "Ofertas",
      name: String(i),
    })),
    pages = paginateSections(
      items,
      cfg.grid.feed.cols * cfg.grid.feed.rows,
      false,
    );
  assert.equal(pages.length, 2);
  assert.equal(pages.flat().length, 7);
});
