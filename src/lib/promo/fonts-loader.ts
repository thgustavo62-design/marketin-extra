import { PROMO_FONTS } from "../domain/promo-fonts.ts";

let fontsReady: Promise<void> | null = null;
/** Carrega as fontes da peça (Baloo 2 para preços e títulos, Montserrat para nomes). */
export function loadPromoFonts(): Promise<void> {
  fontsReady ??= (async () => {
    try {
      const a = new FontFace("PromoDisplay", "url(/fonts/Baloo2.ttf)", {
        weight: "400 800",
      });
      const b = new FontFace("PromoText", "url(/fonts/Montserrat.ttf)", {
        weight: "100 900",
      });
      await Promise.all([a.load(), b.load()]);
      document.fonts.add(a);
      document.fonts.add(b);
    } catch {
      /* sem a fonte, usa a do sistema */
    }
  })();
  return fontsReady;
}

const fontLoads = new Map<string, Promise<void>>();
/** Carrega no navegador as fontes do catálogo pedidas (uma vez cada). Fonte que não carrega cai na reserva do sistema, sem travar a peça. */
export function loadFonts(ids: Iterable<string | undefined>): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const id of new Set(ids)) {
    const def = PROMO_FONTS.find((f) => f.id === id);
    if (!def || !def.family || id === "display" || id === "text") continue; // as duas de sempre vêm de loadPromoFonts
    if (!fontLoads.has(def.id)) {
      fontLoads.set(
        def.id,
        (async () => {
          try {
            const faces = def.faces.map(
              (x) =>
                new FontFace(def.family!, `url(${x.url})`, {
                  weight: x.weight,
                }),
            );
            await Promise.all(faces.map((x) => x.load()));
            for (const x of faces) document.fonts.add(x);
          } catch {
            /* sem a fonte, usa a reserva */
          }
        })(),
      );
    }
    jobs.push(fontLoads.get(def.id)!);
  }
  return Promise.all(jobs).then(() => undefined);
}
