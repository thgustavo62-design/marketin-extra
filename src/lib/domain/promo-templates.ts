// Modelos de design: categorias e campos de texto editáveis ao criar a partir do modelo. Puro e testado.
import { PROMO_FORMAT_KEYS } from './promo.ts'
import type { Layers } from './promo-layers.ts'

export const TEMPLATE_CATEGORIES = [
  { id: 'promocao', label: 'Promoção' },
  { id: 'institucional', label: 'Institucional' },
  { id: 'bebe', label: 'Bebê' },
  { id: 'limpeza', label: 'Limpeza' },
  { id: 'cupom', label: 'Cupom e clube' },
  { id: 'outro', label: 'Outro' },
] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]['id']
export const isTemplateCategory = (v: unknown): v is TemplateCategory => typeof v === 'string' && TEMPLATE_CATEGORIES.some((c) => c.id === v)
export const templateCategoryLabel = (id: string): string => TEMPLATE_CATEGORIES.find((c) => c.id === id)?.label ?? 'Outro'

export const MAX_TEMPLATE_FIELDS = 12
export type TemplateField = { id: string; text: string; page: number | null; format: string }

/** Os textos do modelo que a pessoa pode trocar ao criar o design (na ordem das peças; textos vazios e ocultos ficam de fora). */
export function templateFields(layers: Layers): TemplateField[] {
  const out: TemplateField[] = []
  for (const f of PROMO_FORMAT_KEYS) {
    for (const l of [...layers[f]].sort((a, b) => (a.page ?? -1) - (b.page ?? -1))) {
      if (l.type === 'text' && !l.hidden && (l.text ?? '').trim()) out.push({ id: l.id, text: l.text ?? '', page: l.page, format: f })
    }
  }
  return out.slice(0, MAX_TEMPLATE_FIELDS)
}

/** Troca o texto dos elementos de texto pelos novos valores (só ids existentes; vazio mantém o original; máx. 300 letras). */
export function applyTemplateTexts(layers: Layers, texts: Record<string, unknown>): Layers {
  const out = { ...layers }
  for (const f of PROMO_FORMAT_KEYS) {
    out[f] = layers[f].map((l) => {
      const v = Object.hasOwn(texts, l.id) ? texts[l.id] : undefined
      return l.type === 'text' && typeof v === 'string' && v.trim() ? { ...l, text: v.slice(0, 300) } : l
    })
  }
  return out
}
