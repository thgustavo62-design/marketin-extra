// Elementos livres sobre a peça (como no Canva): texto, imagem e formas, com posição, tamanho, giro e camadas. Tudo puro e testado.
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, type PromoFormat } from './promo.ts'
import { isPromoFont } from './promo-fonts.ts'

export type LayerType = 'text' | 'image' | 'shape'
/** id da fonte (ver promo-fonts.ts) */
export type LayerFont = string
export type LayerShape = 'rect' | 'round' | 'circle' | 'burst' | 'line' | 'triangle' | 'arrow' | 'star' | 'hexagon' | 'balloon' | 'tag'
export const LAYER_SHAPES: LayerShape[] = ['rect', 'round', 'circle', 'burst', 'line', 'triangle', 'arrow', 'star', 'hexagon', 'balloon', 'tag']
export type Dash = 'solid' | 'dashed' | 'dotted'
export type Layer = {
  id: string
  type: LayerType
  /** posição e tamanho em pixels da peça (canto de cima à esquerda) */
  x: number; y: number; w: number; h: number
  /** giro em graus */ rot: number
  opacity: number
  hidden: boolean; locked: boolean
  /** elementos com o mesmo grupo se movem e se redimensionam juntos */ group?: string
  /** sombra suave atrás do elemento */ shadow?: boolean
  /** null = aparece em todas as peças do formato; n = só na peça n (começando em 0) */
  page: number | null
  // texto
  text?: string; font?: LayerFont; size?: number; color?: string; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right'
  stroke?: string | null; strokeW?: number; bg?: string | null
  // imagem
  asset?: string
  /** como a foto entra na moldura: inteira (padrão) ou preenchendo (corta o que sobra) */ fit?: 'contain' | 'cover'
  /** zoom da foto dentro da moldura (1 a 4) e ponto de foco 0–1 (0,5 = centro), para reposicionar o recorte */ zoom?: number; px?: number; py?: number
  /** recorte da moldura: círculo/elipse ou cantos arredondados (usa `radius`) */ mask?: 'circle' | 'round'
  flipX?: boolean; flipY?: boolean
  /** ajustes da foto, de −100 a 100 (0 = original); desfoque em px da peça; preto e branco */ bright?: number; contrast?: number; saturate?: number; blur?: number; gray?: boolean
  // forma
  shape?: LayerShape; fill?: string; border?: string | null; borderW?: number; radius?: number
  /** degradê: segunda cor (null = cor sólida) e ângulo em graus (0 = esquerda→direita, 90 = cima→baixo) */ fill2?: string | null; gradAngle?: number; dash?: Dash
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
        ...(typeof l.group === 'string' && /^[a-z0-9-]{4,40}$/i.test(l.group) ? { group: l.group } : {}),
        ...(l.shadow === true ? { shadow: true } : {}),
        page: l.page === null || l.page === undefined ? null : Number.isInteger(l.page) && (l.page as number) >= 0 && (l.page as number) < 200 ? (l.page as number) : null,
      }
      if (type === 'text') {
        layer.text = typeof l.text === 'string' ? l.text.slice(0, 300) : 'Texto'
        layer.font = isPromoFont(l.font) ? l.font : 'text'
        layer.size = num(l.size, 8, 600, 64)
        layer.color = color(l.color, '#111111')
        layer.bold = l.bold !== false; layer.italic = l.italic === true
        layer.align = l.align === 'left' || l.align === 'right' ? l.align : 'center'
        layer.stroke = colorOrNull(l.stroke, null); layer.strokeW = num(l.strokeW, 0, 60, 0)
        layer.bg = colorOrNull(l.bg, null)
      } else if (type === 'image') {
        if (typeof l.asset !== 'string' || !UUID.test(l.asset)) continue
        layer.asset = l.asset
        if (l.fit === 'cover') layer.fit = 'cover'
        if (l.zoom !== undefined) { const z = num(l.zoom, 1, 4, 1); if (z !== 1) layer.zoom = z }
        for (const k of ['px', 'py'] as const) if (l[k] !== undefined) { const v = num(l[k], 0, 1, 0.5); if (v !== 0.5) layer[k] = v }
        if (l.mask === 'circle' || l.mask === 'round') layer.mask = l.mask
        if (l.flipX === true) layer.flipX = true
        if (l.flipY === true) layer.flipY = true
        for (const k of ['bright', 'contrast', 'saturate'] as const) if (l[k] !== undefined) { const v = Math.round(num(l[k], -100, 100, 0)); if (v !== 0) layer[k] = v }
        if (l.blur !== undefined) { const v = Math.round(num(l.blur, 0, 30, 0)); if (v) layer.blur = v }
        if (l.gray === true) layer.gray = true
        layer.border = colorOrNull(l.border, null); layer.borderW = num(l.borderW, 0, 80, 0); layer.radius = num(l.radius, 0, 400, 24)
        if (l.dash === 'dashed' || l.dash === 'dotted') layer.dash = l.dash
      } else {
        layer.shape = LAYER_SHAPES.includes(l.shape as LayerShape) ? (l.shape as LayerShape) : 'rect'
        layer.fill = color(l.fill, '#ffd21f'); layer.border = colorOrNull(l.border, null); layer.borderW = num(l.borderW, 0, 80, 0)
        layer.radius = num(l.radius, 0, 400, 24)
        const fill2 = colorOrNull(l.fill2, null)
        if (fill2) { layer.fill2 = fill2; layer.gradAngle = num(l.gradAngle, 0, 360, 90) }
        if (l.dash === 'dashed' || l.dash === 'dotted') layer.dash = l.dash
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

// ---------- seleção múltipla e grupos ----------
export type Bounds = { x: number; y: number; w: number; h: number }

/** Caixa que envolve os elementos (considerando o giro de cada um). */
export function boundsOf(list: Layer[], ids: string[]): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of list) {
    if (!ids.includes(l.id)) continue
    const r = (l.rot * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
    const bw = l.w * c + l.h * s, bh = l.w * s + l.h * c, cx = l.x + l.w / 2, cy = l.y + l.h / 2
    x0 = Math.min(x0, cx - bw / 2); x1 = Math.max(x1, cx + bw / 2); y0 = Math.min(y0, cy - bh / 2); y1 = Math.max(y1, cy + bh / 2)
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

/** Clicar em um membro de um grupo seleciona o grupo inteiro; ids que não existem saem. */
export function expandSelection(list: Layer[], ids: string[]): string[] {
  const groups = new Set(list.filter((l) => ids.includes(l.id) && l.group).map((l) => l.group))
  return list.filter((l) => ids.includes(l.id) || (l.group && groups.has(l.group))).map((l) => l.id)
}

/** Junta os elementos num grupo (pelo menos dois). Os que já estavam em outro grupo passam para o novo. */
export function groupLayers(list: Layer[], ids: string[]): Layer[] {
  const sel = expandSelection(list, ids)
  if (sel.length < 2) return list
  const g = newLayerId()
  return list.map((l) => (sel.includes(l.id) ? { ...l, group: g } : l))
}

/** Desfaz os grupos dos elementos escolhidos (e de quem estiver no mesmo grupo). */
export function ungroupLayers(list: Layer[], ids: string[]): Layer[] {
  const sel = expandSelection(list, ids)
  return list.map((l) => {
    if (!sel.includes(l.id) || !l.group) return l
    const { group: _g, ...rest } = l
    return rest
  })
}

export function moveSelection(list: Layer[], ids: string[], dx: number, dy: number): Layer[] {
  return list.map((l) => (ids.includes(l.id) && !l.locked ? { ...l, x: Math.round(l.x + dx), y: Math.round(l.y + dy) } : l))
}

/** Alinha a seleção: com 2 ou mais elementos, entre si (pela caixa que os envolve); com um só, à peça. */
export function alignSelection(list: Layer[], ids: string[], a: Align, W: number, H: number): Layer[] {
  const sel = list.filter((l) => ids.includes(l.id) && !l.locked)
  if (!sel.length) return list
  const area: Bounds = sel.length > 1 ? boundsOf(list, sel.map((l) => l.id))! : { x: 0, y: 0, w: W, h: H }
  return list.map((l) => {
    if (!sel.includes(l)) return l
    const b = boundsOf([l], [l.id])!
    const dx = a === 'left' ? area.x - b.x : a === 'hcenter' ? area.x + area.w / 2 - (b.x + b.w / 2) : a === 'right' ? area.x + area.w - (b.x + b.w) : 0
    const dy = a === 'top' ? area.y - b.y : a === 'vcenter' ? area.y + area.h / 2 - (b.y + b.h / 2) : a === 'bottom' ? area.y + area.h - (b.y + b.h) : 0
    return { ...l, x: Math.round(l.x + dx), y: Math.round(l.y + dy) }
  })
}

/** Distribui pelo menos 3 elementos com espaços iguais entre eles (horizontal ou vertical). */
export function distribute(list: Layer[], ids: string[], axis: 'h' | 'v'): Layer[] {
  const sel = list.filter((l) => ids.includes(l.id) && !l.locked)
  if (sel.length < 3) return list
  const box = (l: Layer) => boundsOf([l], [l.id])!
  const pos = (b: Bounds) => (axis === 'h' ? b.x : b.y), size = (b: Bounds) => (axis === 'h' ? b.w : b.h)
  const order = [...sel].sort((p, q) => pos(box(p)) - pos(box(q)))
  const first = box(order[0]), last = box(order[order.length - 1])
  const total = pos(last) + size(last) - pos(first)
  const gap = (total - order.reduce((n, l) => n + size(box(l)), 0)) / (order.length - 1)
  const moved = new Map<string, number>()
  let cur = pos(first)
  for (const l of order) { const b = box(l); moved.set(l.id, cur - pos(b)); cur += size(b) + gap }
  return list.map((l) => (moved.has(l.id) ? { ...l, ...(axis === 'h' ? { x: Math.round(l.x + moved.get(l.id)!) } : { y: Math.round(l.y + moved.get(l.id)!) }) } : l))
}

/** Redimensiona a seleção como um bloco: leva a caixa "from" para a caixa "to" (posição e tamanho de cada um na mesma proporção; letras escalam junto). */
export function scaleSelection(list: Layer[], ids: string[], from: Bounds, to: Bounds): Layer[] {
  if (from.w <= 0 || from.h <= 0) return list
  const kx = to.w / from.w, ky = to.h / from.h, kt = Math.min(kx, ky)
  return list.map((l) => {
    if (!ids.includes(l.id) || l.locked) return l
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2
    const ncx = to.x + (cx - from.x) * kx, ncy = to.y + (cy - from.y) * ky
    const w = Math.max(8, l.w * kx), h = Math.max(4, l.h * ky)
    const n: Layer = { ...l, x: Math.round(ncx - w / 2), y: Math.round(ncy - h / 2), w: Math.round(w), h: Math.round(h) }
    if (l.type === 'text') n.size = Math.max(8, Math.min(600, Math.round((l.size ?? 64) * kt)))
    return n
  })
}

/** Cópias da seleção (deslocadas) para colocar no fim da lista. Cada grupo copiado vira um grupo novo. */
export function duplicateLayers(list: Layer[], ids: string[], offset = 24): { added: Layer[]; ids: string[] } {
  const sel = list.filter((l) => ids.includes(l.id))
  const groups = new Map<string, string>()
  const added = sel.map((l) => {
    const c: Layer = { ...l, id: newLayerId(), x: l.x + offset, y: l.y + offset, locked: false }
    if (l.group) { if (!groups.has(l.group)) groups.set(l.group, newLayerId()); c.group = groups.get(l.group) }
    return c
  })
  return { added, ids: added.map((l) => l.id) }
}

/**
 * Cópias para colar: na mesma peça ficam deslocadas; em outro formato mudam de proporção (posição e tamanho acompanham a largura e a altura da peça; a letra, a largura).
 * Cada grupo copiado vira um grupo novo; o elemento que valia para todas as peças continua valendo, os demais vão para a peça atual.
 */
export function pasteLayers(clip: { fmt: PromoFormat; layers: Layer[] }, to: PromoFormat, page: number, offset = 24): { added: Layer[]; ids: string[] } {
  const A = PROMO_FORMATS[clip.fmt], B = PROMO_FORMATS[to]
  const same = clip.fmt === to
  const kx = B.w / A.w, ky = B.h / A.h
  const groups = new Map<string, string>()
  const added = clip.layers.map((l) => {
    const c: Layer = same
      ? { ...l, x: l.x + offset, y: l.y + offset }
      : { ...l, x: Math.round(l.x * kx), y: Math.round(l.y * ky), w: Math.round(l.w * kx), h: Math.round(l.h * kx) }
    if (!same && l.type === 'text') c.size = Math.max(8, Math.min(600, Math.round((l.size ?? 64) * kx)))
    c.id = newLayerId(); c.locked = false
    c.page = l.page === null ? null : page
    if (l.group) { if (!groups.has(l.group)) groups.set(l.group, newLayerId()); c.group = groups.get(l.group) } else delete c.group
    return c
  })
  return { added, ids: added.map((l) => l.id) }
}

/**
 * Onde a foto é desenhada dentro da moldura (coordenadas locais 0..w, 0..h).
 * "contain": inteira e centralizada. "cover": preenche a moldura (corta o que sobra), com zoom e foco (px, py) para reposicionar o recorte.
 */
export function imagePlacement(l: Pick<Layer, 'w' | 'h' | 'fit' | 'zoom' | 'px' | 'py'>, iw: number, ih: number): { dx: number; dy: number; dw: number; dh: number } {
  if (!(iw > 0 && ih > 0)) return { dx: 0, dy: 0, dw: l.w, dh: l.h }
  const cover = l.fit === 'cover'
  const k = (cover ? Math.max(l.w / iw, l.h / ih) : Math.min(l.w / iw, l.h / ih)) * (cover ? (l.zoom ?? 1) : 1)
  const dw = iw * k, dh = ih * k
  return cover ? { dx: (l.w - dw) * (l.px ?? 0.5) + 0, dy: (l.h - dh) * (l.py ?? 0.5) + 0, dw, dh } : { dx: (l.w - dw) / 2, dy: (l.h - dh) / 2, dw, dh }
}

/** Reposiciona o recorte: mover a foto `ddx, ddy` px da peça para a direita/baixo. Devolve o novo foco (0–1), sem sair da moldura. */
export function panImage(l: Pick<Layer, 'w' | 'h' | 'fit' | 'zoom' | 'px' | 'py'>, iw: number, ih: number, ddx: number, ddy: number): { px: number; py: number } {
  const p = imagePlacement({ ...l, fit: 'cover' }, iw, ih)
  const sx = l.w - p.dw, sy = l.h - p.dh // negativos: quanto a foto passa da moldura
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return { px: sx < -0.5 ? clamp((l.px ?? 0.5) + ddx / sx) : 0.5, py: sy < -0.5 ? clamp((l.py ?? 0.5) + ddy / sy) : 0.5 }
}

/** Duplica a peça `page`: as cópias ficam na peça seguinte e as peças depois dela andam uma casa. Elementos de "todas as peças" não mudam. */
export function duplicatePageLayers(list: Layer[], page: number): Layer[] {
  const groups = new Map<string, string>()
  const copies = list.filter((l) => l.page === page).map((l) => {
    const c: Layer = { ...l, id: newLayerId(), page: page + 1 }
    if (l.group) { if (!groups.has(l.group)) groups.set(l.group, newLayerId()); c.group = groups.get(l.group) }
    return c
  })
  const shifted = list.map((l) => (l.page !== null && l.page > page ? { ...l, page: l.page + 1 } : l))
  return [...shifted, ...copies]
}

/** Exclui a peça `page`: seus elementos saem e as peças seguintes voltam uma casa. */
export function deletePageLayers(list: Layer[], page: number): Layer[] {
  return list.filter((l) => l.page !== page).map((l) => (l.page !== null && l.page > page ? { ...l, page: l.page - 1 } : l))
}

/** Quantas peças um design precisa para mostrar todos os elementos (o maior número de peça usado + 1). */
export const pagesNeeded = (list: Layer[]): number => list.reduce((n, l) => (l.page !== null ? Math.max(n, l.page + 1) : n), 1)
