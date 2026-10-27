import type { PromoFormat } from "./promo.ts";
import type { StudioScene } from "./studio.ts";
export type DesignPreset = {
  id: string;
  name: string;
  description: string;
  category: "social" | "print" | "display";
  format: PromoFormat;
  width: number;
  height: number;
  pages: number;
  size: string;
  visual:
    | "portrait"
    | "square"
    | "story"
    | "carousel"
    | "landscape"
    | "paper"
    | "label";
};
export const DESIGN_PRESETS: readonly DesignPreset[] = [
  {
    id: "post",
    name: "Post para redes sociais",
    description: "Uma arte vertical para sua próxima publicação.",
    category: "social",
    format: "feed",
    width: 1080,
    height: 1350,
    pages: 1,
    size: "1080 × 1350 px · 4:5",
    visual: "portrait",
  },
  {
    id: "square",
    name: "Post quadrado",
    description: "Comunicados, produtos e campanhas em um formato versátil.",
    category: "social",
    format: "feed",
    width: 1080,
    height: 1080,
    pages: 1,
    size: "1080 × 1080 px · 1:1",
    visual: "square",
  },
  {
    id: "story",
    name: "Story / Status",
    description: "Conteúdo vertical para Instagram e WhatsApp.",
    category: "social",
    format: "story",
    width: 1080,
    height: 1920,
    pages: 1,
    size: "1080 × 1920 px · 9:16",
    visual: "story",
  },
  {
    id: "carousel",
    name: "Carrossel",
    description: "Comece com cinco páginas e conte sua história.",
    category: "social",
    format: "feed",
    width: 1080,
    height: 1350,
    pages: 5,
    size: "5 páginas · 1080 × 1350 px",
    visual: "carousel",
  },
  {
    id: "a4",
    name: "Cartaz A4",
    description: "Comunicação de balcão, vitrine e materiais impressos.",
    category: "print",
    format: "a4",
    width: 2480,
    height: 3508,
    pages: 1,
    size: "21 × 29,7 cm · 300 dpi",
    visual: "paper",
  },
  {
    id: "a3",
    name: "Cartaz A3",
    description: "Mais espaço para sua campanha aparecer.",
    category: "print",
    format: "a4",
    width: 3508,
    height: 4961,
    pages: 1,
    size: "29,7 × 42 cm · 300 dpi",
    visual: "paper",
  },
  {
    id: "label",
    name: "Etiqueta de preço",
    description: "Uma peça horizontal para prateleiras e expositores.",
    category: "print",
    format: "a4",
    width: 1417,
    height: 709,
    pages: 1,
    size: "12 × 6 cm · 300 dpi",
    visual: "label",
  },
  {
    id: "tv",
    name: "TV / Telão",
    description: "Campanhas, serviços e avisos em telas horizontais.",
    category: "display",
    format: "story",
    width: 1920,
    height: 1080,
    pages: 1,
    size: "1920 × 1080 px · 16:9",
    visual: "landscape",
  },
  {
    id: "banner",
    name: "Banner horizontal",
    description: "Destaques para o site e campanhas digitais.",
    category: "display",
    format: "feed",
    width: 1920,
    height: 640,
    pages: 1,
    size: "1920 × 640 px · 3:1",
    visual: "landscape",
  },
];
export function designPreset(id: unknown) {
  return DESIGN_PRESETS.find((p) => p.id === id) ?? null;
}
export function blankDesignScene(width: number, height: number): StudioScene {
  return {
    version: "5.3.0",
    objects: [
      {
        type: "rect",
        name: "clip",
        left: 0,
        top: 0,
        width,
        height,
        fill: "#ffffff",
        selectable: false,
        evented: false,
        hasControls: false,
        strokeWidth: 0,
      },
    ],
  };
}

/** New print presets use 300 dpi. Preserve the historical 1414×2000 A4 document size. */
export function designPrintPoints(width: number, height: number) {
  return width === 1414 && height === 2000
    ? { width: (210 * 72) / 25.4, height: (297 * 72) / 25.4 }
    : { width: (width * 72) / 300, height: (height * 72) / 300 };
}
