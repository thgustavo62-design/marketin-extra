import { normalizeName } from "./catalog.ts";
import { groupItems, parseSize, type Variants } from "./promo-group.ts";
export type PriceSource = "approximate" | "promotion" | "sale";
export type GroupingRules = {
  fragrances: boolean;
  diapers: boolean;
  maxPhotos: 1 | 2;
  showVariants: boolean;
  genericEligibility: "review" | "compatible";
  missingPhotos: "review" | "block";
  priceSource: PriceSource;
  excludedTerms: string[];
};
export const DEFAULT_GROUPING_RULES: GroupingRules = {
  fragrances: true,
  diapers: false,
  maxPhotos: 2,
  showVariants: true,
  genericEligibility: "review",
  missingPhotos: "review",
  priceSource: "approximate",
  excludedTerms: [],
};
export function normalizeGroupingRules(raw: unknown): GroupingRules {
  const r = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<GroupingRules>;
  return {
    fragrances: r.fragrances !== false,
    diapers: r.diapers === true,
    maxPhotos: r.maxPhotos === 1 ? 1 : 2,
    showVariants: r.showVariants !== false,
    genericEligibility:
      r.genericEligibility === "compatible" ? "compatible" : "review",
    missingPhotos: r.missingPhotos === "block" ? "block" : "review",
    priceSource: ["approximate", "promotion", "sale"].includes(
      r.priceSource ?? "",
    )
      ? r.priceSource!
      : "approximate",
    excludedTerms: Array.isArray(r.excludedTerms)
      ? [
          ...new Set(
            r.excludedTerms
              .filter((x) => typeof x === "string")
              .map((x) => normalizeName(x).trim())
              .filter(Boolean),
          ),
        ].slice(0, 50)
      : [],
  };
}
export type ImportLine = {
  id: string;
  line: number;
  block: number;
  section: string;
  ean: string;
  name: string;
  reference: string;
  price: number;
  prices: {
    approximate: number | null;
    promotion: number | null;
    sale: number | null;
  };
  stock: number | null;
  cost: number | null;
  original: Record<string, string | number | null>;
};
export type CatalogSku = {
  attributes?: import("./product-commercial.ts").CommercialAttributes;
  id: string;
  ean: string;
  name: string;
  photos: { id: string; sha: string }[];
};
export type ReviewMember = {
  ean: string;
  name: string;
  variant: string;
  productId: string | null;
  photos: { id: string; sha: string }[];
  imported: boolean;
};
export type ReviewGroup = {
  id: string;
  lineIds: string[];
  section: string;
  title: string;
  price: number;
  members: ReviewMember[];
  candidates: ReviewMember[];
  photoIds: string[];
  variants: Variants | null;
  status: "confirmed" | "review" | "individual";
  confidence: number;
  reasons: string[];
  note: string;
  approved: boolean;
  signature: string;
};
const plain = (s: string) => normalizeName(s).replace(/\s+/g, " ").trim();
const quantity = (s: string) => {
  const raw = s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/(\d),(\d)/g, "$1.$2");
  const q = [
    ...raw.matchAll(
      /\b(\d+(?:\.\d+)?)\s*(MCG|MG|ML|KG|GRS?|G|LTS?|L|UI|CPR|CAPS?|UN(?:D|ID)?)\b/g,
    ),
  ].map(
    (m) =>
      `${Number(m[1])}${({ GR: "G", GRS: "G", LT: "L", LTS: "L", CAPS: "CAP", UND: "UN", UNID: "UN" } as Record<string, string>)[m[2]] ?? m[2]}`,
  );
  return [...q, ...(plain(s).match(/\bC\d+\b/g) ?? [])].sort().join("|");
};
const identity = (s: string) => {
  const t = plain(s).split(" "),
    count =
      t[0] === "LAVA" && t[1] === "ROUPAS"
        ? 3
        : t.slice(0, 3).join(" ") === "SABAO EM PO"
          ? 4
          : 2;
  return t.slice(0, count).join(" ");
};

const critical = (s: string) =>
  (
    plain(s).match(
      /\bFPS\s*\d+\b|\b\d+\s*FPS\b|\b(?:KIT|SH|COND|AEROSOL|ROLL ON|CREME|GEL|SPRAY|CAP|CPR|SUSP|XPE)\b/g,
    ) ?? []
  )
    .sort()
    .join("|");
const medicine = (s: string, section: string) =>
  /MEDICAMENTO|\bOTC\b/.test(plain(section)) ||
  /\b\d+(?:[.,]\d+)?(?:MG|MCG|UI)\b|\b(?:CPR|CAP|SUSP|XPE)\b/.test(plain(s));
export function commerciallyCompatible(
  a: string,
  b: string,
  section = "",
): boolean {
  if (
    medicine(a, section) ||
    medicine(b, section) ||
    /\bKIT\b/.test(plain(a) + " " + plain(b))
  )
    return false;
  return (
    quantity(a) !== "" &&
    quantity(a) === quantity(b) &&
    critical(a) === critical(b) &&
    identity(a) === identity(b)
  );
}
export function familyMatch(
  base: string,
  candidate: string,
  section = "",
): boolean {
  const a = plain(base),
    b = plain(candidate),
    anchor = a.match(/^.*?\b\d+(?:ML|G|KG|L)\b/)?.[0] ?? a;
  return (
    a !== b &&
    anchor.split(" ").length >= 3 &&
    commerciallyCompatible(base, candidate, section) &&
    b.startsWith(anchor + " ")
  );
}
const generic = (s: string) =>
  /FRAG(?:R)?ANCIAS?|TODAS?(?: AS)? (?:CORES|VARIACOES)|VARIAS OPCOES/.test(
    plain(s),
  );
const variationOf = (base: string, name: string) => {
  const b = plain(base),
    n = plain(name),
    anchor = b.match(/^.*?\b\d+(?:ML|G|KG|L)\b/)?.[0] ?? b;
  return n.startsWith(anchor + " ") ? n.slice(anchor.length).trim() : "";
};
const member = (
  ean: string,
  name: string,
  variant: string,
  catalog: Map<string, CatalogSku>,
  imported: boolean,
): ReviewMember => ({
  ean,
  name,
  variant:
    catalog.get(ean)?.attributes?.validated &&
    catalog.get(ean)?.attributes?.variation
      ? catalog.get(ean)!.attributes!.variation!
      : variant,
  productId: catalog.get(ean)?.id ?? null,
  photos: catalog.get(ean)?.photos ?? [],
  imported,
});
export function chooseDistinctPhotos(
  members: ReviewMember[],
  max = 2,
): string[] {
  const seen = new Set<string>(),
    ids: string[] = [];
  for (const m of members) {
    const p = m.photos.find((p) => !seen.has(p.sha));
    if (p) {
      seen.add(p.sha);
      ids.push(p.id);
    }
    if (ids.length === max) break;
  }
  return ids;
}
export function groupSignature(
  members: ReviewMember[],
  section: string,
): string {
  return JSON.stringify([
    plain(section),
    members
      .map((m) => [m.ean, plain(m.name)])
      .sort((a, b) => a[0].localeCompare(b[0])),
  ]);
}
export function buildReview(
  lines: ImportLine[],
  skus: CatalogSku[],
  rules: GroupingRules,
): ReviewGroup[] {
  const catalog = new Map(skus.map((s) => [s.ean, s]));
  const groups: ReviewGroup[] = [],
    used = new Set<string>();
  // Reuse existing size and option inference, then enforce commercial and eligibility guards.
  const suggestions = groupItems(
    lines.map((r) => ({
      ean: r.ean,
      name: r.name,
      price: r.price,
      section: `${r.section}#${r.block}`,
    })),
    rules.fragrances || rules.diapers,
  );
  for (const s of suggestions) {
    const rows = lines.filter((r) => s.eans.includes(r.ean)),
      first = rows[0];
    if (!first) continue;
    let canGroup =
      rows.length > 1 &&
      (s.variants?.kind === "sizes" ? rules.diapers : rules.fragrances);
    if (s.variants?.kind === "sizes")
      canGroup =
        canGroup &&
        rows.every(
          (r) => parseSize(r.name)?.base === parseSize(first.name)?.base,
        );
    else
      canGroup =
        canGroup &&
        rows.every((r) =>
          commerciallyCompatible(first.name, r.name, first.section),
        );
    if (rows.length > 1) {
      const attrs = rows
        .map((r) => catalog.get(r.ean)?.attributes)
        .filter((a) => a?.validated);
      for (const field of [
        "brand",
        "line",
        "type",
        "volume",
        "unit",
        "packaging",
        "quantity",
      ] as const) {
        const values = new Set(
          attrs
            .map((a) => a?.[field])
            .filter(Boolean)
            .map((v) => plain(v!)),
        );
        if (values.size > 1) canGroup = false;
      }
    }
    if (
      rows.some((r) =>
        rules.excludedTerms.some((t) =>
          plain(`${r.name} ${r.section}`).includes(t),
        ),
      )
    )
      canGroup = false;
    const partitions = canGroup ? [rows] : rows.map((r) => [r]);
    for (const rs of partitions) {
      const f = rs[0];
      if (used.has(f.id)) continue;
      rs.forEach((r) => used.add(r.id));
      const isGroup = rs.length > 1;
      const vars = isGroup ? s.variants : null;
      if (vars) vars.show = rules.showVariants;
      const members = rs.map((r) =>
        member(
          r.ean,
          r.name,
          vars?.kind === "options"
            ? (vars.members.find((m) => m.ean === r.ean)?.variant ?? "")
            : "",
          catalog,
          true,
        ),
      );
      let title = isGroup ? s.name.replace(/ - VÁRIAS OPÇÕES$/, "") : f.name;
      const ref = rs
        .map((r) => r.reference)
        .filter(Boolean)
        .join(" · ");
      const hasReference = !!ref;
      const candidates =
        !isGroup && hasReference
          ? skus
              .filter(
                (k) =>
                  !members.some((m) => m.ean === k.ean) &&
                  familyMatch(f.name, k.name, f.section),
              )
              .slice(0, 60)
              .map((k) =>
                member(
                  k.ean,
                  k.name,
                  variationOf(f.name, k.name),
                  catalog,
                  false,
                ),
              )
          : [];
      if (rules.genericEligibility === "compatible" && generic(ref))
        members.push(...candidates);
      const photos = chooseDistinctPhotos(members, rules.maxPhotos);
      const reasons: string[] = [];
      if (isGroup)
        reasons.push(
          "Mesmo preço e apresentação; conferir linha comercial e variações.",
        );
      if (hasReference)
        reasons.push(
          "Referência da planilha: " +
            ref +
            ". Confirme os SKUs participantes.",
        );
      if (!photos.length)
        reasons.push("Nenhuma foto exata vinculada aos produtos confirmados.");
      if (rs.some((r) => !catalog.has(r.ean)))
        reasons.push(
          "Há produto fora do catálogo; descrição e preço originais preservados.",
        );
      groups.push({
        id: f.id,
        lineIds: rs.map((r) => r.id),
        section: f.section,
        title,
        price: f.price,
        members,
        candidates,
        photoIds: photos,
        variants: vars,
        status:
          isGroup || hasReference || !photos.length ? "review" : "individual",
        confidence: isGroup ? 90 : hasReference ? 50 : 100,
        reasons,
        note: hasReference
          ? generic(ref)
            ? "Fragrâncias selecionadas"
            : `Variações informadas: ${ref}`
          : "",
        approved: false,
        signature: groupSignature(members, f.section),
      });
    }
  }
  return groups;
}
export function validateReviewedGroup(
  group: ReviewGroup,
  rules: GroupingRules,
): string | null {
  if (!group.title.trim() || group.title.length > 160)
    return "Informe um título de até 160 caracteres.";
  if (!Number.isFinite(group.price) || group.price < 0 || group.price >= 100000)
    return "Preço inválido.";
  if (group.status === "review" && !group.approved)
    return "Aprove ou desagrupe as sugestões antes de gerar.";
  if (!group.photoIds.length && rules.missingPhotos === "block")
    return "Esta regra exige fotos em todas as ofertas.";
  if (group.photoIds.length > rules.maxPhotos)
    return "Quantidade de fotos acima da regra.";
  if (
    group.photoIds.some(
      (id) => !group.members.some((m) => m.photos.some((p) => p.id === id)),
    )
  )
    return "Foto não pertence a um SKU confirmado nesta oferta.";
  if (group.members.some((m) => !m.imported) && !group.approved)
    return "Confirme a elegibilidade dos SKUs externos à planilha.";
  return null;
}
