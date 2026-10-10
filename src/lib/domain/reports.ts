// Regras puras dos relatórios: períodos, chave de idempotência, observações calculadas e texto seguro para PDF.
import { addDays, formatBR, isIsoDate } from './dates.ts'
import type { Group } from './publication-metrics.ts'

export const REPORT_TYPES = { operacional: 'Operacional', resultados: 'Resultados', executivo: 'Executivo' } as const
export type ReportType = keyof typeof REPORT_TYPES
export const isReportType = (v: unknown): v is ReportType => typeof v === 'string' && Object.hasOwn(REPORT_TYPES, v)

export const MAX_REPORT_DAYS = 93

export type Period = { from: string; to: string }

// Segunda a domingo da semana que contém a data.
export function weekOf(iso: string): Period {
  const dow = (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7 // 0 = segunda
  const from = addDays(iso, -dow)
  return { from, to: addDays(from, 6) }
}

export function monthOf(iso: string): Period {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7))
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${iso.slice(0, 7)}-01`, to: `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}` }
}

export function validatePeriod(p: Period): string | null {
  if (!isIsoDate(p.from) || !isIsoDate(p.to)) return 'Informe o início e o fim do período.'
  if (p.to < p.from) return 'O fim do período é anterior ao início.'
  const days = Math.round((Date.parse(p.to + 'T00:00:00Z') - Date.parse(p.from + 'T00:00:00Z')) / 864e5) + 1
  if (days > MAX_REPORT_DAYS) return `O período passa de ${MAX_REPORT_DAYS} dias. Gere relatórios menores (semanal ou mensal).`
  return null
}

export type ReportFilters = { format?: string; campaignId?: string }

// Mesmo tipo + filial + unidade + período + filtros no mesmo dia = o mesmo relatório (reprocessar não duplica).
export function reportKey(type: ReportType, brandId: string, branchId: string | null, p: Period, f: ReportFilters, day: string): string {
  return [type, brandId, branchId ?? 'todas', p.from, p.to, f.format ?? '-', f.campaignId ?? '-', day].join('|')
}

export const periodLabel = (p: Period): string => `${formatBR(p.from)} a ${formatBR(p.to)}`

// ---------- observações calculadas (o "aprendizado" só existe quando há dado para sustentá-lo) ----------
export type ObservationInput = {
  planned: number; overdue: number; published: number
  engagementByFormat: Group[]
  goalsBehind: { label: string; realized: number; target: number }[]
}

const pct = (n: number) => n.toFixed(2).replace('.', ',') + '%'

export function buildObservations(i: ObservationInput): string[] {
  const out: string[] = []
  if (i.planned > 0) {
    out.push(i.overdue > 0
      ? `${i.overdue} de ${i.planned} conteúdos do período estão atrasados (data de publicação vencida e ainda em andamento).`
      : `Nenhum dos ${i.planned} conteúdos do período está atrasado; ${i.published} já foram publicados.`)
  }
  const enough = i.engagementByFormat.filter((g) => g.enough && g.median !== null).sort((a, b) => (b.median ?? 0) - (a.median ?? 0))
  if (enough.length >= 2) {
    const a = enough[0], b = enough[enough.length - 1]
    out.push(`Entre publicações com 7+ dias, a mediana de engajamento foi maior em ${a.key} (${pct(a.median!)}, n=${a.n}) do que em ${b.key} (${pct(b.median!)}, n=${b.n}). É uma comparação descritiva: não indica causa e depende de tema, horário e público.`)
  } else if (i.engagementByFormat.length > 0) {
    out.push('Ainda não há publicações maduras suficientes por formato (mínimo de 3 em cada) para comparar engajamento.')
  }
  for (const g of i.goalsBehind.slice(0, 1)) {
    out.push(`Meta "${g.label}": realizado ${g.realized.toLocaleString('pt-BR')} de ${g.target.toLocaleString('pt-BR')} no período.`)
  }
  return out.slice(0, 3)
}

// ---------- texto seguro para PDF (fontes padrão só codificam Latin-1 + alguns símbolos) ----------
const REPLACE: Record<string, string> = {
  '−': '-', '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '•': '-', ' ': ' ',
}

export function pdfSafe(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC')) {
    if (REPLACE[ch] !== undefined) { out += REPLACE[ch]; continue }
    const c = ch.codePointAt(0)!
    if (c === 10 || c === 13 || c === 9) { out += ' '; continue }
    out += c >= 32 && c <= 126 ? ch : c >= 160 && c <= 255 ? ch : ''
  }
  return out
}
