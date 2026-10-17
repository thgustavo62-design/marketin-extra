// Guias do editor (linhas de apoio, só na tela). Puro e testado.
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, type PromoFormat } from './promo.ts'

export type Guide = { axis: 'x' | 'y'; v: number }
export type Guides = Record<PromoFormat, Guide[]>
export const MAX_GUIDES = 20
export const emptyGuides = (): Guides => ({ story: [], feed: [], a4: [] })

/** Aceita só guias dentro da peça, sem repetir e até 20 por formato. */
export function normalizeGuides(raw: unknown): Guides {
  const out = emptyGuides()
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  for (const f of PROMO_FORMAT_KEYS) {
    const { w, h } = PROMO_FORMATS[f]
    const seen = new Set<string>()
    for (const g of Array.isArray(r[f]) ? (r[f] as unknown[]) : []) {
      const o = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>
      const v = Math.round(Number(o.v))
      if ((o.axis !== 'x' && o.axis !== 'y') || !Number.isFinite(v) || v < 0 || v > (o.axis === 'x' ? w : h)) continue
      const k = `${o.axis}${v}`
      if (seen.has(k)) continue
      seen.add(k); out[f].push({ axis: o.axis, v })
      if (out[f].length >= MAX_GUIDES) break
    }
  }
  return out
}

/** Soma uma guia à lista (sem repetir e respeitando o limite). */
export function addGuide(list: Guide[], g: Guide): Guide[] {
  if (list.length >= MAX_GUIDES || list.some((x) => x.axis === g.axis && x.v === g.v)) return list
  return [...list, g]
}

/** Guias como retângulos de largura/altura zero, para o ímã tratá-las como as bordas de outros elementos. */
export function guideRects(list: Guide[], W: number, H: number): { x: number; y: number; w: number; h: number }[] {
  return list.map((g) => (g.axis === 'x' ? { x: g.v, y: 0, w: 0, h: H } : { x: 0, y: g.v, w: W, h: 0 }))
}
