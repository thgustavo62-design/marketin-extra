// Carrega os Insights do Windsor já filtrados por filial/unidade (servidor).
import { getIntegrationAccounts } from '../data'
import { addDays, todayISO } from '../domain/dates.ts'
import { partitionByScope, type BrandAliases } from '../integrations.ts'
import { windsorQuery, type WindsorResult } from '../windsor'
import { periodRange, type Day, type Range } from './calc.ts'

type ScopeIn = { brandId?: string; branchId?: string; brands: BrandAliases[] }

// A API do Instagram só entrega "novos seguidores por dia" dos últimos 30 dias; vai em consulta separada.
const FOLLOWERS_WINDOW_DAYS = 30

export const IG_FIELDS = [
  'account_name', 'date', 'views', 'views_followers', 'views_non_followers', 'reach', 'reach_followers', 'reach_non_followers',
  'total_interactions', 'accounts_engaged', 'likes', 'comments', 'shares', 'saves', 'replies', 'profile_links_taps',
]

export const MESSAGES_FIELD = 'actions_onsite_conversion_messaging_conversation_started_7d'
export const ADS_FIELDS = ['account_name', 'date', 'campaign', 'spend', 'impressions', 'link_clicks', MESSAGES_FIELD]

export type Insights =
  | {
      ok: true
      range: Range
      cur: Day[]
      prev: Day[]
      /** false = não foi possível carregar o período anterior; a tela mostra os totais sem variação. */
      canCompare: boolean
      /** avisos sobre limites da API (ex.: seguidores só dos últimos 30 dias) */
      notes: string[]
      unmapped: string[]
    }
  | { ok: false; result: Exclude<WindsorResult<never>, { status: 'ok' }>; range: Range }

async function load(kind: 'instagram' | 'ads', fields: string[], days: number, scope: ScopeIn): Promise<Insights> {
  const today = todayISO()
  const range = periodRange(days, today)
  const connector = kind === 'instagram' ? 'instagram' : 'facebook'

  const followersFrom = range.from < addDays(today, -(FOLLOWERS_WINDOW_DAYS - 1)) ? addDays(today, -(FOLLOWERS_WINDOW_DAYS - 1)) : range.from
  const [cur, prev, maps, followers] = await Promise.all([
    windsorQuery<Day>(connector, fields, { from: range.from, to: range.to }),
    windsorQuery<Day>(connector, fields, { from: range.prevFrom, to: range.prevTo }),
    getIntegrationAccounts(),
    kind === 'instagram' ? windsorQuery<Day>('instagram', ['account_name', 'date', 'follower_count', 'followers_count'], { from: followersFrom, to: range.to }) : Promise.resolve(null),
  ])
  // Sem o período atual não há o que mostrar (motivo explícito, nunca número parcial).
  if (cur.status !== 'ok') return { ok: false, result: cur, range }

  const notes: string[] = []
  const canCompare = prev.status === 'ok'
  if (!canCompare) notes.push('Não foi possível carregar o período anterior; os totais aparecem sem comparação.')

  const mapList = maps.map((m) => ({ account_name: m.account_name, kind: m.kind, brand_id: m.brand_id, branch_id: m.branch_id }))
  const ids = { brandId: scope.brandId, branchId: scope.branchId }
  type Row = Day & { account_name?: string }
  const part = (r: WindsorResult<Day> | null) =>
    r && r.status === 'ok' ? partitionByScope(r.rows as Row[], kind, mapList, scope.brands, ids) : { rows: [] as Row[], unmapped: [] as string[] }

  const a = part(cur)
  const b = part(prev)
  let curRows: Day[] = a.rows
  if (followers) {
    if (followers.status === 'ok') {
      // Acrescenta como linhas à parte (cada linha traz só o seu campo; a soma por campo continua correta).
      curRows = [...curRows, ...part(followers).rows]
      if (followersFrom > range.from) notes.push(`"Seguidores" cobre só os últimos ${FOLLOWERS_WINDOW_DAYS} dias (limite da API do Instagram) e não é comparado com o período anterior.`)
    } else {
      notes.push('Novos seguidores indisponíveis agora.')
    }
  }
  return { ok: true, range, cur: curRows, prev: b.rows, canCompare, notes, unmapped: [...new Set([...a.unmapped, ...b.unmapped])] }
}

export const loadInstagramInsights = (days: number, scope: ScopeIn) => load('instagram', IG_FIELDS, days, scope)
export const loadAdsInsights = (days: number, scope: ScopeIn) => load('ads', ADS_FIELDS, days, scope)

// Seguidores atuais = último valor informado por conta, somado.
export function currentFollowers(rows: Day[]): number | null {
  const last = new Map<string, { date: string; n: number }>()
  for (const r of rows as Array<Day & { account_name?: string; followers_count?: number }>) {
    if (typeof r.followers_count !== 'number' || !r.account_name) continue
    const prev = last.get(r.account_name)
    if (!prev || (r.date ?? '') >= prev.date) last.set(r.account_name, { date: r.date ?? '', n: r.followers_count })
  }
  return last.size ? [...last.values()].reduce((s, x) => s + x.n, 0) : null
}
