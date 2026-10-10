// Campanhas recorrentes: cálculo das ocorrências e do plano de tarefas. Tudo em datas ISO "YYYY-MM-DD"
// (calendário local de São Paulo), sem horário: assim não existe problema de fuso nem de horário de verão.
import { addDays, formatBR, isIsoDate } from './dates.ts'
import type { Format, Stage } from './labels.ts'

export const FREQUENCIES = { weekly: 'Toda semana', biweekly: 'A cada 15 dias', monthly: 'Todo mês', dates: 'Datas específicas' } as const
export type Frequency = keyof typeof FREQUENCIES
export const isFrequency = (v: unknown): v is Frequency => typeof v === 'string' && Object.hasOwn(FREQUENCIES, v)

export const DOW_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const

export type Recurrence = {
  frequency: Frequency
  /** 0 = domingo … 6 = sábado (toda semana) */
  start_dow: number | null
  /** primeira ocorrência (a cada 15 dias) */
  anchor_date: string | null
  /** 1–31; em meses menores vale o último dia do mês (mensal) */
  day_of_month: number | null
  specific_dates: string[]
  /** quantos dias a campanha dura a partir do início */
  duration_days: number
  valid_from: string | null
  valid_to: string | null
}

export type Occurrence = { start: string; end: string }

export const MAX_DURATION = 31
export const MAX_RANGE_DAYS = 400
export const MAX_DATES = 60

export const dowOf = (iso: string): number => new Date(iso + 'T00:00:00Z').getUTCDay()
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5)
const daysInMonth = (year: number, month1: number): number => new Date(Date.UTC(year, month1, 0)).getUTCDate()

export function validateRecurrence(r: Recurrence): string | null {
  if (!isFrequency(r.frequency)) return 'Escolha a frequência.'
  if (!Number.isInteger(r.duration_days) || r.duration_days < 1 || r.duration_days > MAX_DURATION) return `A duração deve ficar entre 1 e ${MAX_DURATION} dias.`
  if (r.valid_from && !isIsoDate(r.valid_from)) return 'Início da vigência inválido.'
  if (r.valid_to && !isIsoDate(r.valid_to)) return 'Fim da vigência inválido.'
  if (r.valid_from && r.valid_to && r.valid_to < r.valid_from) return 'O fim da vigência é anterior ao início.'
  if (r.frequency === 'weekly' && (r.start_dow === null || !Number.isInteger(r.start_dow) || r.start_dow < 0 || r.start_dow > 6)) return 'Escolha o dia da semana em que a campanha começa.'
  if (r.frequency === 'biweekly' && !(r.anchor_date && isIsoDate(r.anchor_date))) return 'Informe a data da primeira ocorrência (a cada 15 dias conta a partir dela).'
  if (r.frequency === 'monthly' && (r.day_of_month === null || !Number.isInteger(r.day_of_month) || r.day_of_month < 1 || r.day_of_month > 31)) return 'Informe o dia do mês (1 a 31).'
  if (r.frequency === 'dates') {
    if (r.specific_dates.length === 0) return 'Informe pelo menos uma data.'
    if (r.specific_dates.length > MAX_DATES) return `No máximo ${MAX_DATES} datas por modelo.`
    if (!r.specific_dates.every(isIsoDate)) return 'Há uma data inválida na lista.'
  }
  return null
}

// Ocorrências cujo INÍCIO cai em [from, to]. Respeita a vigência. Determinística: a mesma regra e o mesmo intervalo dão sempre o mesmo resultado.
export function occurrencesBetween(r: Recurrence, from: string, to: string): Occurrence[] {
  if (validateRecurrence(r) || !isIsoDate(from) || !isIsoDate(to) || to < from) return []
  if (daysBetween(from, to) > MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS)
  const lo = r.valid_from && r.valid_from > from ? r.valid_from : from
  const hi = r.valid_to && r.valid_to < to ? r.valid_to : to
  if (hi < lo) return []

  const starts: string[] = []
  if (r.frequency === 'weekly') {
    for (let d = addDays(lo, (r.start_dow! - dowOf(lo) + 7) % 7); d <= hi; d = addDays(d, 7)) starts.push(d)
  } else if (r.frequency === 'biweekly') {
    const a = r.anchor_date!
    let d = a
    if (lo > a) d = addDays(a, Math.ceil(daysBetween(a, lo) / 14) * 14)
    for (; d <= hi; d = addDays(d, 14)) if (d >= lo) starts.push(d)
  } else if (r.frequency === 'monthly') {
    let y = Number(lo.slice(0, 4)), m = Number(lo.slice(5, 7))
    const endKey = hi.slice(0, 7)
    for (;;) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (key > endKey) break
      const day = Math.min(r.day_of_month!, daysInMonth(y, m))
      const d = `${key}-${String(day).padStart(2, '0')}`
      if (d >= lo && d <= hi) starts.push(d)
      m += 1
      if (m > 12) { m = 1; y += 1 }
    }
  } else {
    for (const d of [...new Set(r.specific_dates)].sort()) if (d >= lo && d <= hi) starts.push(d)
  }
  return starts.map((start) => ({ start, end: addDays(start, r.duration_days - 1) }))
}

// Chave de idempotência: modelo + filial + unidade + data de início. A mesma chave nunca gera duas instâncias.
export const generationKey = (templateId: string, brandId: string, branchId: string | null, start: string): string =>
  `${templateId}|${brandId}|${branchId ?? 'todas'}|${start}`

// ---------- plano de tarefas de cada ocorrência ----------
export type Deliverable = { format: Format; quantity: number; publish_offset_days: number }
export type PlannedPost = { title: string; format: Format; post_date: string; due_at: string }

export const MAX_POSTS_PER_OCCURRENCE = 30
const FORMAT_LABEL: Record<Format, string> = { feed: 'Feed', carrossel: 'Carrossel', reels: 'Reels' }

export function planPosts(name: string, occ: Occurrence, deliverables: Deliverable[], approvalDays: number): PlannedPost[] {
  const out: PlannedPost[] = []
  for (const d of deliverables) {
    for (let i = 1; i <= d.quantity; i++) {
      const post_date = addDays(occ.start, d.publish_offset_days)
      const suffix = d.quantity > 1 ? ` ${i}/${d.quantity}` : ''
      out.push({
        title: `${name} — ${formatBR(occ.start).slice(0, 5)} · ${FORMAT_LABEL[d.format]}${suffix}`.slice(0, 140),
        format: d.format, post_date, due_at: addDays(post_date, -approvalDays),
      })
    }
  }
  return out
}

export const RECONFIRM_LABEL = 'Reconfirmar produtos, preços, validade e estoque (nada vem da campanha anterior)'

export function planChecklist(occ: Occurrence, t: { briefing_days: number; creation_days: number; approval_days: number; checklist: string[] }): string[] {
  const at = (days: number) => formatBR(addDays(occ.start, -days)).slice(0, 5)
  return [
    `Briefing pronto até ${at(t.briefing_days)}`,
    `Peças criadas até ${at(t.creation_days)}`,
    `Enviar para aprovação até ${at(t.approval_days)}`,
    ...t.checklist,
    RECONFIRM_LABEL,
  ].map((s) => s.slice(0, 200))
}

// ---------- reconfirmação de ofertas ----------
// Conteúdo de uma campanha gerada automaticamente só segue para aprovação depois que uma pessoa reconfirmar os dados comerciais.
const RECONFIRM_GATED: Stage[] = ['aprovacao', 'aprovado', 'agendado', 'publicado']
export function reconfirmBlockedReason(to: Stage, instance: { status: string; reconfirmed_at: string | null } | null): string | null {
  if (!instance || instance.status !== 'generated' || instance.reconfirmed_at) return null
  if (!RECONFIRM_GATED.includes(to)) return null
  return 'Esta campanha foi gerada pelo modelo recorrente: reconfirme produtos, preços, validade e estoque na página da campanha antes de seguir.'
}

export function describeRecurrence(r: Recurrence): string {
  const dur = r.duration_days > 1 ? `, dura ${r.duration_days} dias` : ''
  if (r.frequency === 'weekly') {
    const dow = r.start_dow ?? 0
    return `${dow === 0 || dow === 6 ? 'Todo' : 'Toda'} ${DOW_NAMES[dow]}${dur}`
  }
  if (r.frequency === 'biweekly') return `A cada 15 dias desde ${r.anchor_date ? formatBR(r.anchor_date) : '—'}${dur}`
  if (r.frequency === 'monthly') return `Todo dia ${r.day_of_month}${dur}`
  return `${r.specific_dates.length} data${r.specific_dates.length === 1 ? '' : 's'} específica${r.specific_dates.length === 1 ? '' : 's'}${dur}`
}

// Lista de datas digitada à mão: "2026-12-24", "24/12/2026" ou "24/12/26", separadas por linha, vírgula ou ponto e vírgula.
export function parseDateList(text: string): { dates: string[]; invalid: string[] } {
  const dates: string[] = [], invalid: string[] = []
  for (const raw of text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
    let iso = raw
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw)
    if (m) iso = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    if (isIsoDate(iso)) dates.push(iso)
    else invalid.push(raw)
  }
  return { dates: [...new Set(dates)].sort(), invalid }
}
