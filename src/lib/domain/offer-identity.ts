/** Configuração gráfica reutilizável. A associação da identidade é feita no banco por empresa. */
export type OfferIdentity = {
  kind: "glossy-price";
  version: 1;
  labelScale: number;
  angle: number;
  priceScale: number;
  centsGap: number;
  labelX: number;
  labelY: number;
  descriptionScale: number;
  photoCount: number;
  ribbonText: string;
  ribbonEnabled: boolean;
};
export const DEFAULT_OFFER_IDENTITY: OfferIdentity = {
  kind: "glossy-price",
  version: 1,
  labelScale: 100,
  angle: -4,
  priceScale: 100,
  centsGap: 3,
  labelX: 0,
  labelY: 0,
  descriptionScale: 100,
  photoCount: 2,
  ribbonText: "FRAGRÂNCIAS SELECIONADAS",
  ribbonEnabled: false,
};
export function normalizeOfferIdentity(
  raw: unknown,
): OfferIdentity | undefined {
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as Record<string, unknown>).kind !== "glossy-price"
  )
    return undefined;
  const r = raw as Record<string, unknown>,
    d = DEFAULT_OFFER_IDENTITY,
    o = { ...d };
  const bounds = {
    labelScale: [70, 110],
    angle: [-8, 8],
    priceScale: [60, 110],
    centsGap: [0, 12],
    labelX: [-5, 5],
    labelY: [-3, 3],
    descriptionScale: [65, 130],
    photoCount: [1, 2],
  } as const;
  for (const k of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const n = Number(r[k]);
    if (Number.isFinite(n) && r[k] !== undefined)
      o[k] = Math.max(bounds[k][0], Math.min(bounds[k][1], n));
  }
  o.photoCount = Math.round(o.photoCount);
  o.ribbonEnabled = r.ribbonEnabled === true;
  if (typeof r.ribbonText === "string")
    o.ribbonText = r.ribbonText.trim().toLocaleUpperCase("pt-BR").slice(0, 80);
  return o;
}
/** A totalidade nunca é inferida de nome ou da quantidade de fotos. */
export function safeRibbonText(text: string, allVariantsConfirmed = false) {
  const t = text.trim().toLocaleUpperCase("pt-BR");
  return !allVariantsConfirmed && /\bTOD[AO]S?\b/.test(t)
    ? t
        .replace(/TODAS AS FRAGRÂNCIAS/g, "FRAGRÂNCIAS SELECIONADAS")
        .replace(/TODAS AS CORES/g, "CORES SELECIONADAS")
        .replace(/TODOS OS TAMANHOS/g, "TAMANHOS SELECIONADOS")
        .replace(/\bTOD[AO]S?\b/g, "SELECIONADOS")
    : t;
}
export function dynamicPriceParts(price: number) {
  if (!Number.isFinite(price) || price < 0 || price > 9999999.99)
    throw Error("Preço inválido para a etiqueta.");
  const cents = Math.round((price + Number.EPSILON) * 100);
  return {
    currency: "R$",
    reais: Math.floor(cents / 100).toLocaleString("pt-BR"),
    separator: ",",
    cents: String(cents % 100).padStart(2, "0"),
  };
}
export function fitPrice(
  size: number,
  maxWidth: number,
  measure: (text: string, size: number) => number,
  price: number,
  gap: number,
) {
  const p = dynamicPriceParts(price);
  const width = (n: number) =>
    measure(p.currency, n * 0.25) +
    n * 0.08 +
    measure(p.reais, n) +
    gap +
    measure(p.separator, n * 0.4) +
    measure(p.cents, n * 0.4);
  const natural = width(size);
  const scale = Math.min(1, maxWidth / natural);
  return {
    ...p,
    size: size * scale,
    width: width(size * scale) - gap + gap * scale,
    gap: gap * scale,
  };
}
