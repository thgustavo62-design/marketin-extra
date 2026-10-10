// Dashboard: visão Executiva (por filial) e extras da Operacional. Só dados do banco — rápido e com data de coleta.
import { pool } from '../db'
import { addDays, costPerConversation, engagementRate, groupMedians, isMature } from '../domain'
import { historyRealized, internalCounts } from '../targets/realized'
import { storedGoals } from '../targets/summary'
import { listAlerts, type AlertRow } from './alerts'
import { listPublications } from './publications'

export type ExecBrand = {
  brandId: string; name: string
  planned: number; published: number
  pubsCur: number; pubsPrev: number
  engagement: { median: number | null; n: number; enough: boolean }
  spend: number | null; conversations: number | null; costPerConversation: number | null; followers: number | null
  dataAsOf: string | null
  goals: { total: number; hit: number; behind: number }
  criticalAlerts: number
}

const WINDOW = 28

export async function getExecutive(brands: { id: string; slug: string; name: string }[], branchId: string | null, today: string): Promise<ExecBrand[]> {
  const month = today.slice(0, 7)
  return Promise.all(brands.map(async (b): Promise<ExecBrand> => {
    const [counts, pubs, hist, goals, crit] = await Promise.all([
      internalCounts(b.id, branchId, month),
      listPublications({ brand: b.slug, branchId: branchId ?? undefined, from: addDays(today, -(2 * WINDOW - 1)) }, 500),
      historyRealized(b.id, branchId, month, { ig: true, ads: true }),
      storedGoals(b.id, branchId, month, today),
      pool.query(`select count(*)::int as n from notification_events where brand_id = $1 and resolved_at is null and severity = 'critical'`, [b.id]),
    ])
    const curFrom = addDays(today, -(WINDOW - 1)), prevFrom = addDays(today, -(2 * WINDOW - 1))
    const inCur = pubs.filter((p) => p.published_on && p.published_on >= curFrom)
    const inPrev = pubs.filter((p) => p.published_on && p.published_on >= prevFrom && p.published_on < curFrom)
    const g = groupMedians(inCur.filter((p) => p.metrics), () => 'x', (p) => engagementRate(p.metrics!), (p) => isMature(p.published_on!, today))[0]
    const spend = hist.ads_spend?.value ?? null, conv = hist.ads_conversations?.value ?? null
    const asOfs = [hist.ads_spend?.asOf, hist.ig_followers?.asOf, hist.ig_views?.asOf].filter((x): x is string => Boolean(x)).sort()
    return {
      brandId: b.id, name: b.name, planned: counts.planned, published: counts.published, pubsCur: inCur.length, pubsPrev: inPrev.length,
      engagement: g ? { median: g.median, n: g.n, enough: g.enough } : { median: null, n: 0, enough: false },
      spend, conversations: conv, costPerConversation: costPerConversation(spend, conv), followers: hist.ig_followers?.value ?? null,
      dataAsOf: asOfs.at(-1) ?? null,
      goals: { total: goals.length, hit: goals.filter((x) => x.statusKey === 'atingida' || x.statusKey === 'dentro').length, behind: goals.filter((x) => x.behind || x.statusKey === 'abaixo' || x.statusKey === 'acima').length },
      criticalAlerts: crit.rows[0].n,
    }
  }))
}

export type OperationalExtras = { today: number; week: number; weekDone: number; topAlerts: AlertRow[] }

export async function getOperationalExtras(
  user: { id: string; role: string; brandIds: string[] | null }, f: { brandId?: string; branchId?: string; brandSlug?: string }, today: string,
): Promise<OperationalExtras> {
  const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7
  const monday = addDays(today, -dow), sunday = addDays(monday, 6)
  const r = (await pool.query(
    `select count(*) filter (where post_date = $3 and stage <> 'cancelado')::int as today,
            count(*) filter (where post_date between $4 and $5 and stage <> 'cancelado')::int as week,
            count(*) filter (where post_date between $4 and $5 and stage = 'publicado')::int as done
       from posts where ($1::uuid is null or brand_id = $1) and ($2::uuid is null or branch_id = $2 or branch_id is null)`, [f.brandId ?? null, f.branchId ?? null, today, monday, sunday])).rows[0]
  const alerts = await listAlerts(user, { status: 'ativos', brand: f.brandSlug, branchId: f.branchId })
  return { today: r.today, week: r.week, weekDone: r.done, topAlerts: alerts.slice(0, 5) }
}
