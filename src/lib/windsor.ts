// Cliente do Windsor.ai (servidor). A chave nunca vai ao navegador.
// Importante: no plano gratuito (1 conta) o Windsor, ao haver mais contas conectadas,
// devolve texto de aviso no lugar dos dados ("These are not your real numbers"). Detectamos isso
// e NÃO mostramos número nenhum nesse caso.

const BASE = 'https://connectors.windsor.ai'

export type WindsorResult<T> =
  | { status: 'ok'; rows: T[] }
  | { status: 'not_configured' }
  | { status: 'paused'; message: string }
  | { status: 'no_accounts'; message: string }
  | { status: 'error'; message: string }

const PAUSED_MARKER = /not your real numbers|reads are paused/i

export function classifyWindsorPayload<T extends Record<string, unknown>>(payload: unknown): WindsorResult<T> {
  if (!payload || typeof payload !== 'object') return { status: 'error', message: 'Resposta inesperada do Windsor.' }
  const p = payload as { error?: string; code?: string; data?: T[] }
  if (p.code === 'no_accounts_configured') return { status: 'no_accounts', message: String(p.error ?? '') }
  if (p.error) return { status: 'error', message: String(p.error) }
  const rows = Array.isArray(p.data) ? p.data : []
  const flagged = rows.find((r) => Object.values(r).some((v) => typeof v === 'string' && PAUSED_MARKER.test(v)))
  if (flagged) {
    const msg = Object.values(flagged).find((v) => typeof v === 'string' && PAUSED_MARKER.test(v)) as string
    return { status: 'paused', message: msg }
  }
  return { status: 'ok', rows }
}

// Período: um preset do Windsor ("last_30d") ou um intervalo explícito (necessário p/ comparar com o período anterior).
export type Period = string | { from: string; to: string }

export async function windsorQuery<T extends Record<string, unknown>>(
  connector: 'instagram' | 'facebook' | 'all',
  fields: string[],
  period: Period,
): Promise<WindsorResult<T>> {
  const key = process.env.WINDSOR_API_KEY
  if (!key) return { status: 'not_configured' }
  const u = new URL(`${BASE}/${connector}`)
  if (typeof period === 'string') u.searchParams.set('date_preset', period)
  else {
    u.searchParams.set('date_from', period.from)
    u.searchParams.set('date_to', period.to)
  }
  u.searchParams.set('fields', fields.join(','))
  u.searchParams.set('api_key', key)
  try {
    const res = await fetch(u, { next: { revalidate: 300 }, signal: AbortSignal.timeout(12_000) })
    return classifyWindsorPayload<T>(await res.json())
  } catch (e) {
    // Nunca incluir a URL (tem a chave) na mensagem.
    return { status: 'error', message: e instanceof Error ? e.name : 'Falha ao consultar o Windsor.' }
  }
}

export const DATE_PRESETS = {
  last_7d: 'Últimos 7 dias',
  last_30d: 'Últimos 30 dias',
  last_90d: 'Últimos 90 dias',
  this_month: 'Este mês',
  last_month: 'Mês passado',
} as const
export type DatePreset = keyof typeof DATE_PRESETS
export const isDatePreset = (v: unknown): v is DatePreset => typeof v === 'string' && Object.hasOwn(DATE_PRESETS, v)

// ----- indicadores de anúncios -----
export type AdRow = { account_name?: string; campaign?: string; date?: string; spend?: number; clicks?: number; impressions?: number; conversions?: number }

export type AdTotals = { spend: number; clicks: number; impressions: number; conversions: number; ctr: number | null; cpc: number | null; cpm: number | null; cpa: number | null }

export function sumAds(rows: AdRow[]): AdTotals {
  const t = { spend: 0, clicks: 0, impressions: 0, conversions: 0 }
  for (const r of rows) {
    t.spend += Number(r.spend) || 0
    t.clicks += Number(r.clicks) || 0
    t.impressions += Number(r.impressions) || 0
    t.conversions += Number(r.conversions) || 0
  }
  return {
    ...t,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
    cpc: t.clicks > 0 ? t.spend / t.clicks : null,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    cpa: t.conversions > 0 ? t.spend / t.conversions : null,
  }
}

export const brl = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const int = (n: number | null): string => (n === null ? '—' : n.toLocaleString('pt-BR'))
export const pct = (n: number | null): string => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)
