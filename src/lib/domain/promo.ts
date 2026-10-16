// Promoções montadas a partir de planilha: leitura de preço, colunas, tema e posição dos produtos em cada formato. Tudo puro e testado.
import { parseEan } from './catalog.ts'

export type PromoFormat = 'story' | 'feed' | 'a4'
export const PROMO_FORMATS: Record<PromoFormat, { label: string; w: number; h: number; hint: string }> = {
  story: { label: 'Story / Status', w: 1080, h: 1920, hint: '1080 × 1920 px' },
  feed: { label: 'Feed (Instagram/Facebook)', w: 1080, h: 1350, hint: '1080 × 1350 px' },
  a4: { label: 'Cartaz / Flyer A4', w: 1414, h: 2000, hint: 'A4 (21 × 29,7 cm)' },
}
export const PROMO_FORMAT_KEYS = Object.keys(PROMO_FORMATS) as PromoFormat[]

// ---------- preço ----------
/** Aceita número da planilha, "12,99", "12.99", "R$ 1.234,56". Devolve null se não for um preço válido (>= 0 e < 100 mil). */
export function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 && raw < 100000 ? Math.round(raw * 100) / 100 : null
  let s = String(raw).replace(/R\$/gi, '').replace(/\s+/g, '').trim()
  if (!/^[\d.,]+$/.test(s)) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.') // 1.234,56 → 1234.56
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '') // 1.234 ou 1.234.567: ponto de milhar
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null
}

/** 59.9 → { reais: "59", centavos: "90" } (a arte mostra R$ 59,90 com os centavos menores). */
export function priceParts(price: number): { reais: string; centavos: string } {
  const cents = Math.round(price * 100)
  return { reais: String(Math.floor(cents / 100)), centavos: String(cents % 100).padStart(2, '0') }
}

// ---------- planilha ----------
export type PromoColumns = { ean: number | null; price: number | null; name: number | null }
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Acha as colunas pelo cabeçalho: código de barras, o preço ("Valor aproximado" tem prioridade; depois preço promocional/oferta, depois preço de venda) e, se houver, o nome. */
export function detectPromoColumns(header: unknown[]): PromoColumns {
  const h = header.map(norm)
  const find = (re: RegExp) => { const i = h.findIndex((x) => re.test(x)); return i < 0 ? null : i }
  const ean = find(/^(barras|ean|gtin|cod(igo)? de barras|codigo barras|cod barras)$/)
  const price = find(/aprox/) ?? find(/(promo|oferta)/) ?? find(/preco (de )?venda|valor (de )?venda/) ?? find(/^(preco|valor)$/) ?? find(/(preco|valor)/)
  const name = find(/^(descricao|produto|nome( do produto)?|descricao do produto)$/)
  return { ean, price, name }
}

export type PromoRow = { ean: string; price: number; name: string | null }
export type PromoParse = { rows: PromoRow[]; errors: { line: number; message: string }[] }

/** Transforma as linhas da planilha em itens. Código de barras inválido, preço inválido e repetição viram aviso (a primeira ocorrência vale). */
export function parsePromoRows(cells: unknown[][], cols: PromoColumns, firstDataLine = 2): PromoParse {
  const rows: PromoRow[] = [], errors: PromoParse['errors'] = []
  const seen = new Set<string>()
  cells.forEach((r, k) => {
    const line = firstDataLine + k
    if (r.every((c) => c === null || c === undefined || String(c).trim() === '')) return
    const ean = cols.ean != null ? parseEan(r[cols.ean]) : null
    if (!ean) { errors.push({ line, message: 'Código de barras inválido ou vazio.' }); return }
    const price = cols.price != null ? parsePrice(r[cols.price]) : null
    if (price === null) { errors.push({ line, message: `Preço inválido para o código ${ean}.` }); return }
    if (seen.has(ean)) { errors.push({ line, message: `Código ${ean} repetido: vale a primeira linha.` }); return }
    seen.add(ean)
    const name = cols.name != null ? String(r[cols.name] ?? '').trim().replace(/\s+/g, ' ').slice(0, 160) || null : null
    rows.push({ ean, price, name })
  })
  return { rows, errors }
}

// ---------- tema ----------
export type GridSpec = { cols: number; rows: number }
export type ThemeConfig = {
  colors: { skyTop: string; skyBottom: string; panel: string; badge: string; badgeEdge: string; badgeText: string; name: string; tag: string; tagText: string; title: string; footer: string; footerText: string }
  title: string
  tagText: string
  showTag: boolean
  /** duas unidades sobrepostas atrás da foto, como nas peças da rede */
  stack: boolean
  footerLines: string[]
  grid: Record<PromoFormat, GridSpec>
  panel: Record<PromoFormat, boolean>
  /** margem lateral do painel branco, em % da largura (0 = painel de ponta a ponta, sem cantos arredondados) */
  panelMargin: Record<PromoFormat, number>
  /** o painel branco começa por baixo do cabeçalho (a arte do cabeçalho fica por cima do painel, como nas peças da rede) */
  panelTuck: boolean
}

export const DEFAULT_THEME: ThemeConfig = {
  colors: { skyTop: '#2e9be6', skyBottom: '#7cc8f5', panel: '#fbf5fb', badge: '#1747b8', badgeEdge: '#0b1f5c', badgeText: '#ffffff', name: '#111111', tag: '#e3171d', tagText: '#ffffff', title: '#ffd21f', footer: '#0f3fa8', footerText: '#ffffff' },
  title: 'OFERTAS',
  tagText: 'Uaau!',
  showTag: true,
  stack: true,
  footerLines: [],
  grid: { story: { cols: 2, rows: 3 }, feed: { cols: 3, rows: 2 }, a4: { cols: 4, rows: 4 } },
  panel: { story: true, feed: true, a4: false },
  panelMargin: { story: 4.5, feed: 4.5, a4: 2 },
  panelTuck: false,
}

const HEX = /^#[0-9a-f]{6}$/i
/** Junta o que veio do banco com os padrões, descartando qualquer valor fora do formato (cor inválida, grade absurda). */
export function normalizeTheme(raw: unknown): ThemeConfig {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_THEME
  const colors = { ...d.colors }
  const rc = (t.colors && typeof t.colors === 'object' ? t.colors : {}) as Record<string, unknown>
  for (const k of Object.keys(colors) as (keyof ThemeConfig['colors'])[]) if (typeof rc[k] === 'string' && HEX.test(rc[k] as string)) colors[k] = rc[k] as string
  const grid = { ...d.grid }, panel = { ...d.panel }, panelMargin = { ...d.panelMargin }
  const rm = (t.panelMargin && typeof t.panelMargin === 'object' ? t.panelMargin : {}) as Record<string, unknown>
  const rg = (t.grid && typeof t.grid === 'object' ? t.grid : {}) as Record<string, { cols?: unknown; rows?: unknown }>
  const rp = (t.panel && typeof t.panel === 'object' ? t.panel : {}) as Record<string, unknown>
  for (const f of PROMO_FORMAT_KEYS) {
    const c = Number(rg[f]?.cols), r = Number(rg[f]?.rows)
    if (Number.isInteger(c) && Number.isInteger(r) && c >= 1 && c <= 6 && r >= 1 && r <= 8 && c * r <= 30) grid[f] = { cols: c, rows: r }
    if (typeof rp[f] === 'boolean') panel[f] = rp[f] as boolean
    const m = Number(rm[f])
    if (rm[f] !== undefined && rm[f] !== '' && Number.isFinite(m) && m >= 0 && m <= 12) panelMargin[f] = m
  }
  const str = (v: unknown, max: number, def: string) => (typeof v === 'string' ? v.trim().slice(0, max) : def)
  return {
    colors, grid, panel, panelMargin,
    title: str(t.title, 60, d.title), tagText: str(t.tagText, 20, d.tagText),
    showTag: typeof t.showTag === 'boolean' ? t.showTag : d.showTag,
    stack: typeof t.stack === 'boolean' ? t.stack : d.stack,
    panelTuck: typeof t.panelTuck === 'boolean' ? t.panelTuck : d.panelTuck,
    footerLines: Array.isArray(t.footerLines) ? t.footerLines.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 3) : d.footerLines,
  }
}

// ---------- posição dos produtos ----------
export type Rect = { x: number; y: number; w: number; h: number }
export type PageLayout = { width: number; height: number; headerH: number; footerH: number; panel: Rect | null; cells: Rect[] }

/** Margem em volta do painel e espaço entre os produtos. `headerH`/`footerH` = altura da arte de cabeçalho/rodapé já escalada para a largura. */
export function pageLayout(format: PromoFormat, grid: GridSpec, hasPanel: boolean, headerH: number, footerH: number, count: number = grid.cols * grid.rows, panelMarginPct: number = hasPanel ? 4.5 : 2, tuck: boolean = false): PageLayout {
  const { w, h } = PROMO_FORMATS[format]
  const margin = Math.round((w * panelMarginPct) / 100)
  const flush = hasPanel && margin === 0 // painel de ponta a ponta (A4): sem folga em cima nem embaixo
  const top = headerH + (hasPanel && !flush ? Math.round(h * 0.006) : 0)
  const bottom = h - footerH - (hasPanel && !flush ? Math.round(h * 0.01) : 0)
  const panelBase: Rect | null = hasPanel ? { x: margin, y: top, w: w - 2 * margin, h: bottom - top } : null
  const panel: Rect | null = panelBase && tuck ? { ...panelBase, y: panelBase.y - Math.round(w * 0.06), h: panelBase.h + Math.round(w * 0.06) } : panelBase
  const inner: Rect = panelBase ? { x: panelBase.x + Math.round(w * 0.015), y: panelBase.y + Math.round(w * 0.015), w: panelBase.w - Math.round(w * 0.03), h: panelBase.h - Math.round(w * 0.03) } : { x: margin, y: top, w: w - 2 * margin, h: bottom - top }
  // só as linhas necessárias para a quantidade de produtos (peça com poucos produtos não fica com metade em branco); a altura da célula tem teto para a foto não esticar
  const rowsUsed = Math.max(1, Math.min(grid.rows, Math.ceil(count / grid.cols)))
  const cw = inner.w / grid.cols
  const ch = Math.min(inner.h / rowsUsed, cw * 1.5)
  const y0 = inner.y + (inner.h - ch * rowsUsed) / 2 // bloco centralizado na área dos produtos
  const cells: Rect[] = []
  for (let r = 0; r < rowsUsed; r++) for (let c = 0; c < grid.cols; c++) cells.push({ x: Math.round(inner.x + c * cw), y: Math.round(y0 + r * ch), w: Math.round(cw), h: Math.round(ch) })
  return { width: w, height: h, headerH, footerH, panel, cells }
}

/** Divide os itens em páginas. A última página pode ter menos itens (a arte centraliza a última linha). */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (perPage < 1) return []
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage))
  return pages
}

/** Posição de cada item da página; a última linha incompleta fica centralizada. */
export function placeCells(cells: Rect[], count: number, cols: number): Rect[] {
  const out = cells.slice(0, count).map((c) => ({ ...c }))
  const rem = count % cols
  if (rem && count > 0) {
    const cw = cells[0].w
    const shift = Math.round(((cols - rem) * cw) / 2)
    for (let i = count - rem; i < count; i++) out[i].x += shift
  }
  return out
}

/** Nome para a arte: maiúsculas, espaços limpos. O ERP já traz abreviações; a pessoa pode editar depois. */
export function displayName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toUpperCase()
}
