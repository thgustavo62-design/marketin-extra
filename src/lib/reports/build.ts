// Montagem dos relatórios. Usa SOMENTE dados do banco (conteúdos, publicações e retratos guardados): nunca chama o Windsor, então o
// relatório é reproduzível e diz de quando são os dados. O resultado é um retrato (JSON) que fica gravado; HTML, CSV e PDF saem dele.
import { listPublications } from '../data'
import { pool } from '../db'
import {
  FORMATS, STAGES, STAGE_ORDER, buildObservations, costPerConversation, engagementRate, groupMedians, interactions, isMature,
  monthOf, perThousandReach, daysBetween,
  type Format, type Group, type Period, type ReportFilters, type ReportType, type Stage,
} from '../domain'
import { storedGoals } from '../targets/summary'

export type PubRow = {
  date: string | null; account: string; format: string; permalink: string | null
  reach: number | null; views: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null
  interactions: number | null; engagement: number | null; collectedOn: string | null; quality: string | null; content: string | null; ageDays: number | null
}
export type AcctRow = {
  kind: 'instagram' | 'ads'; account: string; periodStart: string; periodEnd: string; collectedOn: string; quality: string
  followers: number | null; views: number | null; interactions: number | null; spend: number | null; conversations: number | null; costPerConversation: number | null
}

export type OperacionalData = {
  planned: number; published: number; overdueCount: number; noOwner: number; pendingApprovals: number; pendingReconfirm: number
  byStage: Record<Stage, number>
  overdue: { title: string; date: string; daysLate: number; stage: string }[]
  items: { title: string; date: string; format: string; stage: string; owner: string | null; campaign: string | null }[]
  itemsTruncated: boolean
}
export type ResultadosData = {
  publications: PubRow[]; immature: number
  byFormat: { format: string; engagement: Group; savesPerK: Group }[]
  campaigns: { name: string; publications: number; engagement: Group }[]
  accounts: AcctRow[]
  unlinked: number
}
export type ExecutivoData = {
  planned: number; published: number; overdue: number; pendingApprovals: number; realPublications: number
  goals: { label: string; unit: 'count' | 'brl'; direction: 'atLeast' | 'atMost'; target: number; realized: number | null; source: 'internal' | 'history' | 'none'; asOf: string | null; status: string; pct: number | null }[]
  byFormat: { format: string; engagement: Group }[]
  observations: string[]
  nextSteps: { label: string; count: number; href: string }[]
}

export type ReportSnapshot = {
  version: 1
  type: ReportType
  meta: {
    brandName: string; branchName: string | null; from: string; to: string; formatLabel: string | null; campaignName: string | null
    generatedAt: string; generatedOn: string; dataThrough: string | null
  }
  operacional: OperacionalData | null
  resultados: ResultadosData | null
  executivo: ExecutivoData | null
}

type Input = {
  type: ReportType
  brand: { id: string; slug: string; name: string }
  branch: { id: string; name: string } | null
  period: Period
  filters: ReportFilters
  today: string
}

const OPEN = ['ideia', 'briefing', 'producao', 'revisao', 'aprovacao', 'aprovado', 'agendado']

export async function buildReport(i: Input): Promise<ReportSnapshot> {
  const generatedAt = new Date().toISOString()
  const campaignName = i.filters.campaignId
    ? ((await pool.query(`select name from campaigns where id = $1 and brand_id = $2`, [i.filters.campaignId, i.brand.id])).rows[0]?.name ?? null)
    : null
  const through = await dataThrough(i.brand.id)
  const [op, res] = await Promise.all([
    i.type !== 'resultados' ? buildOperacional(i) : Promise.resolve(null),
    i.type !== 'operacional' ? buildResultados(i) : Promise.resolve(null),
  ])
  const exec = i.type === 'executivo' ? await buildExecutivo(i, op!, res!) : null
  return {
    version: 1, type: i.type,
    meta: {
      brandName: i.brand.name, branchName: i.branch?.name ?? null, from: i.period.from, to: i.period.to,
      formatLabel: i.filters.format ? (FORMATS[i.filters.format as Format] ?? null) : null, campaignName,
      generatedAt, generatedOn: i.today, dataThrough: through,
    },
    operacional: i.type === 'operacional' ? op : null,
    resultados: i.type === 'resultados' ? res : null,
    executivo: exec,
  }
}

async function dataThrough(brandId: string): Promise<string | null> {
  const r = (await pool.query(
    `select greatest(
        (select max(s.collected_at) from publication_metric_snapshots s join external_publications e on e.id = s.publication_id where e.brand_id = $1),
        (select max(a.collected_at) from account_metric_snapshots a where a.brand_id = $1))::text as at`, [brandId])).rows[0]
  return r?.at ? new Date(r.at).toISOString() : null
}

// ---------- operacional ----------
async function buildOperacional(i: Input): Promise<OperacionalData> {
  const f = [i.brand.id, i.branch?.id ?? null, i.period.from, i.period.to, i.filters.format ?? null, i.filters.campaignId ?? null]
  const where = `p.brand_id = $1 and ($2::uuid is null or p.branch_id = $2 or p.branch_id is null) and p.post_date between $3 and $4
                 and ($5::text is null or p.format = $5) and ($6::uuid is null or p.campaign_id = $6)`
  const rows = (await pool.query(
    `select p.title, p.post_date::text as d, p.format, p.stage, p.assigned_to, u.display_name as owner, coalesce(c.name, p.campaign_name) as campaign
       from posts p left join campaigns c on c.id = p.campaign_id left join users u on u.id = p.assigned_to
      where ${where} order by p.post_date, p.title`, f)).rows
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<Stage, number>
  for (const r of rows) byStage[r.stage as Stage]++
  const open = rows.filter((r) => OPEN.includes(r.stage))
  const overdue = open.filter((r) => r.d < i.today).map((r) => ({ title: r.title, date: r.d, daysLate: daysBetween(r.d, i.today), stage: STAGES[r.stage as Stage] }))
  const pending = (await pool.query(`select count(*)::int n from approvals a join posts p on p.id = a.post_id where a.status = 'pending' and ${where}`, f)).rows[0].n
  const reconfirm = (await pool.query(
    `select count(*)::int n from campaign_instances ci where ci.brand_id = $1 and ($2::uuid is null or ci.branch_id = $2 or ci.branch_id is null)
        and ci.status = 'generated' and ci.reconfirmed_at is null and ci.occurrence_start between $3 and $4`, f.slice(0, 4))).rows[0].n
  return {
    planned: rows.filter((r) => r.stage !== 'cancelado').length, published: byStage.publicado, overdueCount: overdue.length,
    noOwner: open.filter((r) => ['ideia', 'briefing', 'producao', 'revisao'].includes(r.stage) && !r.assigned_to).length,
    pendingApprovals: pending, pendingReconfirm: reconfirm, byStage, overdue: overdue.slice(0, 60),
    items: rows.slice(0, 300).map((r) => ({ title: r.title, date: r.d, format: FORMATS[r.format as Format] ?? r.format, stage: STAGES[r.stage as Stage], owner: r.owner, campaign: r.campaign })),
    itemsTruncated: rows.length > 300,
  }
}

// ---------- resultados ----------
async function buildResultados(i: Input): Promise<ResultadosData> {
  let pubs = (await listPublications({ brand: i.brand.slug, branchId: i.branch?.id, from: i.period.from }, 500))
    .filter((p) => p.published_on && p.published_on >= i.period.from && p.published_on <= i.period.to)
  if (i.filters.format) pubs = pubs.filter((p) => p.format === i.filters.format)
  let campaignOf = new Map<string, string>()
  const ids = pubs.map((p) => p.content_id).filter((x): x is string => Boolean(x))
  if (ids.length) {
    const cr = (await pool.query(`select p.id, coalesce(c.name, p.campaign_name) as name, p.campaign_id from posts p left join campaigns c on c.id = p.campaign_id where p.id = any($1)`, [ids])).rows
    campaignOf = new Map(cr.filter((r) => r.name).map((r) => [r.id, r.name as string]))
    if (i.filters.campaignId) {
      const inCampaign = new Set(cr.filter((r) => r.campaign_id === i.filters.campaignId).map((r) => r.id as string))
      pubs = pubs.filter((p) => p.content_id && inCampaign.has(p.content_id))
    }
  } else if (i.filters.campaignId) pubs = []

  const publications: PubRow[] = pubs.map((p) => ({
    date: p.published_on, account: p.account_name, format: FORMATS[p.format as Format] ?? (p.format === 'story' ? 'Story' : 'Outro'), permalink: p.permalink,
    reach: p.metrics?.reach ?? null, views: p.metrics?.views ?? null, likes: p.metrics?.likes ?? null, comments: p.metrics?.comments ?? null,
    saves: p.metrics?.saves ?? null, shares: p.metrics?.shares ?? null, interactions: p.metrics ? interactions(p.metrics) : null,
    engagement: p.metrics ? engagementRate(p.metrics) : null, collectedOn: p.collected_on, quality: p.data_quality, content: p.content_title,
    ageDays: p.published_on ? daysBetween(p.published_on, i.today) : null,
  }))
  const withM = pubs.filter((p) => p.metrics)
  const mature = (p: (typeof pubs)[number]) => isMature(p.published_on!, i.today)
  const label = (p: (typeof pubs)[number]) => FORMATS[p.format as Format] ?? (p.format === 'story' ? 'Story' : 'Outro')
  const eng = groupMedians(withM, label, (p) => engagementRate(p.metrics!), mature)
  const sav = groupMedians(withM, label, (p) => perThousandReach(p.metrics!.saves, p.metrics!.reach), mature)
  const keys = [...new Set([...eng.map((g) => g.key), ...sav.map((g) => g.key)])]
  const empty = (k: string): Group => ({ key: k, n: 0, median: null, enough: false })
  const byFormat = keys.map((k) => ({ format: k, engagement: eng.find((g) => g.key === k) ?? empty(k), savesPerK: sav.find((g) => g.key === k) ?? empty(k) }))
  const linked = withM.filter((p) => p.content_id && campaignOf.has(p.content_id))
  const campaigns = groupMedians(linked, (p) => campaignOf.get(p.content_id!)!, (p) => engagementRate(p.metrics!), mature)
    .map((g) => ({ name: g.key, publications: linked.filter((p) => campaignOf.get(p.content_id!) === g.key).length, engagement: g }))

  const monthStart = monthOf(i.period.from).from
  const acc = (await pool.query(
    `select distinct on (kind, external_account_id, period_start) kind, account_name, period_start::text as ps, period_end::text as pe, collected_on::text as co, data_quality,
            followers, views::float8 as views, interactions::float8 as interactions, spend::float8 as spend, conversations
       from account_metric_snapshots where brand_id = $1 and ($2::uuid is null or branch_id = $2 or branch_id is null) and period_start between $3 and $4
      order by kind, external_account_id, period_start, collected_at desc`, [i.brand.id, i.branch?.id ?? null, monthStart, i.period.to])).rows
  const accounts: AcctRow[] = acc.map((r) => ({
    kind: r.kind, account: r.account_name, periodStart: r.ps, periodEnd: r.pe, collectedOn: r.co, quality: r.data_quality,
    followers: r.followers, views: r.views, interactions: r.interactions, spend: r.spend, conversations: r.conversations,
    costPerConversation: costPerConversation(r.spend, r.conversations),
  }))
  return { publications, immature: withM.filter((p) => !mature(p)).length, byFormat, campaigns, accounts, unlinked: pubs.filter((p) => !p.content_id).length }
}

// ---------- executivo ----------
async function buildExecutivo(i: Input, op: OperacionalData, res: ResultadosData): Promise<ExecutivoData> {
  const month = i.period.to.slice(0, 7)
  const stored = await storedGoals(i.brand.id, i.branch?.id ?? null, month, i.today)
  const goals: ExecutivoData['goals'] = stored.map((g) => ({ label: g.label, unit: g.unit, direction: g.direction, target: g.target, realized: g.realized, source: g.source, asOf: g.asOf, status: g.status, pct: g.pct }))
  const behind = stored.filter((g) => g.behind && g.realized !== null).map((g) => ({ label: g.label, realized: g.realized!, target: g.target }))
  const unlinked = res.unlinked
  const nextSteps = [
    { label: 'Conteúdos atrasados', count: op.overdueCount, href: '/producao?atrasados=1' },
    { label: 'Aprovações pendentes', count: op.pendingApprovals, href: '/producao/aprovacoes' },
    { label: 'Campanhas recorrentes aguardando reconfirmação', count: op.pendingReconfirm, href: '/campanhas/modelos' },
    { label: 'Publicações reais sem vínculo com conteúdo', count: unlinked, href: '/resultados/vinculos?ver=pendentes' },
    { label: 'Conteúdos sem responsável', count: op.noOwner, href: '/producao' },
  ].filter((s) => s.count > 0)
  return {
    planned: op.planned, published: op.published, overdue: op.overdueCount, pendingApprovals: op.pendingApprovals, realPublications: res.publications.length,
    goals, nextSteps, byFormat: res.byFormat.map((b) => ({ format: b.format, engagement: b.engagement })),
    observations: buildObservations({ planned: op.planned, overdue: op.overdueCount, published: op.published, engagementByFormat: res.byFormat.map((b) => b.engagement), goalsBehind: behind }),
  }
}

