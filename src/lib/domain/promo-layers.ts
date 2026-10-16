// Elementos livres sobre a peça (como no Canva): texto, imagem e formas, com posição, tamanho, giro e camadas. Tudo puro e testado.
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, type PromoFormat } from './promo.ts'

export type LayerType = 'text' | 'image' | 'shape'
export type LayerFont = 'display' | 'text' | 'serif' | 'mono'
export type LayerShape = 'rect' | 'round' | 'circle' | 'burst' | 'line'
export type Layer = {
  id: string
  type: LayerType
  /** posição e tamanho em pixels da peça (canto de cima à esquerda) */
  x: number; y: number; w: number; h: number
  /** giro em graus */ rot: number
  opacity: number
  hidden: boolean; locked: boolean
  /** null = aparece em todas as peças do formato; n = só na peça n (começando em 0) */
  page: number | null
  // texto
  text?: string; font?: LayerFont; size?: number; color?: string; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right'
  stroke?: string | null; strokeW?: number; bg?: string | null
  // imagem
  asset?: string
  // forma
  shape?: LayerShape; fill?: string; border?: string | null; borderW?: number; radius?: number
}
export type Layers = Record<PromoFormat, Layer[]>

export const MAX_LAYERS = 40
export const emptyLayers = (): Layers => ({ story: [], feed: [], a4: [] })

const HEX = /^#[0-9a-f]{6}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const num = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def }
const color = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def)
const colorOrNull = (v: unknown, def: string | null) => (v === null ? null : typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def)

/** Aceita só valores válidos: nada fora da peça, textos curtos, cores #rrggbb, no máximo 40 elementos por formato. Remove o que não faz sentido. */
export function normalizeLayers(raw: unknown): Layers {
  const out = emptyLayers()
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  for (const f of PROMO_FORMAT_KEYS) {
    const { w: W, h: H } = PROMO_FORMATS[f]
    const list = Array.isArray(r[f]) ? (r[f] as unknown[]) : []
    const seen = new Set<string>()
    for (const x of list.slice(0, MAX_LAYERS)) {
      const l = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
      const type = l.type === 'text' || l.type === 'image' || l.type === 'shape' ? l.type : null
      const id = typeof l.id === 'string' && /^[a-z0-9-]{4,40}$/i.test(l.id) && !seen.has(l.id) ? l.id : null
      if (!type || !id) continue
      seen.add(id)
      const layer: Layer = {
        id, type,
        x: num(l.x, -W, 2 * W, 0), y: num(l.y, -H, 2 * H, 0), w: num(l.w, 8, 2 * W, 200), h: num(l.h, 4, 2 * H, 80),
        rot: num(l.rot, -360, 360, 0), opacity: num(l.opacity, 0, 1, 1),
        hidden: l.hidden === true, locked: l.locked === true,
        page: l.page === null || l.page === undefined ? null : Number.isInteger(l.page) && (l.page as number) >= 0 && (l.page as number) < 200 ? (l.page as number) : null,
      }
      if (type === 'text') {
        layer.text = typeof l.text === 'string' ? l.text.slice(0, 300) : 'Texto'
        layer.font = l.font === 'display' || l.font === 'text' || l.font === 'serif' || l.font === 'mono' ? l.font : 'text'
        layer.size = num(l.size, 8, 600, 64)
        layer.color = color(l.color, '#111111')
        layer.bold = l.bold !== false; layer.italic = l.italic === true
        layer.align = l.align === 'left' || l.align === 'right' ? l.align : 'center'
        layer.stroke = colorOrNull(l.stroke, null); layer.strokeW = num(l.strokeW, 0, 60, 0)
        layer.bg = colorOrNull(l.bg, null)
      } else if (type === 'image') {
        if (typeof l.asset !== 'string' || !UUID.test(l.asset)) continue
        layer.asset = l.asset
      } else {
        layer.shape = l.shape === 'rect' || l.shape === 'round' || l.shape === 'circle' || l.shape === 'burst' || l.shape === 'line' ? l.shape : 'rect'
        layer.fill = color(l.fill, '#ffd21f'); layer.border = colorOrNull(l.border, null); layer.borderW = num(l.borderW, 0, 80, 0)
        layer.radius = num(l.radius, 0, 400, 24)
      }
      out[f].push(layer)
    }
  }
  return out
}

// ---------- operações (usadas pelo editor e testadas aqui) ----------
export const newLayerId = () => `l${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`

/** Elementos que aparecem na peça `page` (todas as peças ou só essa). */
export const layersForPage = (list: Layer[], page: number): Layer[] => list.filter((l) => !l.hidden && (l.page === null || l.page === page))

export type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
/** Alinha o elemento à peça (esquerda, centro, direita, topo, meio, base). */
export function alignToPage(l: Layer, a: Align, W: number, H: number): Layer {
  switch (a) {
    case 'left': return { ...l, x: 0 }
    case 'hcenter': return { ...l, x: Math.round((W - l.w) / 2) }
    case 'right': return { ...l, x: W - l.w }
    case 'top': return { ...l, y: 0 }
    case 'vcenter': return { ...l, y: Math.round((H - l.h) / 2) }
    case 'bottom': return { ...l, y: H - l.h }
  }
}

/** Troca de camada: 'front' e 'back' levam ao topo/fundo; 'up' e 'down' andam uma posição. */
export function reorderLayer(list: Layer[], id: string, dir: 'front' | 'back' | 'up' | 'down'): Layer[] {
  const i = list.findIndex((l) => l.id === id)
  if (i < 0) return list
  const out = [...list]
  const [l] = out.splice(i, 1)
  const j = dir === 'front' ? out.length : dir === 'back' ? 0 : dir === 'up' ? Math.min(out.length, i + 1) : Math.max(0, i - 1)
  out.splice(j, 0, l)
  return out
}

/** "Ímã" do arrasto: encosta no centro e nas bordas da peça (e das outras camadas) quando está a menos de `tol` px. Devolve o deslocamento e as guias. */
export function snap(l: { x: number; y: number; w: number; h: number }, W: number, H: number, others: { x: number; y: number; w: number; h: number }[], tol = 8): { dx: number; dy: number; guidesX: number[]; guidesY: number[] } {
  const xs = [0, W / 2, W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])]
  const ys = [0, H / 2, H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])]
  const best = (edges: number[], targets: number[]) => { let d = Infinity, t = 0; for (const e of edges) for (const g of targets) if (Math.abs(g - e) < Math.abs(d)) { d = g - e; t = g } return Math.abs(d) <= tol ? { d, t } : null }
  const sx = best([l.x, l.x + l.w / 2, l.x + l.w], xs), sy = best([l.y, l.y + l.h / 2, l.y + l.h], ys)
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guidesX: sx ? [sx.t] : [], guidesY: sy ? [sy.t] : [] }
}

/** Novo elemento com valores padrão, no meio da peça. */
export function makeLayer(type: LayerType, f: PromoFormat, extra: Partial<Layer> = {}): Layer {
  const { w: W, h: H } = PROMO_FORMATS[f]
  const base = { id: newLayerId(), type, rot: 0, opacity: 1, hidden: false, locked: false, page: null } as const
  if (type === 'text') { const w = Math.round(W * 0.6), h = 120; return { ...base, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, text: 'Seu texto aqui', font: 'display', size: 72, color: '#ffffff', bold: true, italic: false, align: 'center', stroke: '#0b1f5c', strokeW: 8, bg: null, ...extra }
  }
  if (type === 'image') { const w = Math.round(W * 0.4), h = Math.round(W * 0.4); return { ...base, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, ...extra } }
  const w = Math.round(W * 0.4), h = Math.round(W * 0.25)
  return { ...base, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, shape: 'round', fill: '#ffd21f', border: null, borderW: 0, radius: 36, ...extra }
}
