// Kit de marca por filial: validação pura (testada). Logos ficam na biblioteca de imagens.
import { isPromoFont } from './promo-fonts.ts'

export type KitColor = { name: string; hex: string }
export type KitText = { label: string; text: string }
export type BrandKit = { colors: KitColor[]; fonts: string[]; texts: KitText[] }
export const MAX_KIT_COLORS = 12
export const MAX_KIT_FONTS = 6
export const MAX_KIT_TEXTS = 12
export const emptyKit = (): BrandKit => ({ colors: [], fonts: [], texts: [] })

const HEX = /^#[0-9a-f]{6}$/i
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Aceita só cores #rrggbb com nome, fontes do catálogo, textos com rótulo; sem repetir; respeita os limites. */
export function normalizeKit(raw: unknown): BrandKit {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const colors: KitColor[] = []
  for (const c of Array.isArray(r.colors) ? r.colors : []) {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    const hex = typeof o.hex === 'string' && HEX.test(o.hex) ? o.hex.toLowerCase() : null
    if (hex && !colors.some((x) => x.hex === hex)) colors.push({ name: clean(o.name, 24) || hex, hex })
    if (colors.length >= MAX_KIT_COLORS) break
  }
  const fonts = [...new Set((Array.isArray(r.fonts) ? r.fonts : []).filter(isPromoFont))].slice(0, MAX_KIT_FONTS)
  const texts: KitText[] = []
  for (const t of Array.isArray(r.texts) ? r.texts : []) {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
    const text = clean(o.text, 200)
    if (text) texts.push({ label: clean(o.label, 30) || text.slice(0, 30), text })
    if (texts.length >= MAX_KIT_TEXTS) break
  }
  return { colors, fonts, texts }
}
