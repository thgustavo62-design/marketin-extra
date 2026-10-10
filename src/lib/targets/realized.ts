// Realizado de cada meta. Ordem de confiança: interno (banco) · Windsor ao vivo · último retrato guardado ("Histórico") · N/D.
// O histórico nunca é apresentado como dado atual, e valor ausente nunca vira zero.
import { getBrands, getIntegrationAccounts } from '../data'
import { pool } from '../db'
import { TARGET_METRICS, costPerConversation, monthRange, readTo, type MetricKey } from '../domain'
import { resolveAccount, type AccountKind, type Mapping } from '../integrations'
import { windsorQuery } from '../windsor'

export type Realized = { value: number | null; source: 'internal' | 'live' | 'history' | 'none'; asOf: string | null }
export type RealizedMap = Record<MetricKey, Realized>

const MESSAGES_FIELD = 'actions_onsite_conversion_messaging_conversation_started_7d'
type Row = { account_name?: string; date?: string } & Record<string, unknown>

const none: Realized = { value: null, source: 'none', asOf: null }
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
function sumOrNull(rows: Row[], f: string): number | null {
  let seen = false, t = 0
  for (const r of rows) { const n = num(r[f]); if (n !== null) { seen = true; t += n } }
  return seen ? t : null
}
// Seguidores = último valor de cada conta, somado.
function followersNow(rows: Row[]): number | null {
  const last = new Map<string, { d: string; n: number }>()
  for (const r of rows) { const n = num(r.followers_count); const k = r.account_name ?? ''; if (n === null || !k) continue; const p = last.get(k); if (!p || (r.date ?? '') >= p.d) last.set(k, { d: r.date ?? '', n }) }
  return last.size ? [...last.values()].reduce((s, x) => s + x.n, 0) : null
}

// Contagens do próprio sistema (calendário) no mês: planejados (sem cancelados) e publicados.
export async function internalCounts(brandId: string, branchId: string | null, month: string): Promise<{ planned: number; published: number }> {
  const range = monthRange(month)
  const r = (await pool.query(
    `select count(*) filter (where stage <> 'cancelado')::int as planned, count(*) filter (where stage = 'publicado')::int as published
       from posts where brand_id = $1 and ($2::uuid is null or branch_id = $2 or branch_id is null) and post_date between $3 and $4`, [brandId, branchId, range.from, range.to])).rows[0]
  return { planned: r.planned, published: r.published }
}

export async function loadRealized(opts: { brandId: string; branchId: string | null; month: string; today: string }): Promise<RealizedMap> {
  const { brandId, branchId, month, today } = opts
  const range = monthRange(month)
  const out = Object.fromEntries(Object.keys(TARGET_METRICS).map((k) => [k, none])) as RealizedMap

  // ---- interno ----
  const internal = await internalCounts(brandId, branchId, month)
  out.posts_planned = { value: internal.planned, source: 'internal', asOf: null }
  out.posts_published = { value: internal.published, source: 'internal', asOf: null }

  const [brands, maps] = await Promise.all([getBrands(), getIntegrationAccounts()])
  const mapList: Mapping[] = maps.map((m) => ({ account_name: m.account_name, kind: m.kind, brand_id: m.brand_id, branch_id: m.branch_id }))
  // Conta da filial: para meta de unidade só entram contas associadas àquela unidade.
  const mine = (name: string | undefined, kind: AccountKind) => {
    if (!name) return false
    const r = resolveAccount(name, kind, mapList, brands)
    return Boolean(r) && r!.brandId === brandId && (branchId === null || r!.branchId === branchId)
  }
  const to = readTo(month, today)
  if (month > today.slice(0, 7)) return out // mês futuro: nada a ler
  const slow = { timeoutMs: 30_000 }

  // ---- Instagram ----
  const ig = await windsorQuery<Row>('instagram', ['account_name', 'date', 'views', 'total_interactions', 'followers_count'], { from: range.from, to }, slow)
  if (ig.status === 'ok') {
    const rows = ig.rows.filter((r) => mine(r.account_name, 'instagram'))
    out.ig_views = { value: sumOrNull(rows, 'views'), source: 'live', asOf: null }
    out.ig_interactions = { value: sumOrNull(rows, 'total_interactions'), source: 'live', asOf: null }
    out.ig_followers = { value: followersNow(rows), source: 'live', asOf: null }
  }
  // ---- Anúncios ----
  const ads = await windsorQuery<Row>('facebook', ['account_name', 'date', 'spend', MESSAGES_FIELD], { from: range.from, to }, slow)
  if (ads.status === 'ok') {
    const rows = ads.rows.filter((r) => mine(r.account_name, 'ads'))
    const spend = sumOrNull(rows, 'spend'), conv = sumOrNull(rows, MESSAGES_FIELD)
    out.ads_spend = { value: spend, source: 'live', asOf: null }
    out.ads_conversations = { value: conv, source: 'live', asOf: null }
    out.ads_cost_per_conversation = { value: costPerConversation(spend, conv), source: 'live', asOf: null }
  }

  // ---- histórico: só para o que o Windsor não entregou agora ----
  if (ig.status !== 'ok' || ads.status !== 'ok') Object.assign(out, await historyRealized(brandId, branchId, month, { ig: ig.status !== 'ok', ads: ads.status !== 'ok' }))
  return out
}

// Último retrato guardado de cada conta no mês (coleta manual). Nunca é apresentado como dado de agora: source = 'history'.
export async function historyRealized(brandId: string, branchId: string | null, month: string, which: { ig: boolean; ads: boolean }): Promise<Partial<RealizedMap>> {
  const out: Partial<RealizedMap> = {}
  const range = monthRange(month)
  const snaps = (await pool.query(
    `select distinct on (kind, external_account_id) kind, account_name, branch_id, followers, views::float8 as views, interactions::float8 as interactions,
            spend::float8 as spend, conversations, collected_at::text as collected_at
       from account_metric_snapshots where brand_id = $1 and period_start = $2 order by kind, external_account_id, collected_at desc`, [brandId, range.from])).rows
  const pick = (kind: AccountKind) => snaps.filter((s) => s.kind === kind && (branchId === null || s.branch_id === branchId))
  const agg = (rows: Record<string, unknown>[], f: string): number | null => {
    let seen = false, t = 0
    for (const r of rows) { const n = num(r[f]); if (n !== null) { seen = true; t += n } }
    return seen ? t : null
  }
  const asOf = (rows: { collected_at: string }[]) => (rows.length ? rows.map((r) => r.collected_at).sort().at(-1)! : null)
  if (which.ig) {
    const rows = pick('instagram')
    const set = (k: MetricKey, v: number | null) => { if (v !== null) out[k] = { value: v, source: 'history', asOf: asOf(rows) } }
    set('ig_views', agg(rows, 'views')); set('ig_interactions', agg(rows, 'interactions')); set('ig_followers', agg(rows, 'followers'))
  }
  if (which.ads) {
    const rows = pick('ads')
    const spend = agg(rows, 'spend'), conv = agg(rows, 'conversations')
    const set = (k: MetricKey, v: number | null) => { if (v !== null) out[k] = { value: v, source: 'history', asOf: asOf(rows) } }
    set('ads_spend', spend); set('ads_conversations', conv); set('ads_cost_per_conversation', costPerConversation(spend, conv))
  }
  return out
}
