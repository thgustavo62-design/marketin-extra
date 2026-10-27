export const COMMERCIAL_FIELDS = [
  "commercialName",
  "brand",
  "line",
  "category",
  "type",
  "volume",
  "unit",
  "packaging",
  "quantity",
  "variation",
] as const;
export type CommercialAttributes = Partial<
  Record<(typeof COMMERCIAL_FIELDS)[number], string>
> & { validated?: boolean; validatedBy?: string; validatedAt?: string };
export function normalizeCommercial(raw: unknown): CommercialAttributes {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >,
    out: CommercialAttributes = {};
  for (const k of COMMERCIAL_FIELDS)
    if (typeof r[k] === "string")
      out[k] = (r[k] as string).trim().slice(0, 120);
  out.validated = r.validated === true;
  return out;
}
