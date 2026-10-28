import {
  applyOverrides,
  normalizeTheme,
  paginateSections,
  type PromoFormat,
} from "@/lib/domain/promo";
import type { StudioSource } from "@/lib/studio/store";
// No SVG renderer or image library is needed just to display the page navigation.
export function promotionPageCount(
  source: StudioSource,
  format: PromoFormat,
): number {
  if (source.campaign.kind !== "promocao") return source.campaign.design_pages;
  const cfg = applyOverrides(
      source.theme?.config ?? normalizeTheme({}),
      source.campaign.overrides,
    ),
    g = cfg.grid[format];
  return Math.max(
    1,
    paginateSections(source.items, g.cols * g.rows, cfg.breakBySection[format])
      .length,
  );
}
