import type { ThemeConfig } from "./promo.ts";
import { recommendedPriceLabel } from "./price-labels.ts";

/** Original, public platform definitions. Never include customer assets or data here. */
export const PHARMACY_MODELS = [
  {
    key: "farma-essencial",
    name: "Farma Essencial",
    category: "ofertas",
    label: "Ofertas",
    title: "OFERTAS DA SEMANA",
    eyebrow: "CUIDADO QUE CABE NO SEU DIA",
    description: "Verde profundo, cartões claros e preços em destaque.",
    primary: "#075E54",
    accent: "#C9F275",
    surface: "#EAF4EE",
    style: "essential",
  },
  {
    key: "bebe-carinho",
    name: "Bebê & Carinho",
    category: "bebe",
    label: "Bebê",
    title: "PEQUENOS CUIDADOS",
    eyebrow: "BEBÊ & FAMÍLIA",
    description: "Tons suaves e formas arredondadas para o universo infantil.",
    primary: "#6554A4",
    accent: "#FFD4A9",
    surface: "#F4EDFC",
    style: "baby",
  },
  {
    key: "beleza-natural",
    name: "Beleza Natural",
    category: "beleza",
    label: "Beleza",
    title: "SUA ROTINA DE BELEZA",
    eyebrow: "BELEZA & AUTOCUIDADO",
    description: "Composição elegante para perfumaria e dermocosméticos.",
    primary: "#8C3855",
    accent: "#F3D7B0",
    surface: "#FCF0ED",
    style: "beauty",
  },
  {
    key: "cuidado-diario",
    name: "Cuidado Diário",
    category: "higiene",
    label: "Higiene",
    title: "CUIDADO TODO DIA",
    eyebrow: "HIGIENE & LIMPEZA",
    description: "Azul, linhas leves e uma grade fácil de conferir.",
    primary: "#075A79",
    accent: "#A4F0E0",
    surface: "#E9F7FA",
    style: "daily",
  },
  {
    key: "energia-equilibrio",
    name: "Energia & Equilíbrio",
    category: "bem-estar",
    label: "Bem-estar",
    title: "SUA ROTINA EM DIA",
    eyebrow: "BEM-ESTAR & SUPLEMENTOS",
    description: "Fundo escuro e detalhes vivos para destacar sua seleção.",
    primary: "#142E43",
    accent: "#D4F45A",
    surface: "#EAF0F1",
    style: "energy",
  },
  {
    key: "ofertas-impacto",
    name: "Ofertas de Impacto",
    category: "ofertas",
    label: "Ofertas",
    title: "OFERTAS EM DESTAQUE",
    eyebrow: "ESCOLHA. COMPARE. APROVEITE.",
    description: "Vermelho e amarelo com hierarquia forte de produto e preço.",
    primary: "#A61B32",
    accent: "#FFE067",
    surface: "#FFF2D8",
    style: "impact",
    artwork: "corta-preco-v1",
  },
  {
    key: "mercado-economia",
    name: "Mercado da Economia",
    category: "mercado",
    label: "Supermercado",
    title: "ECONOMIA NO CARRINHO",
    eyebrow: "OFERTAS PARA SUA DESPENSA",
    description: "Vermelho e creme para alimentos e ofertas da semana.",
    primary: "#9E2333",
    accent: "#FFE177",
    surface: "#FFF5E6",
    style: "market",
  },
  {
    key: "hortifruti-fresco",
    name: "Hortifruti Fresco",
    category: "hortifruti",
    label: "Hortifruti",
    title: "FRESCOR NA SUA MESA",
    eyebrow: "HORTIFRUTI DA SEMANA",
    description: "Verde e laranja para frutas, verduras e produtos frescos.",
    primary: "#245537",
    accent: "#FFCC80",
    surface: "#EEF5E7",
    style: "fresh",
  },
  {
    key: "atacado-inteligente",
    name: "Atacado Inteligente",
    category: "mercado",
    label: "Supermercado",
    title: "MAIS ECONOMIA TODO DIA",
    eyebrow: "SUA SELEÇÃO DE OFERTAS",
    description:
      "Azul e amarelo com composição prática para ofertas em volume.",
    primary: "#173C78",
    accent: "#FFE16B",
    surface: "#EEF2FA",
    style: "wholesale",
  },
  {
    key: "black-friday",
    name: "Black Friday",
    category: "sazonal",
    label: "Black Friday",
    title: "BLACK FRIDAY",
    eyebrow: "OFERTAS EM DESTAQUE",
    description:
      "Preto e dourado para campanhas sazonais de farmácias e supermercados.",
    primary: "#111214",
    accent: "#F3CD75",
    surface: "#EDEAE4",
    style: "black",
  },
] as const;
export const modelSegment = (key: string) =>
  ["mercado-economia", "hortifruti-fresco", "atacado-inteligente"].includes(key)
    ? "Supermercados"
    : ["black-friday", "ofertas-impacto"].includes(key)
      ? "Ambos"
      : "Farmácias";
export type PharmacyModel = (typeof PHARMACY_MODELS)[number];
export type CampaignVisual = { style: PharmacyModel["style"]; eyebrow: string; artwork?: "corta-preco-v1" };
export type ModelSnapshot = { key: string; version: 1; theme: ThemeConfig };
export const pharmacyModel = (key: unknown): PharmacyModel | undefined =>
  typeof key === "string"
    ? PHARMACY_MODELS.find((m) => m.key === key)
    : undefined;
export const isModelColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);

/** WCAG relative luminance chooses the more readable of these two foregrounds. */
export function modelInk(color: string): string {
  if (!isModelColor(color)) return "#111827";
  const rgb = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const darkContrast = (luminance + 0.05) / (0.0091892193 + 0.05);
  const whiteContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= whiteContrast && darkContrast >= 4.5
    ? "#111827"
    : whiteContrast >= 4.5
      ? "#FFFFFF"
      : "#000000";
}

export function pharmacyModelTheme(
  key: string,
  base: ThemeConfig,
  colors: { primary?: string; accent?: string } = {},
): ThemeConfig {
  const m = pharmacyModel(key);
  if (!m) throw Error("Modelo global inválido.");
  const primary = isModelColor(colors.primary) ? colors.primary : m.primary;
  const accent = isModelColor(colors.accent) ? colors.accent : m.accent;
  return {
    ...structuredClone(base),
    priceLabel: recommendedPriceLabel(key),
    offerIdentity: undefined,
    visual: { style: m.style, eyebrow: m.eyebrow, ...("artwork" in m ? { artwork: m.artwork } : {}) },
    colors: {
      skyTop: primary,
      skyBottom: m.surface,
      panel: "#FFFFFF",
      badge: accent,
      badgeEdge: primary,
      badgeText: modelInk(accent),
      name: "#111827",
      tag: primary,
      tagText: modelInk(primary),
      title: modelInk(primary),
      footer: primary,
      footerText: modelInk(primary),
    },
    title: m.title,
    tagText: "OFERTA",
    showTag: true,
    stack: false,
    clouds: false,
    footerLines: [],
    panel: { story: false, feed: false, a4: false },
    panelMargin: { story: 4, feed: 4, a4: 4 },
    panelTuck: false,
    cards: { story: "#FFFFFF", feed: "#FFFFFF", a4: "#FFFFFF" },
    cardGap: 2,
    grid: {
      story: { cols: 2, rows: 3 },
      feed: { cols: 2, rows: 2 },
      a4: { cols: 3, rows: 4 },
    },
    gridArea: { story: null, feed: null, a4: null },
    breakBySection: { story: true, feed: true, a4: false },
  };
}

export function normalizeCampaignVisual(
  raw: unknown,
): CampaignVisual | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  if (!PHARMACY_MODELS.some((m) => m.style === v.style)) return undefined;
  return {
    style: v.style as CampaignVisual["style"],
    ...(v.artwork === "corta-preco-v1" ? {artwork: "corta-preco-v1" as const} : {}),
    eyebrow: typeof v.eyebrow === "string" ? v.eyebrow.trim().slice(0, 60) : "",
  };
}
