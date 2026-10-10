// Coleta MANUAL de métricas (Instagram + anúncios) para o banco. A tela de resultados continua lendo do Windsor ao vivo;
// o banco guarda o histórico para (1) ligar publicações a conteúdos, (2) comparar com o tempo e (3) servir de "último dado"
// quando o Windsor falha. Regras: se a leitura principal falhar NADA é gravado nem apagado; valor ausente nunca vira zero
// e nunca sobrescreve um valor já coletado no mesmo dia.
import { getBrands, getIntegrationAccounts, lastCollection } from '../data'
import { withTx } from '../db'
import { addDays, monthRange, parseMediaRow, readTo, type ParsedMedia, type WindsorMediaRow } from '../domain'
import { resolveAccount, type AccountKind, type Mapping } from '../integrations'
import { windsorQuery, type WindsorResult } from '../windsor'

export const MIN_MINUTES_BETWEEN = 5
const MEDIA_DAYS = 90
const MEDIA_FIELDS = [
  'account_name', 'account_id', 'media_id', 'media_type', 'media_product_type', 'timestamp', 'media_permalink', 'media_caption',
  'media_reach', 'media_views', 'media_like_count', 'media_comments_count', 'media_saved', 'media_shares', 'media_reel_total_interactions',
]
const MESSAGES_FIELD = 'actions_onsite_conversion_messaging_conversation_started_7d'

export type CollectResult =
  | {
      ok: true
      publications: number; newPublications: number; snapshots: number; accounts: number
      unmapped: string[]; notes: string[]; skippedBrands: string[]
    }
  | { ok: false; error: string; reason: 'rate_limited' | 'windsor' }

type AcctRow = { account_name?: string; account_id?: string | number; date?: string; views?: unknown; total_interactions?: unknown; followers_count?: unknown; spend?: unknown } & Record<string, unknown>

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
// Soma só dos valores presentes; sem nenhum valor presente o resultado é N/D (null), não zero.
function sumOrNull(rows: AcctRow[], field: string): number | null {
  let seen = false, total = 0
  for (const r of rows) { const n = numOrNull(r[field]); if (n !== null) { seen = true; total += n } }
  return seen ? total : null
}
function lastOrNull(rows: AcctRow[], field: string): number | null {
  let best: { d: string; n: number } | null = null
  for (const r of rows) { const n = numOrNull(r[field]); if (n !== null && (!best || (r.date ?? '') >= best.d)) best = { d: r.date ?? '', n } }
  return best ? best.n : null
}
const groupBy = <T,>(rows: T[], key: (t: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>()
  for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]) }
  return m
}

export async function collectMetrics(opts: { brandIds: string[]; actorId: string; today: string }): Promise<CollectResult> {
  const [allBrands, maps] = await Promise.all([getBrands(), getIntegrationAccounts()])
  const mapList: Mapping[] = maps.map((m) => ({ account_name: m.account_name, kind: m.kind, brand_id: m.brand_id, branch_id: m.branch_id }))

  // Limite de uso da API: no máximo uma coleta por filial a cada poucos minutos.
  const allowed = new Set<string>(), skippedBrands: string[] = []
  for (const id of opts.brandIds) {
    const last = await lastCollection([id])
    const name = allBrands.find((b) => b.id === id)?.name ?? id
    if (last && Date.now() - Date.parse(last) < MIN_MINUTES_BETWEEN * 60_000) skippedBrands.push(name)
    else allowed.add(id)
  }
  if (allowed.size === 0) {
    return { ok: false, error: `Já houve uma coleta há menos de ${MIN_MINUTES_BETWEEN} minutos para ${skippedBrands.join(' e ') || 'este recorte'}. Aguarde um pouco para não gastar a cota do Windsor à toa.`, reason: 'rate_limited' }
  }

  const month = opts.today.slice(0, 7)
  const range = monthRange(month)
  const to = readTo(month, opts.today)
  const fresh = { timeoutMs: 45_000, fresh: true }
  const [media, igAcc, ads] = await Promise.all([
    windsorQuery<WindsorMediaRow & Record<string, unknown>>('instagram', MEDIA_FIELDS, { from: addDays(opts.today, -(MEDIA_DAYS - 1)), to: opts.today }, fresh),
    windsorQuery<AcctRow>('instagram', ['account_name', 'account_id', 'date', 'views', 'total_interactions', 'followers_count'], { from: range.from, to }, fresh),
    windsorQuery<AcctRow>('facebook', ['account_name', 'account_id', 'date', 'spend', MESSAGES_FIELD], { from: range.from, to }, fresh),
  ])
  // Sem a leitura principal não se grava nada: o histórico existente continua como está.
  if (media.status !== 'ok') return { ok: false, error: failureText(media), reason: 'windsor' }

  const notes: string[] = []
  if (igAcc.status !== 'ok') notes.push('Totais da conta do Instagram indisponíveis nesta coleta (as metas continuam com o último dado guardado).')
  if (ads.status !== 'ok') notes.push('Dados de anúncios indisponíveis nesta coleta (as metas continuam com o último dado guardado).')

  const unmapped = new Set<string>()
  const resolve = (name: string, kind: AccountKind) => {
    const r = resolveAccount(name, kind, mapList, allBrands)
    if (!r) { unmapped.add(name); return null }
    return allowed.has(r.brandId) ? r : null
  }

  // ---- publicações ----
  const parsed = new Map<string, { p: ParsedMedia; brandId: string; branchId: string | null }>()
  for (const row of media.rows) {
    const p = parseMediaRow(row)
    if (!p) continue
    const r = resolve(p.account_name, 'instagram')
    if (!r) continue
    const key = `${p.external_account_id}|${p.external_media_id}`
    if (!parsed.has(key)) parsed.set(key, { p, brandId: r.brandId, branchId: r.branchId })
  }

  let newPublications = 0, snapshots = 0, accounts = 0
  await withTx(async (db) => {
    for (const { p, brandId, branchId } of parsed.values()) {
      const pub = (await db.query(
        `insert into external_publications (brand_id, branch_id, platform, external_account_id, account_name, external_media_id, permalink, media_type, media_product_type, caption_excerpt, published_at)
         values ($1, $2, 'instagram', $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (platform, external_account_id, external_media_id) do update set
           last_seen_at = now(), account_name = excluded.account_name,
           permalink = coalesce(excluded.permalink, external_publications.permalink),
           caption_excerpt = coalesce(excluded.caption_excerpt, external_publications.caption_excerpt),
           published_at = coalesce(excluded.published_at, external_publications.published_at)
         returning id, (xmax = 0) as inserted`,
        [brandId, branchId, p.external_account_id, p.account_name, p.external_media_id, p.permalink, p.media_type, p.media_product_type, p.caption_excerpt, p.published_at])).rows[0]
      if (pub.inserted) newPublications++
      const m = p.metrics
      await db.query(
        `insert into publication_metric_snapshots as s (publication_id, collected_on, window_start, window_end, reach, views, likes, comments, saves, shares, reel_interactions, data_quality, collected_by)
         values ($1, $2, (select (published_at at time zone 'America/Sao_Paulo')::date from external_publications where id = $1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (publication_id, collected_on) do update set
           collected_at = now(), collected_by = excluded.collected_by,
           reach = coalesce(excluded.reach, s.reach), views = coalesce(excluded.views, s.views), likes = coalesce(excluded.likes, s.likes),
           comments = coalesce(excluded.comments, s.comments), saves = coalesce(excluded.saves, s.saves), shares = coalesce(excluded.shares, s.shares),
           reel_interactions = coalesce(excluded.reel_interactions, s.reel_interactions),
           data_quality = case when coalesce(excluded.reach, s.reach) is not null and coalesce(excluded.views, s.views) is not null and coalesce(excluded.likes, s.likes) is not null
                                 and coalesce(excluded.comments, s.comments) is not null and coalesce(excluded.saves, s.saves) is not null and coalesce(excluded.shares, s.shares) is not null
                               then 'complete' else 'partial' end`,
        [pub.id, opts.today, m.reach, m.views, m.likes, m.comments, m.saves, m.shares, m.reel_interactions, p.quality, opts.actorId])
      snapshots++
    }

    // ---- totais das contas (histórico das metas) ----
    const accountRows: { kind: AccountKind; acct: string; name: string; brandId: string; branchId: string | null; v: { followers: number | null; views: number | null; interactions: number | null; spend: number | null; conversations: number | null } }[] = []
    if (igAcc.status === 'ok') {
      for (const [, rows] of groupBy(igAcc.rows, (r) => String(r.account_id ?? r.account_name ?? ''))) {
        const name = String(rows[0].account_name ?? '')
        const r = name ? resolve(name, 'instagram') : null
        if (!r) continue
        accountRows.push({ kind: 'instagram', acct: String(rows[0].account_id ?? name), name, brandId: r.brandId, branchId: r.branchId,
          v: { followers: lastOrNull(rows, 'followers_count'), views: sumOrNull(rows, 'views'), interactions: sumOrNull(rows, 'total_interactions'), spend: null, conversations: null } })
      }
    }
    if (ads.status === 'ok') {
      for (const [, rows] of groupBy(ads.rows, (r) => String(r.account_id ?? r.account_name ?? ''))) {
        const name = String(rows[0].account_name ?? '')
        const r = name ? resolve(name, 'ads') : null
        if (!r) continue
        accountRows.push({ kind: 'ads', acct: String(rows[0].account_id ?? name), name, brandId: r.brandId, branchId: r.branchId,
          v: { followers: null, views: null, interactions: null, spend: sumOrNull(rows, 'spend'), conversations: sumOrNull(rows, MESSAGES_FIELD) } })
      }
    }
    for (const a of accountRows) {
      const vals = Object.values(a.v)
      await db.query(
        `insert into account_metric_snapshots as s (brand_id, branch_id, kind, external_account_id, account_name, period_start, period_end, collected_on, followers, views, interactions, spend, conversations, data_quality, collected_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         on conflict (kind, external_account_id, period_start, period_end, collected_on) do update set
           collected_at = now(), collected_by = excluded.collected_by,
           followers = coalesce(excluded.followers, s.followers), views = coalesce(excluded.views, s.views), interactions = coalesce(excluded.interactions, s.interactions),
           spend = coalesce(excluded.spend, s.spend), conversations = coalesce(excluded.conversations, s.conversations)`,
        [a.brandId, a.branchId, a.kind, a.acct, a.name, range.from, to, opts.today, a.v.followers, a.v.views, a.v.interactions, a.v.spend, a.v.conversations,
          a.kind === 'instagram' ? (vals.slice(0, 3).every((x) => x !== null) ? 'complete' : 'partial') : (vals.slice(3).every((x) => x !== null) ? 'complete' : 'partial'), opts.actorId])
      accounts++
    }
  })

  return { ok: true, publications: parsed.size, newPublications, snapshots, accounts, unmapped: [...unmapped], notes, skippedBrands }
}

function failureText(r: Exclude<WindsorResult<never>, { status: 'ok' }>): string {
  const base = 'Nada foi gravado e o histórico anterior foi mantido.'
  if (r.status === 'not_configured') return `O Windsor não está configurado neste ambiente. ${base}`
  if (r.status === 'paused') return `O Windsor devolveu o aviso de leituras pausadas; os números não são reais. ${base}`
  if (r.status === 'no_accounts') return `O Windsor não tem contas conectadas. ${base}`
  return `Não foi possível ler o Windsor agora. ${base}`
}
