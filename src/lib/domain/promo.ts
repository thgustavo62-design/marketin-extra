import {
  normalizeOfferIdentity,
  type OfferIdentity,
} from "./offer-identity.ts";
// Promoções montadas a partir de planilha: leitura de preço, colunas, tema e posição dos produtos em cada formato. Tudo puro e testado.
import { parseEan } from "./catalog.ts";
import { isPriceLabel, type PriceLabelId } from "./price-labels.ts";
import {
  normalizeCampaignVisual,
  pharmacyModel,
  type CampaignVisual,
  type ModelSnapshot,
} from "./pharmacy-models.ts";

export type PromoFormat = "story" | "feed" | "a4";
export const PROMO_FORMATS: Record<
  PromoFormat,
  { label: string; w: number; h: number; hint: string }
> = {
  story: { label: "Story / Status", w: 1080, h: 1920, hint: "1080 × 1920 px" },
  feed: {
    label: "Feed (Instagram/Facebook)",
    w: 1080,
    h: 1350,
    hint: "1080 × 1350 px",
  },
  a4: {
    label: "Cartaz / Flyer A4",
    w: 1414,
    h: 2000,
    hint: "A4 (21 × 29,7 cm)",
  },
};
export const PROMO_FORMAT_KEYS = Object.keys(PROMO_FORMATS) as PromoFormat[];

// ---------- preço ----------
/** Aceita número da planilha, "12,99", "12.99", "R$ 1.234,56". Devolve null se não for um preço válido (>= 0 e < 100 mil). */
export function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number")
    return Number.isFinite(raw) && raw >= 0 && raw < 100000
      ? Math.round(raw * 100) / 100
      : null;
  let s = String(raw).replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!/^[\d.,]+$/.test(s)) return null;
  if (s.includes(","))
    s = s.replace(/\./g, "").replace(",", "."); // 1.234,56 → 1234.56
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.234 ou 1.234.567: ponto de milhar
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 100000
    ? Math.round(n * 100) / 100
    : null;
}

/** 59.9 → { reais: "59", centavos: "90" } (a arte mostra R$ 59,90 com os centavos menores). */
export function priceParts(price: number): { reais: string; centavos: string } {
  const cents = Math.round(price * 100);
  return {
    reais: String(Math.floor(cents / 100)),
    centavos: String(cents % 100).padStart(2, "0"),
  };
}

// ---------- planilha ----------
export type PromoColumns = {
  ean: number | null;
  price: number | null;
  name: number | null;
};
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Acha as colunas pelo cabeçalho: código de barras, o preço ("Valor aproximado" tem prioridade; depois preço promocional/oferta, depois preço de venda) e, se houver, o nome. */
export function detectPromoColumns(header: unknown[]): PromoColumns {
  const h = header.map(norm);
  const find = (re: RegExp) => {
    const i = h.findIndex((x) => re.test(x));
    return i < 0 ? null : i;
  };
  const ean = find(
    /^(barras|ean|gtin|cod(igo)? de barras|codigo barras|cod barras)$/,
  );
  const price =
    find(/aprox/) ??
    find(/(promo|oferta)/) ??
    find(/preco (de )?venda|valor (de )?venda/) ??
    find(/^(preco|valor)$/) ??
    find(/(preco|valor)/);
  const name = find(
    /^(descricao|produto|nome( do produto)?|descricao do produto)$/,
  );
  return { ean, price, name };
}

export type PromoRow = {
  ean: string;
  price: number;
  name: string | null;
  /** aba da planilha de onde veio */ section: string | null;
};
export type PromoParse = {
  rows: PromoRow[];
  errors: { line: number; message: string }[];
};

/** Transforma as linhas da planilha em itens. Código de barras inválido, preço inválido e repetição viram aviso (a primeira ocorrência vale). */
export function parsePromoRows(
  cells: unknown[][],
  cols: PromoColumns,
  firstDataLine = 2,
  opts: { seen?: Set<string>; section?: string | null } = {},
): PromoParse {
  const rows: PromoRow[] = [],
    errors: PromoParse["errors"] = [];
  const seen = opts.seen ?? new Set<string>(); // compartilhado entre as abas: o mesmo código em duas abas vale só a primeira vez
  cells.forEach((r, k) => {
    const line = firstDataLine + k;
    if (
      r.every((c) => c === null || c === undefined || String(c).trim() === "")
    )
      return;
    const ean = cols.ean != null ? parseEan(r[cols.ean]) : null;
    if (!ean) {
      errors.push({ line, message: "Código de barras inválido ou vazio." });
      return;
    }
    const price = cols.price != null ? parsePrice(r[cols.price]) : null;
    if (price === null) {
      errors.push({ line, message: `Preço inválido para o código ${ean}.` });
      return;
    }
    if (seen.has(ean)) {
      errors.push({
        line,
        message: `Código ${ean} repetido: vale a primeira linha.`,
      });
      return;
    }
    seen.add(ean);
    const name =
      cols.name != null
        ? String(r[cols.name] ?? "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 160) || null
        : null;
    rows.push({ ean, price, name, section: opts.section ?? null });
  });
  return { rows, errors };
}

// ---------- tema ----------
export type GridSpec = { cols: number; rows: number };
export type GridArea = { top: number; bottom: number };
export type ThemeConfig = {
  referencePackage?: "minas-corta-20261028";
  priceLabel?: PriceLabelId;
  visual?: CampaignVisual;
  offerIdentity?: OfferIdentity;
  dimensions?: Partial<Record<PromoFormat, { w: number; h: number }>>;
  colors: {
    skyTop: string;
    skyBottom: string;
    panel: string;
    badge: string;
    badgeEdge: string;
    badgeText: string;
    name: string;
    tag: string;
    tagText: string;
    title: string;
    footer: string;
    footerText: string;
  };
  title: string;
  tagText: string;
  showTag: boolean;
  /** duas unidades sobrepostas atrás da foto, como nas peças da rede */
  stack: boolean;
  /** círculos claros (nuvens) no fundo padrão; desligue em fundos escuros */
  clouds: boolean;
  footerLines: string[];
  grid: Record<PromoFormat, GridSpec>;
  panel: Record<PromoFormat, boolean>;
  /** margem lateral do painel branco, em % da largura (0 = painel de ponta a ponta, sem cantos arredondados) */
  panelMargin: Record<PromoFormat, number>;
  /** o painel branco começa por baixo do cabeçalho (a arte do cabeçalho fica por cima do painel, como nas peças da rede) */
  panelTuck: boolean;
  /** cor do cartão de cada produto (null = sem cartão); com cartão, o painel único normalmente fica desligado */
  cards: Record<PromoFormat, string | null>;
  /** espaço entre os cartões, em % da largura */
  cardGap: number;
  /** onde ficam os produtos, em pixels da peça (do topo e até o fim); vazio = entre o cabeçalho e o rodapé */
  gridArea: Record<PromoFormat, GridArea | null>;
  /** cada aba da planilha começa uma peça nova (como nas peças da rede: uma peça de leite, outra de perfumaria...) */
  breakBySection: Record<PromoFormat, boolean>;
};

export const DEFAULT_THEME: ThemeConfig = {
  colors: {
    skyTop: "#2e9be6",
    skyBottom: "#7cc8f5",
    panel: "#fbf5fb",
    badge: "#1747b8",
    badgeEdge: "#0b1f5c",
    badgeText: "#ffffff",
    name: "#111111",
    tag: "#e3171d",
    tagText: "#ffffff",
    title: "#ffd21f",
    footer: "#0f3fa8",
    footerText: "#ffffff",
  },
  title: "OFERTAS",
  tagText: "Uaau!",
  showTag: true,
  stack: true,
  clouds: true,
  footerLines: [],
  grid: {
    story: { cols: 2, rows: 3 },
    feed: { cols: 3, rows: 2 },
    a4: { cols: 4, rows: 4 },
  },
  panel: { story: true, feed: true, a4: false },
  panelMargin: { story: 4.5, feed: 4.5, a4: 2 },
  panelTuck: false,
  cards: { story: null, feed: null, a4: null },
  cardGap: 1.2,
  gridArea: { story: null, feed: null, a4: null },
  breakBySection: { story: true, feed: true, a4: false },
};

const HEX = /^#[0-9a-f]{6}$/i;
/** Junta o que veio do banco com os padrões, descartando qualquer valor fora do formato (cor inválida, grade absurda). */
export function normalizeTheme(raw: unknown): ThemeConfig {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const d = DEFAULT_THEME;
  const obj = (v: unknown) =>
    (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const colors = { ...d.colors };
  const rc = obj(t.colors);
  for (const k of Object.keys(colors) as (keyof ThemeConfig["colors"])[])
    if (typeof rc[k] === "string" && HEX.test(rc[k] as string))
      colors[k] = rc[k] as string;
  const grid = { ...d.grid },
    panel = { ...d.panel },
    panelMargin = { ...d.panelMargin },
    cards = { ...d.cards },
    gridArea = { ...d.gridArea },
    breakBySection = { ...d.breakBySection };
  const rb = obj(t.breakBySection);
  const rm = obj(t.panelMargin),
    rg = obj(t.grid) as Record<string, { cols?: unknown; rows?: unknown }>,
    rp = obj(t.panel),
    rk = obj(t.cards),
    ra = obj(t.gridArea) as Record<
      string,
      { top?: unknown; bottom?: unknown } | null
    >;
  for (const f of PROMO_FORMAT_KEYS) {
    const c = Number(rg[f]?.cols),
      r = Number(rg[f]?.rows);
    if (
      Number.isInteger(c) &&
      Number.isInteger(r) &&
      c >= 1 &&
      c <= 6 &&
      r >= 1 &&
      r <= 8 &&
      c * r <= 30
    )
      grid[f] = { cols: c, rows: r };
    if (typeof rp[f] === "boolean") panel[f] = rp[f] as boolean;
    if (typeof rb[f] === "boolean") breakBySection[f] = rb[f] as boolean;
    const m = Number(rm[f]);
    if (
      rm[f] !== undefined &&
      rm[f] !== "" &&
      Number.isFinite(m) &&
      m >= 0 &&
      m <= 12
    )
      panelMargin[f] = m;
    if (
      rk[f] === null ||
      (typeof rk[f] === "string" && HEX.test(rk[f] as string))
    )
      cards[f] = rk[f] as string | null;
    const a = ra[f];
    if (a === null) gridArea[f] = null;
    else if (a) {
      const tp = Number(a.top),
        bt = Number(a.bottom);
      if (
        Number.isFinite(tp) &&
        Number.isFinite(bt) &&
        tp >= 0 &&
        bt <= 3000 &&
        bt - tp >= 200
      )
        gridArea[f] = { top: Math.round(tp), bottom: Math.round(bt) };
    }
  }
  const str = (v: unknown, max: number, def: string) =>
    typeof v === "string" ? v.trim().slice(0, max) : def;
  const gap = Number(t.cardGap);
  return {
    ...(normalizeCampaignVisual(t.visual)
      ? { visual: normalizeCampaignVisual(t.visual) }
      : {}),
    ...(isPriceLabel(t.priceLabel) ? { priceLabel: t.priceLabel } : {}),
    ...(normalizeOfferIdentity(t.offerIdentity)
      ? { offerIdentity: normalizeOfferIdentity(t.offerIdentity) }
      : {}),
    ...(t.referencePackage === "minas-corta-20261028" ? {referencePackage: "minas-corta-20261028" as const} : {}),
    colors,
    grid,
    panel,
    panelMargin,
    cards,
    gridArea,
    breakBySection,
    title: str(t.title, 60, d.title),
    tagText: str(t.tagText, 20, d.tagText),
    showTag: typeof t.showTag === "boolean" ? t.showTag : d.showTag,
    stack: typeof t.stack === "boolean" ? t.stack : d.stack,
    clouds: typeof t.clouds === "boolean" ? t.clouds : d.clouds,
    panelTuck: typeof t.panelTuck === "boolean" ? t.panelTuck : d.panelTuck,
    cardGap:
      t.cardGap !== undefined &&
      t.cardGap !== "" &&
      Number.isFinite(gap) &&
      gap >= 0 &&
      gap <= 6
        ? gap
        : d.cardGap,
    footerLines: Array.isArray(t.footerLines)
      ? t.footerLines
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 3)
      : d.footerLines,
  };
}

// ---------- posição dos produtos ----------
export type Rect = { x: number; y: number; w: number; h: number };
export type PageLayout = {
  width: number;
  height: number;
  headerH: number;
  footerH: number;
  panel: Rect | null;
  cells: Rect[];
  /** distância entre o início de uma coluna e o da seguinte */ pitchX: number;
};
export type LayoutOpts = {
  dimensions?: { w: number; h: number };
  /** quantos produtos há na peça (só as linhas necessárias são usadas); padrão = grade cheia */
  count?: number;
  /** margem lateral do painel/cartões, em % da largura */
  marginPct?: number;
  /** o painel sobe por baixo do cabeçalho */
  tuck?: boolean;
  /** área dos produtos em pixels (ignora cabeçalho/rodapé) */
  area?: GridArea | null;
  /** espaço entre as células, em % da largura (cartões) */
  gapPct?: number;
};

/** Margem em volta do painel e espaço entre os produtos. `headerH`/`footerH` = altura da arte de cabeçalho/rodapé já escalada para a largura. */
export function pageLayout(
  format: PromoFormat,
  grid: GridSpec,
  hasPanel: boolean,
  headerH: number,
  footerH: number,
  o: LayoutOpts = {},
): PageLayout {
  const { w, h } = o.dimensions ?? PROMO_FORMATS[format];
  const count = o.count ?? grid.cols * grid.rows;
  const margin = Math.round((w * (o.marginPct ?? (hasPanel ? 4.5 : 2))) / 100);
  const flush = hasPanel && margin === 0; // painel de ponta a ponta (A4): sem folga em cima nem embaixo
  const top = o.area
    ? o.area.top
    : headerH + (hasPanel && !flush ? Math.round(h * 0.006) : 0);
  const bottom = o.area
    ? o.area.bottom
    : h - footerH - (hasPanel && !flush ? Math.round(h * 0.01) : 0);
  const panelBase: Rect | null = hasPanel
    ? { x: margin, y: top, w: w - 2 * margin, h: bottom - top }
    : null;
  const tuckPx = Math.round(w * 0.06);
  const panel: Rect | null =
    panelBase && o.tuck
      ? { ...panelBase, y: panelBase.y - tuckPx, h: panelBase.h + tuckPx }
      : panelBase;
  const inner: Rect = panelBase
    ? {
        x: panelBase.x + Math.round(w * 0.015),
        y: panelBase.y + Math.round(w * 0.015),
        w: panelBase.w - Math.round(w * 0.03),
        h: panelBase.h - Math.round(w * 0.03),
      }
    : { x: margin, y: top, w: w - 2 * margin, h: bottom - top };
  // só as linhas necessárias para a quantidade de produtos (peça com poucos produtos não fica com metade em branco); a altura da célula tem teto para a foto não esticar
  const rowsUsed = Math.max(
    1,
    Math.min(grid.rows, Math.ceil(count / grid.cols)),
  );
  const cw = inner.w / grid.cols;
  const ch =
    o.area && !hasPanel
      ? inner.h / rowsUsed
      : Math.min(inner.h / rowsUsed, cw * 1.5);
  const y0 = inner.y + (inner.h - ch * rowsUsed) / 2; // bloco centralizado na área dos produtos
  const gap = Math.round((w * (o.gapPct ?? 0)) / 100);
  const cells: Rect[] = [];
  for (let r = 0; r < rowsUsed; r++)
    for (let c = 0; c < grid.cols; c++)
      cells.push({
        x: Math.round(inner.x + c * cw + gap / 2),
        y: Math.round(y0 + r * ch + gap / 2),
        w: Math.round(cw - gap),
        h: Math.round(ch - gap),
      });
  return { width: w, height: h, headerH, footerH, panel, cells, pitchX: cw };
}

/** Divide os itens em páginas. A última página pode ter menos itens (a arte centraliza a última linha). */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (perPage < 1) return [];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage)
    pages.push(items.slice(i, i + perPage));
  return pages;
}

/** Divide em peças. Com `breakBySection`, cada seção (aba da planilha) começa uma peça nova; sem isso, os itens seguem em fila. */
export function paginateSections<T extends { section?: string | null }>(
  items: T[],
  perPage: number,
  breakBySection: boolean,
): T[][] {
  if (!breakBySection) return paginate(items, perPage);
  if (perPage < 1) return [];
  const pages: T[][] = [];
  let cur: T[] = [],
    sec: string | null = null;
  for (const it of items) {
    const s = it.section ?? null;
    if (cur.length && (s !== sec || cur.length >= perPage)) {
      pages.push(cur);
      cur = [];
    }
    sec = s;
    cur.push(it);
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** Posição de cada item da página; a última linha incompleta fica centralizada. `pitchX` = distância entre colunas (inclui o espaço entre cartões). */
export function placeCells(
  cells: Rect[],
  count: number,
  cols: number,
  pitchX: number = cells[0]?.w ?? 0,
): Rect[] {
  const out = cells.slice(0, count).map((c) => ({ ...c }));
  const rem = count % cols;
  if (rem && count > 0) {
    const shift = Math.round(((cols - rem) * pitchX) / 2);
    for (let i = count - rem; i < count; i++) out[i].x += shift;
  }
  return out;
}

/** Nome para a arte: maiúsculas, espaços limpos. O ERP já traz abreviações; a pessoa pode editar depois. */
export function displayName(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

// ---------- estilo do encarte e textos da promoção (console de edição) ----------
export const TAG_PRESETS = [
  "Promoção",
  "Cliente Fidelidade",
  "Exclusivo APP",
  "Leve 2 ou Mais",
  "Leve 3 ou Mais",
  "Leve 3 Pague 2",
  "Oferta",
] as const;
export type ItemStyle = {
  priceLabel?: PriceLabelId;
  offerIdentity?: OfferIdentity;
  /** texto da etiqueta: ausente = a do tema; "" = sem etiqueta neste encarte */
  tag?: string;
  tagColor?: string;
  badgeColor?: string;
  priceColor?: string;
  nameColor?: string;
  nameAlign?: "left" | "center" | "right";
  /** tamanho do nome em % do padrão */
  nameScale?: number;
};
/** Aceita só valores válidos: cor #rrggbb, alinhamento da lista, tamanho de 50 a 200 %, etiqueta de até 24 caracteres. */
export function normalizeItemStyle(raw: unknown): ItemStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: ItemStyle = {};
  if (isPriceLabel(r.priceLabel)) out.priceLabel = r.priceLabel;
  const identity = normalizeOfferIdentity(r.offerIdentity);
  if (identity) out.offerIdentity = identity;
  if (typeof r.tag === "string") out.tag = r.tag.trim().slice(0, 24);
  for (const k of [
    "tagColor",
    "badgeColor",
    "priceColor",
    "nameColor",
  ] as const)
    if (typeof r[k] === "string" && HEX.test(r[k] as string))
      out[k] = (r[k] as string).toLowerCase();
  if (
    r.nameAlign === "left" ||
    r.nameAlign === "center" ||
    r.nameAlign === "right"
  )
    out.nameAlign = r.nameAlign;
  const sc = Number(r.nameScale);
  if (
    r.nameScale !== undefined &&
    r.nameScale !== "" &&
    Number.isFinite(sc) &&
    sc >= 50 &&
    sc <= 200
  )
    out.nameScale = Math.round(sc);
  return out;
}

// ---------- fundo da peça (galeria "Imagem de Fundo") ----------
export type BackgroundStyle =
  | "linear"
  | "radial"
  | "rays"
  | "confetti"
  | "stripes"
  | "sky";
export type BackgroundPreset = {
  id: string;
  label: string;
  style: BackgroundStyle;
  colors: [string, string];
};
/** Fundos prontos, desenhados pelo próprio sistema (valem para qualquer formato). */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "ceu",
    label: "Céu azul",
    style: "sky",
    colors: ["#4db4ee", "#bfe8fb"],
  },
  {
    id: "vermelhao",
    label: "Vermelhão",
    style: "radial",
    colors: ["#ff4a4a", "#a30d14"],
  },
  {
    id: "raios-vermelho",
    label: "Raios vermelhos",
    style: "rays",
    colors: ["#e3171d", "#c20f16"],
  },
  {
    id: "raios-amarelo",
    label: "Raios amarelos",
    style: "rays",
    colors: ["#ffd21f", "#ffb800"],
  },
  {
    id: "azul-royal",
    label: "Azul royal",
    style: "linear",
    colors: ["#1d5fe0", "#0b2f87"],
  },
  {
    id: "verde-saude",
    label: "Verde saúde",
    style: "linear",
    colors: ["#27c58a", "#0b6b4a"],
  },
  {
    id: "rosa-bebe",
    label: "Rosa bebê",
    style: "linear",
    colors: ["#ffb3d1", "#ff6fa6"],
  },
  {
    id: "roxo",
    label: "Roxo",
    style: "radial",
    colors: ["#9a5cf0", "#4b1fa6"],
  },
  {
    id: "preto",
    label: "Preto premium",
    style: "radial",
    colors: ["#3a3a46", "#0a0a0d"],
  },
  {
    id: "laranja",
    label: "Laranja",
    style: "linear",
    colors: ["#ffa93a", "#ff6a00"],
  },
  {
    id: "confete",
    label: "Confete",
    style: "confetti",
    colors: ["#fff6e0", "#ffe9b8"],
  },
  {
    id: "listras",
    label: "Listras",
    style: "stripes",
    colors: ["#e3171d", "#ffffff"],
  },
];
export const isBackgroundPreset = (id: unknown): id is string =>
  typeof id === "string" && BACKGROUND_PRESETS.some((p) => p.id === id);

/** Fundo escolhido para a promoção: pronto, duas cores, imagem enviada ou o fundo de outro tema. Sem escolha = o do tema. */
export type BackgroundChoice =
  | { kind: "preset"; id: string }
  | { kind: "color"; color: string; color2?: string }
  | { kind: "asset"; asset: string }
  | { kind: "theme"; themeId: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeBackground(
  raw: unknown,
): BackgroundChoice | undefined {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<
    string,
    unknown
  > | null;
  if (!r) return undefined;
  if (r.kind === "preset" && isBackgroundPreset(r.id))
    return { kind: "preset", id: r.id };
  if (r.kind === "color" && typeof r.color === "string" && HEX.test(r.color))
    return {
      kind: "color",
      color: r.color.toLowerCase(),
      ...(typeof r.color2 === "string" && HEX.test(r.color2)
        ? { color2: r.color2.toLowerCase() }
        : {}),
    };
  if (
    r.kind === "asset" &&
    typeof r.asset === "string" &&
    UUID_RE.test(r.asset)
  )
    return { kind: "asset", asset: r.asset };
  if (
    r.kind === "theme" &&
    typeof r.themeId === "string" &&
    UUID_RE.test(r.themeId)
  )
    return { kind: "theme", themeId: r.themeId };
  return undefined;
}

export type PromoOverrides = {
  /** Versioned private copy of a public model; later catalogue changes never alter this campaign. */
  model?: ModelSnapshot;
  dimensions?: Partial<Record<PromoFormat, { w: number; h: number }>>;
  grid?: Partial<Record<PromoFormat, GridSpec>>;
  tagText?: string;
  showTag?: boolean;
  footerLines?: string[];
  extraText?: string;
  background?: BackgroundChoice;
  /** artes fixas do tema que esta promoção não usa (ids) */ hideFixed?: string[];
};
export function normalizeOverrides(raw: unknown): PromoOverrides {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: PromoOverrides = {};
  if (r.model && typeof r.model === "object") {
    const m = r.model as Record<string, unknown>;
    if (
      pharmacyModel(m.key) &&
      m.version === 1 &&
      m.theme &&
      typeof m.theme === "object" &&
      !Array.isArray(m.theme)
    )
      out.model = {
        key: String(m.key),
        version: 1,
        theme: normalizeTheme(m.theme),
      };
  }
  if (r.dimensions && typeof r.dimensions === "object") {
    const dims = r.dimensions as Record<string, { w?: unknown; h?: unknown }>;
    for (const f of PROMO_FORMAT_KEYS) {
      const w = Number(dims[f]?.w),
        h = Number(dims[f]?.h);
      if (
        Number.isInteger(w) &&
        Number.isInteger(h) &&
        w >= 500 &&
        w <= 5000 &&
        h >= 500 &&
        h <= 5000
      ) {
        out.dimensions ??= {};
        out.dimensions[f] = { w, h };
      }
    }
  }
  if (r.grid && typeof r.grid === "object" && !Array.isArray(r.grid)) {
    const values = r.grid as Record<string, unknown>,
      grid: Partial<Record<PromoFormat, GridSpec>> = {};
    for (const f of PROMO_FORMAT_KEYS) {
      const g = values[f] as { cols?: unknown; rows?: unknown } | undefined;
      if (
        g &&
        Number.isInteger(g.cols) &&
        Number.isInteger(g.rows) &&
        Number(g.cols) >= 1 &&
        Number(g.cols) <= 6 &&
        Number(g.rows) >= 1 &&
        Number(g.rows) <= 8 &&
        Number(g.cols) * Number(g.rows) <= 30
      )
        grid[f] = { cols: Number(g.cols), rows: Number(g.rows) };
    }
    if (Object.keys(grid).length) out.grid = grid;
  }

  if (typeof r.tagText === "string")
    out.tagText = r.tagText.trim().slice(0, 24);
  if (typeof r.showTag === "boolean") out.showTag = r.showTag;
  if (Array.isArray(r.footerLines))
    out.footerLines = r.footerLines
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 3);
  if (typeof r.extraText === "string")
    out.extraText = r.extraText.trim().slice(0, 140);
  const bg = normalizeBackground(r.background);
  if (bg) out.background = bg;
  if (Array.isArray(r.hideFixed)) {
    const ids = [
      ...new Set(
        r.hideFixed.filter(
          (x): x is string =>
            typeof x === "string" && /^[a-z0-9-]{4,40}$/i.test(x),
        ),
      ),
    ].slice(0, 40);
    if (ids.length) out.hideFixed = ids;
  }
  return out;
}
/** O que a promoção define (etiqueta, rodapé) vale no lugar do tema. */
export function applyOverrides(
  theme: ThemeConfig,
  o: PromoOverrides,
): ThemeConfig {
  theme = o.model?.theme ?? theme;
  return {
    ...theme,
    ...(o.dimensions ? { dimensions: o.dimensions } : {}),
    gridArea: o.dimensions?.feed
      ? { ...theme.gridArea, feed: null }
      : theme.gridArea,
    grid: { ...theme.grid, ...o.grid },
    tagText: o.tagText ?? theme.tagText,
    showTag: o.showTag ?? theme.showTag,
    footerLines: o.footerLines ?? theme.footerLines,
  };
}

/** Tema de um design livre: sem título, rodapé, painel nem nuvens (a peça começa em branco; o fundo vem da galeria). */
export const BLANK_THEME: ThemeConfig = {
  ...DEFAULT_THEME,
  title: "",
  footerLines: [],
  clouds: false,
  showTag: false,
  panel: { story: false, feed: false, a4: false },
};
