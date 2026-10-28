import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appearanceEditVersion,
  appearanceSelection,
  updateModelAppearance,
} from "../src/lib/domain/campaign-appearance.ts";
import { normalizeTheme } from "../src/lib/domain/promo.ts";
import {
  pharmacyModelTheme,
  type ModelSnapshot,
} from "../src/lib/domain/pharmacy-models.ts";

function fixture(): ModelSnapshot {
  const theme = pharmacyModelTheme("farma-essencial", normalizeTheme({}));
  theme.footerLines = ["Empresa real", "Contato da empresa"];
  theme.grid.feed = { cols: 3, rows: 2 };
  theme.colors.name = "#223344";
  theme.title = "Título personalizado";
  return { key: "farma-essencial", version: 1, theme };
}

test("Changing a campaign label preserves its custom composition and private footer", () => {
  const before = fixture();
  const next = updateModelAppearance(before, {
    ...appearanceSelection(before),
    priceLabel: "premium",
  });
  assert.deepEqual(next.theme, { ...before.theme, priceLabel: "premium" });
  assert.notEqual(
    appearanceEditVersion({ model: before }),
    appearanceEditVersion({ model: next }),
  );
});

test("Recoloring preserves layout, names and a custom title without mutating the original", () => {
  const before = fixture(),
    original = structuredClone(before);
  const next = updateModelAppearance(before, {
    ...appearanceSelection(before),
    primary: "#123456",
    accent: "#ABCDEF",
  });
  assert.equal(next.theme.colors.skyTop, "#123456");
  assert.equal(next.theme.colors.badge, "#ABCDEF");
  assert.equal(next.theme.colors.name, before.theme.colors.name);
  assert.deepEqual(next.theme.grid, before.theme.grid);
  assert.equal(next.theme.title, before.theme.title);
  assert.deepEqual(next.theme.footerLines, before.theme.footerLines);
  assert.deepEqual(before, original);
});

test("Switching a global composition retains company footer without inheriting the old layout", () => {
  const before = fixture();
  const next = updateModelAppearance(before, {
    modelKey: "black-friday",
    primary: "#111214",
    accent: "#F3CD75",
    priceLabel: "premium",
  });
  assert.equal(next.key, "black-friday");
  assert.equal(next.theme.visual?.style, "black");
  assert.equal(next.theme.title, "BLACK FRIDAY");
  assert.deepEqual(next.theme.grid.feed, { cols: 2, rows: 2 });
  assert.deepEqual(next.theme.footerLines, before.theme.footerLines);
});

test("Appearance tokens are stable through a JSONB key-order round trip and detect custom-theme edits", () => {
  const before = fixture();
  const reversed = JSON.parse(
    JSON.stringify(before, (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ),
  );
  assert.equal(
    appearanceEditVersion({ model: before }),
    appearanceEditVersion({ model: reversed }),
  );
  reversed.theme.title = "Mudou em outra aba";
  assert.notEqual(
    appearanceEditVersion({ model: before }),
    appearanceEditVersion({ model: reversed }),
  );
  assert.ok(appearanceEditVersion({ model: before }).length < 16000);
});

test("Invalid model, label and CSS values cannot enter a saved appearance", () => {
  const before = fixture();
  for (const invalid of [
    { modelKey: "private-company-model" },
    { primary: "url(https://evil.example)" },
    { accent: "red" },
    { priceLabel: "unsupported" },
  ])
    assert.throws(() =>
      updateModelAppearance(before, {
        ...appearanceSelection(before),
        ...invalid,
      } as Parameters<typeof updateModelAppearance>[1]),
    );
});
