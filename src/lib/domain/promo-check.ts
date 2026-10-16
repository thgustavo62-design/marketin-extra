// "Verificar arte": conferência da promoção antes de aprovar/exportar. Puro e testado.
// Só bloqueia o que é erro de dado (preço ou nome inválido). O resto pede revisão humana: não afirma conformidade nem julga estética.
import { checkAdvertising } from './advertising.ts'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, paginateSections, type PromoFormat, type ThemeConfig } from './promo.ts'
import type { Layers } from './promo-layers.ts'

export type CheckSeverity = 'bloqueio' | 'revisao' | 'info'
export type CheckIssue = {
  severity: CheckSeverity
  code: string
  message: string
  /** encarte relacionado (para abrir direto no editor) */ itemId?: string
  /** elemento livre relacionado */ layerId?: string; format?: PromoFormat
}
export type CheckInput = {
  items: { id: string; name: string; price: number; ean: string | null; photo_id: string | null }[]
  layers: Layers
  validity: string | null
  /** quantas peças cada formato tem (para achar elemento preso a uma peça que não existe) */ pageCount: Partial<Record<PromoFormat, number>>
}

export const SEVERITY_LABEL: Record<CheckSeverity, string> = { bloqueio: 'Corrigir antes de aprovar', revisao: 'Revisão recomendada', info: 'Informação' }

export function checkPromotion(o: CheckInput): CheckIssue[] {
  const out: CheckIssue[] = []
  const push = (i: CheckIssue) => out.push(i)

  // ---- encartes (dados)
  const seenEan = new Map<string, string>()
  for (const it of o.items) {
    const nome = it.name.trim() || 'sem nome'
    if (!it.name.trim()) push({ severity: 'bloqueio', code: 'sem-nome', itemId: it.id, message: 'Encarte sem nome.' })
    if (!Number.isFinite(it.price) || it.price <= 0) push({ severity: 'bloqueio', code: 'preco-invalido', itemId: it.id, message: `"${nome}": preço ausente ou zerado.` })
    else if (it.price >= 10000) push({ severity: 'revisao', code: 'preco-alto', itemId: it.id, message: `"${nome}": preço acima de R$ 10.000, confira a vírgula.` })
    if (!it.photo_id) push({ severity: 'revisao', code: 'sem-foto', itemId: it.id, message: `"${nome}": sem foto (sai com a caixa "SEM FOTO").` })
    if (it.name.trim().length > 70) push({ severity: 'info', code: 'nome-longo', itemId: it.id, message: `"${nome.slice(0, 40)}…": nome longo, a letra diminui para caber.` })
    if (it.ean) {
      const prev = seenEan.get(it.ean)
      if (prev) push({ severity: 'revisao', code: 'ean-repetido', itemId: it.id, message: `"${nome}": o mesmo código de barras aparece em mais de um encarte.` })
      else seenEan.set(it.ean, it.id)
    }
  }
  if (o.items.length && !(o.validity ?? '').trim()) push({ severity: 'revisao', code: 'sem-validade', message: 'A validade da promoção não foi informada (aba Textos). Confirme se a arte já traz as datas.' })

  // ---- elementos livres
  for (const f of PROMO_FORMAT_KEYS) {
    const { w: W, h: H } = PROMO_FORMATS[f]
    const pages = o.pageCount[f] ?? 1
    for (const l of o.layers[f]) {
      if (l.hidden) continue
      const base = { layerId: l.id, format: f }
      const nome = l.type === 'text' ? `texto "${(l.text ?? '').slice(0, 24)}"` : l.type === 'image' ? 'imagem' : 'forma'
      const where = `${PROMO_FORMATS[f].label.split(' ')[0]}`
      const outside = l.x + l.w <= 0 || l.y + l.h <= 0 || l.x >= W || l.y >= H
      if (outside) push({ ...base, severity: 'revisao', code: 'fora-da-peca', message: `${where}: ${nome} está totalmente fora da peça e não aparece na arte.` })
      else if (l.x < -2 || l.y < -2 || l.x + l.w > W + 2 || l.y + l.h > H + 2) push({ ...base, severity: 'info', code: 'cortado', message: `${where}: ${nome} passa da borda e será cortado.` })
      if (l.page !== null && l.page >= pages) push({ ...base, severity: 'info', code: 'peca-inexistente', message: `${where}: ${nome} está preso à peça ${l.page + 1}, que não existe mais.` })
      if (l.type === 'text') {
        if (!(l.text ?? '').trim()) push({ ...base, severity: 'revisao', code: 'texto-vazio', message: `${where}: há um texto vazio na peça.` })
        else if ((l.size ?? 64) < 14) push({ ...base, severity: 'info', code: 'texto-pequeno', message: `${where}: ${nome} com letra menor que 14 px, difícil de ler.` })
      }
      if (l.opacity < 0.2) push({ ...base, severity: 'info', code: 'quase-invisivel', message: `${where}: ${nome} com opacidade menor que 20%.` })
    }
  }

  // ---- texto de publicidade (RDC 96/2008): só apoio à revisão
  const texts = [...o.items.map((i) => i.name), ...PROMO_FORMAT_KEYS.flatMap((f) => o.layers[f].filter((l) => l.type === 'text' && !l.hidden).map((l) => l.text ?? ''))].join('\n')
  const ad = checkAdvertising(texts)
  for (const i of ad.issues) {
    if (i.level === 'lembrete') continue
    push({ severity: 'revisao', code: `publicidade-${i.code}`, message: `${i.level === 'vedado' ? 'Possível termo vedado' : 'Publicidade'} (${i.article}): ${i.message}${i.excerpt ? ` “${i.excerpt}”` : ''} Revisão do responsável técnico.` })
  }

  const order: Record<CheckSeverity, number> = { bloqueio: 0, revisao: 1, info: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}

export function summarizeCheck(issues: CheckIssue[]): { bloqueio: number; revisao: number; info: number } {
  return { bloqueio: issues.filter((i) => i.severity === 'bloqueio').length, revisao: issues.filter((i) => i.severity === 'revisao').length, info: issues.filter((i) => i.severity === 'info').length }
}

/** Quantas peças cada formato tem com a grade do tema (a mesma conta do editor). */
export function pageCountsFor(items: { section: string | null }[], cfg: ThemeConfig | null): Partial<Record<PromoFormat, number>> {
  if (!cfg) return {}
  const out: Partial<Record<PromoFormat, number>> = {}
  for (const f of PROMO_FORMAT_KEYS) { const g = cfg.grid[f]; out[f] = Math.max(1, paginateSections(items, g.cols * g.rows, cfg.breakBySection[f]).length) }
  return out
}
