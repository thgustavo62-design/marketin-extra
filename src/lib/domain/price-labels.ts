export const PRICE_LABELS = [
  {
    id: "rounded",
    name: "Essencial",
    description: "Preço em uma caixa arredondada de alto contraste.",
  },
  {
    id: "solid",
    name: "Destaque",
    description: "Cor principal da campanha e valor em contraste.",
  },
  {
    id: "outline",
    name: "Contorno",
    description: "Fundo claro, borda forte e leitura limpa.",
  },
  {
    id: "ticket",
    name: "Cupom",
    description: "Recortes laterais inspirados em um cupom.",
  },
  {
    id: "flag",
    name: "Bandeira",
    description: "Faixa com ponta para destacar a oferta.",
  },
  {
    id: "slanted",
    name: "Faixa dinâmica",
    description: "Laterais diagonais com preço preservado na horizontal.",
  },
  {
    id: "gloss",
    name: "Brilho 3D",
    description: "Profundidade e reflexo discretos com preço editável.",
  },
  {
    id: "burst",
    name: "Explosão de ofertas",
    description: "Contorno de impacto para ações promocionais.",
  },
  {
    id: "shelf",
    name: "Gôndola",
    description: "Faixa lateral e fundo claro para ofertas de varejo.",
  },
  {
    id: "premium",
    name: "Black Premium",
    description: "Fundo escuro e borda em destaque para Black Friday.",
  },
] as const;
export type PriceLabelId = (typeof PRICE_LABELS)[number]["id"];
export const isPriceLabel = (id: unknown): id is PriceLabelId =>
  typeof id === "string" && PRICE_LABELS.some((l) => l.id === id);
export const recommendedPriceLabel = (model: string): PriceLabelId =>
  model === "black-friday"
    ? "premium"
    : model === "mercado-economia"
      ? "burst"
      : model === "atacado-inteligente"
        ? "shelf"
        : model === "beleza-natural"
          ? "outline"
          : model === "ofertas-impacto"
            ? "gloss"
            : "rounded";
