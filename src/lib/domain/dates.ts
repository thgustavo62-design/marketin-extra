// Datas como texto ISO "YYYY-MM-DD" (sem fuso) e grade do calendário.
// ---------- datas ----------
const ISO = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function todayISO(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function parseMonth(v: string | undefined, fallback: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? '')
  const src = m ? v! : fallback.slice(0, 7)
  const [y, mo] = src.split('-').map(Number)
  return mo >= 1 && mo <= 12 ? { year: y, month: mo } : parseMonth(undefined, fallback)
}

export function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

export const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export type Cell = { iso: string; day: number; inMonth: boolean }

// Semanas começando na segunda-feira.
export function monthGrid(year: number, month: number): Cell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const total = Math.ceil((offset + daysInMonth) / 7) * 7
  const start = first.toISOString().slice(0, 10)
  const cells: Cell[] = []
  for (let i = 0; i < total; i++) {
    const iso = addDays(start, i - offset)
    cells.push({ iso, day: Number(iso.slice(8)), inMonth: iso.slice(0, 7) === `${year}-${String(month).padStart(2, '0')}` })
  }
  const weeks: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function formatBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
