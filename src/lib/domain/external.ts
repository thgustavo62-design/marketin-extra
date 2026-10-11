// Leitura (pura) das respostas das fontes abertas. Resposta inesperada vira erro claro, nunca dado inventado.

export type HolidayRow = { date: string; name: string; kind: string }

/** BrasilAPI /feriados/v1/{ano}: [{ date, name, type }] */
export function parseHolidays(payload: unknown): { ok: true; rows: HolidayRow[] } | { ok: false; error: string } {
  if (!Array.isArray(payload)) return { ok: false, error: 'Resposta inesperada da BrasilAPI (feriados).' }
  const rows: HolidayRow[] = []
  for (const r of payload as Record<string, unknown>[]) {
    if (typeof r?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || typeof r.name !== 'string') continue
    rows.push({ date: r.date, name: r.name.slice(0, 120), kind: typeof r.type === 'string' ? r.type : 'national' })
  }
  return rows.length ? { ok: true, rows } : { ok: false, error: 'A BrasilAPI não devolveu nenhum feriado.' }
}

// ---------- IBGE / SIDRA (tabela 7060, IPCA) ----------
export const IPCA_CATEGORIES = { '7169': 'geral', '7660': 'saude', '7661': 'farmaceuticos' } as const
export type IpcaCategory = (typeof IPCA_CATEGORIES)[keyof typeof IPCA_CATEGORIES]
export const IPCA_LABEL: Record<IpcaCategory, string> = { geral: 'Índice geral', saude: 'Saúde e cuidados pessoais', farmaceuticos: 'Produtos farmacêuticos e óticos' }

export type IpcaPoint = { period: string; category: IpcaCategory; value: number }

/** Resposta do SIDRA para uma variável: série "AAAAMM" → "valor" por categoria. */
export function parseSidra(payload: unknown): { ok: true; points: IpcaPoint[] } | { ok: false; error: string } {
  const first = Array.isArray(payload) ? (payload[0] as { resultados?: unknown[] } | undefined) : undefined
  if (!first || !Array.isArray(first.resultados)) return { ok: false, error: 'Resposta inesperada do IBGE (IPCA).' }
  const points: IpcaPoint[] = []
  for (const res of first.resultados as { classificacoes?: { categoria?: Record<string, string> }[]; series?: { serie?: Record<string, string> }[] }[]) {
    const catId = Object.keys(res.classificacoes?.[0]?.categoria ?? {})[0]
    const cat = (IPCA_CATEGORIES as Record<string, IpcaCategory>)[catId]
    if (!cat) continue
    for (const [ym, raw] of Object.entries(res.series?.[0]?.serie ?? {})) {
      const v = Number(raw)
      if (/^\d{6}$/.test(ym) && raw !== '...' && raw !== '-' && Number.isFinite(v)) points.push({ period: `${ym.slice(0, 4)}-${ym.slice(4)}`, category: cat, value: v })
    }
  }
  return points.length ? { ok: true, points } : { ok: false, error: 'O IBGE não devolveu valores de IPCA.' }
}

export type IpcaRow = { period: string; category: IpcaCategory; monthly: number | null; accumulated12: number | null }

/** Junta a variação mensal (var. 63) e a acumulada em 12 meses (var. 2265) numa linha por mês e categoria. */
export function mergeIpca(monthly: IpcaPoint[], acc12: IpcaPoint[]): IpcaRow[] {
  const m = new Map<string, IpcaRow>()
  const get = (p: IpcaPoint) => { const k = `${p.period}|${p.category}`; if (!m.has(k)) m.set(k, { period: p.period, category: p.category, monthly: null, accumulated12: null }); return m.get(k)! }
  for (const p of monthly) get(p).monthly = p.value
  for (const p of acc12) get(p).accumulated12 = p.value
  return [...m.values()].sort((a, b) => a.period.localeCompare(b.period) || a.category.localeCompare(b.category))
}

export const ipcaPeriodLabel = (ym: string): string => `${ym.slice(5)}/${ym.slice(0, 4)}`
