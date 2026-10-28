import {
  normalizeOverrides,
  normalizeTheme,
  type PromoOverrides,
} from "./promo.ts";
import {
  isModelColor,
  pharmacyModel,
  pharmacyModelTheme,
  type ModelSnapshot,
} from "./pharmacy-models.ts";
import { isPriceLabel, type PriceLabelId } from "./price-labels.ts";

export type AppearanceSelection = {
  modelKey: string;
  primary: string;
  accent: string;
  priceLabel: PriceLabelId;
};

/** Concurrency token only. It never grants access to a campaign. */
export function appearanceEditVersion(overrides: PromoOverrides): string {
  return JSON.stringify(normalizeOverrides(overrides).model ?? null);
}

export function appearanceSelection(model: ModelSnapshot): AppearanceSelection {
  return {
    modelKey: model.key,
    primary: model.theme.colors.skyTop,
    accent: model.theme.colors.badge,
    priceLabel: model.theme.priceLabel ?? "rounded",
  };
}

/** Preserve the campaign's custom layout and footer when recoloring its model. */
export function updateModelAppearance(
  current: ModelSnapshot,
  selection: AppearanceSelection,
): ModelSnapshot {
  if (!pharmacyModel(selection.modelKey))
    throw Error("Escolha um modelo válido.");
  if (!isModelColor(selection.primary) || !isModelColor(selection.accent))
    throw Error("Confira as cores do modelo.");
  if (!isPriceLabel(selection.priceLabel))
    throw Error("Escolha uma etiqueta válida.");
  const generated = pharmacyModelTheme(
    selection.modelKey,
    normalizeTheme({}),
    selection,
  );
  let theme = generated;
  if (selection.modelKey === current.key) {
    theme = structuredClone(current.theme);
    if (selection.primary.toLowerCase() !== theme.colors.skyTop.toLowerCase()) {
      for (const key of [
        "skyTop",
        "badgeEdge",
        "tag",
        "tagText",
        "title",
        "footer",
        "footerText",
      ] as const)
        theme.colors[key] = generated.colors[key];
    }
    if (selection.accent.toLowerCase() !== theme.colors.badge.toLowerCase()) {
      theme.colors.badge = generated.colors.badge;
      theme.colors.badgeText = generated.colors.badgeText;
    }
  } else theme.footerLines = [...current.theme.footerLines];
  theme.priceLabel = selection.priceLabel;
  return { key: selection.modelKey, version: 1, theme };
}
