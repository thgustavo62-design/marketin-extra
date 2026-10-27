import type { PromoFormat, GridSpec } from "./promo.ts";
export const PROMO_LAYOUTS = [
  {
    id: "theme",
    name: "Layout do tema",
    hint: "Mantém a grade definida na arte",
    count: 0,
  },
  {
    id: "one",
    name: "1 produto",
    hint: "Uma oferta em destaque por página",
    count: 1,
  },
  { id: "two", name: "2 produtos", hint: "Duas ofertas por página", count: 2 },
  { id: "four", name: "4 produtos", hint: "Grade 2 × 2 por página", count: 4 },
  {
    id: "six",
    name: "6 produtos",
    hint: "Grade para campanhas com mais ofertas",
    count: 6,
  },
] as const;
export function promoLayout(id: string) {
  return PROMO_LAYOUTS.find((l) => l.id === id) ?? null;
}
export function promoLayoutGrid(
  id: string,
): Partial<Record<PromoFormat, GridSpec>> {
  if (id === "one")
    return {
      story: { cols: 1, rows: 1 },
      feed: { cols: 1, rows: 1 },
      a4: { cols: 1, rows: 1 },
    };
  if (id === "two")
    return {
      story: { cols: 1, rows: 2 },
      feed: { cols: 2, rows: 1 },
      a4: { cols: 1, rows: 2 },
    };
  if (id === "four")
    return {
      story: { cols: 2, rows: 2 },
      feed: { cols: 2, rows: 2 },
      a4: { cols: 2, rows: 2 },
    };
  if (id === "six")
    return {
      story: { cols: 2, rows: 3 },
      feed: { cols: 3, rows: 2 },
      a4: { cols: 2, rows: 3 },
    };
  return {};
}
