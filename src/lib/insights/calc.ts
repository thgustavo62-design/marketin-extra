// Cálculos puros dos Insights (sem rede, sem banco): testáveis.
import { addDays } from '../domain/dates.ts'

export const PERIOD_DAYS = [7, 28, 90] as const
export type PeriodDays = (typeof PERIOD_DAYS)[number]
export const isPeriodDays = (n: number): n is PeriodDays => (PERIOD_DAYS as readonly number[]).includes(n)

export type Range = { from: string; to: string; prevFrom: string; prevTo: string; days: number }

// Termina ontem (o dado de hoje ainda está incompleto) e compara com o período imediatamente anterior, do mesmo tamanho.
export function periodRange(days: number, today: string): Range {
  const to = addDays(today, -1)
  const from = addDays(to, -(days - 1))
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(days - 1))
  return { from, to, prevFrom, prevTo, days }
}

export type Day = { date?: string } & Record<string, unknown>

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

export const sum = (rows: Day[], field: string): number => rows.reduce((s, r) => s + num(r[field]), 0)

// Uma linha por dia (somando contas), preenchendo dias sem dado com 0.
export function dailySeries(rows: Day[], field: string, from: string, to: string): { date: string; value: number }[] {
  const byDate = new Map<string, number>()
  for (const r of rows) if (r.date) byDate.set(r.date, (byDate.get(r.date) ?? 0) + num(r[field]))
  const out: { date: string; value: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, value: byDate.get(d) ?? 0 })
  return out
}

// Variação percentual contra o período anterior; sem base de comparação → null.
export function variation(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null
  return ((cur - prev) / prev) * 100
}

// "120,4 mil", "1,2 mi", "534" (como no Meta Business Suite).
export function compact(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  const fmt = (v: number, unit: string) => `${v.toFixed(1).replace('.', ',').replace(/,0$/, '')} ${unit}`
  if (a >= 1_000_000) return fmt(n / 1_000_000, 'mi')
  if (a >= 10_000) return fmt(n / 1_000, 'mil')
  return Math.round(n).toLocaleString('pt-BR')
}

export const formatVariation = (v: number | null): string => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}%`)

// Escolhe ~n rótulos igualmente espaçados para o eixo X.
export function tickIndexes(length: number, n = 5): number[] {
  if (length <= n) return Array.from({ length }, (_, i) => i)
  return Array.from({ length: n }, (_, i) => Math.round((i * (length - 1)) / (n - 1)))
}

// "11 de set", como no eixo do Meta.
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const shortDate = (iso: string): string => `${Number(iso.slice(8))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`

// Série diária de uma razão (ex.: CPM = gasto ÷ impressões × 1000); dia sem denominador vira 0.
export function ratioSeries(rows: Day[], num: string, den: string, from: string, to: string, mult = 1): { date: string; value: number }[] {
  const n = dailySeries(rows, num, from, to)
  const d = dailySeries(rows, den, from, to)
  return n.map((p, i) => ({ date: p.date, value: d[i].value > 0 ? (p.value / d[i].value) * mult : 0 }))
}

export const ratio = (num: number, den: number, mult = 1): number => (den > 0 ? (num / den) * mult : 0)
