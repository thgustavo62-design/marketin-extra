// Dashboard: tudo agregado no banco (poucas linhas), em paralelo — não carrega conteúdo por conteúdo.
import { pool } from '../db'
import { STAGE_ORDER, addDays, formatBR, type Format, type Stage } from '../domain'
import type { Branch, Brand } from './brands'

export type DashboardInput = {
  brandId?: string
  branchId?: string
  /** primeiro dia do mês exibido: YYYY-MM-01 */
  monthStart: string
  today: string
  /** usuário logado (para "minhas tarefas") */
  userId: string
  brands: Brand[]
  branches: Branch[]
}

type UpcomingRow = { id: string; title: string; post_date: string; brand_name: string; branch_name: string | null; format: Format; stage: Stage }

export type DashboardData = {
  month: { total: number; prevTotal: number; byFormat: Record<Format, number>; byStage: Record<Stage, number> }
  rollup: { brand: Brand; total: number; formats: Record<Format, number>; shared: number; branches: { id: string; name: string; total: number }[] }[]
  weeks: { from: string; n: number }[]
  overdue: { total: number; items: { id: string; title: string; post_date: string; brand_name: string }[] }
  upcoming: UpcomingRow[]
  gaps: string[]
  knowledge: { total: number; items: { id: string; title: string; brand_name: string; expired: boolean }[] }
  production: { awaitingApproval: number; mine: number }
  campaigns: { active: number; endingSoon: { id: string; name: string; ends_on: string; brand_name: string }[] }
}

const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7))
const FORMATS: Format[] = ['feed', 'carrossel', 'reels']
const STAGES: Stage[] = STAGE_ORDER
const zero = <K extends string>(keys: K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>

// $1 = filial (ou null), $2 = unidade (ou null), $3 = data de referência
const POST_FILTER = `and ($1::uuid is null or p.brand_id = $1::uuid) and ($2::uuid is null or p.branch_id = $2::uuid or p.branch_id is null)`

export async function getDashboard(i: DashboardInput): Promise<DashboardData> {
  const brandId = i.brandId ?? null
  const branchId = i.branchId ?? null
  const q = <T,>(sql: string, ref: string) => pool.query(sql, [brandId, branchId, ref]).then((r) => r.rows as T[])
  const week0 = mondayOf(i.today)

  const [monthRows, prev, weekRows, overdue, upcoming, gapRows, know, camps, approvals, mine] = await Promise.all([
    q<{ brand_id: string; branch_id: string | null; format: Format; stage: Stage; n: number }>(
      `select p.brand_id, p.branch_id, p.format, p.stage, count(*)::int as n from posts p
        where p.post_date >= $3::date and p.post_date < ($3::date + interval '1 month') ${POST_FILTER} group by 1,2,3,4`, i.monthStart),
    q<{ n: number }>(
      `select count(*)::int as n from posts p
        where p.post_date >= ($3::date - interval '1 month') and p.post_date < $3::date ${POST_FILTER}`, i.monthStart),
    q<{ w: string; n: number }>(
      `select to_char(date_trunc('week', p.post_date::timestamp), 'YYYY-MM-DD') as w, count(*)::int as n from posts p
        where p.post_date >= $3::date and p.post_date < ($3::date + 56) and p.stage <> 'cancelado' ${POST_FILTER} group by 1`, week0),
    q<{ id: string; title: string; post_date: string; brand_name: string; total: number }>(
      `select p.id, p.title, p.post_date::text as post_date, b.name as brand_name, count(*) over()::int as total
         from posts p join brands b on b.id = p.brand_id
        where p.post_date < $3::date and p.stage not in ('publicado','cancelado') ${POST_FILTER} order by p.post_date limit 20`, i.today),
    q<UpcomingRow>(
      `select p.id, p.title, p.post_date::text as post_date, b.name as brand_name, br.name as branch_name, p.format, p.stage
         from posts p join brands b on b.id = p.brand_id left join branches br on br.id = p.branch_id
        where p.post_date >= $3::date and p.stage not in ('publicado','cancelado') ${POST_FILTER} order by p.post_date, p.post_time nulls last limit 8`, i.today),
    q<{ brand_id: string; wk: number; n: number }>(
      `select p.brand_id, ((p.post_date - $3::date) / 7)::int as wk, count(*)::int as n from posts p
        where p.post_date >= $3::date and p.post_date < ($3::date + 21) and p.stage <> 'cancelado' ${POST_FILTER} group by 1,2`, i.today),
    q<{ id: string; title: string; brand_name: string; expired: boolean; total: number }>(
      `select k.id, k.title, b.name as brand_name, (k.valid_until is not null and k.valid_until < $3::date) as expired, count(*) over()::int as total
         from knowledge k join brands b on b.id = k.brand_id
        where (not k.confirmed or (k.valid_until is not null and k.valid_until < $3::date))
          and ($1::uuid is null or k.brand_id = $1::uuid) and ($2::uuid is null or true)
        order by k.valid_until nulls last, k.title limit 10`, i.today),
    q<{ id: string; name: string; ends_on: string; brand_name: string }>(
      `select c.id, c.name, c.ends_on::text as ends_on, b.name as brand_name from campaigns c join brands b on b.id = c.brand_id
        where c.starts_on <= $3::date and c.ends_on >= $3::date and ($1::uuid is null or c.brand_id = $1::uuid) and ($2::uuid is null or true)`, i.today),
    q<{ n: number }>(`select count(*)::int as n from posts p where p.stage = 'aprovacao' and $3::date is not null ${POST_FILTER}`, i.today),
    pool.query(
      `select count(*)::int as n from posts p where p.assigned_to = $3::uuid and p.stage not in ('publicado','cancelado') ${POST_FILTER}`,
      [brandId, branchId, i.userId],
    ).then((r) => r.rows as { n: number }[]),
  ])

  const byFormat = zero(FORMATS)
  const byStage = zero(STAGES)
  let total = 0
  for (const r of monthRows) { byFormat[r.format] += r.n; byStage[r.stage] += r.n; total += r.n }

  const brandsShown = i.brandId ? i.brands.filter((b) => b.id === i.brandId) : i.brands
  const rollup = brandsShown.map((b) => {
    const mine = monthRows.filter((r) => r.brand_id === b.id)
    const formats = zero(FORMATS)
    for (const r of mine) formats[r.format] += r.n
    return {
      brand: b,
      total: mine.reduce((s, r) => s + r.n, 0),
      formats,
      shared: mine.filter((r) => !r.branch_id).reduce((s, r) => s + r.n, 0),
      branches: i.branches.filter((x) => x.brand_id === b.id && x.active).map((x) => ({
        id: x.id, name: x.name, total: mine.filter((r) => r.branch_id === x.id).reduce((s, r) => s + r.n, 0),
      })),
    }
  })

  const weekMap = new Map(weekRows.map((w) => [w.w, w.n]))
  const weeks = Array.from({ length: 8 }, (_, k) => { const from = addDays(week0, k * 7); return { from, n: weekMap.get(from) ?? 0 } })

  const gaps: string[] = []
  for (const b of brandsShown) {
    for (let w = 0; w < 3; w++) {
      if (!gapRows.some((g) => g.brand_id === b.id && g.wk === w)) {
        const from = addDays(i.today, w * 7)
        gaps.push(`${b.name}: sem conteúdo de ${formatBR(from)} a ${formatBR(addDays(from, 6))}`)
      }
    }
  }

  const ending = camps.filter((c) => c.ends_on <= addDays(i.today, 7))
  return {
    month: { total, prevTotal: prev[0]?.n ?? 0, byFormat, byStage },
    rollup,
    weeks,
    overdue: { total: overdue[0]?.total ?? 0, items: overdue },
    upcoming,
    gaps,
    knowledge: { total: know[0]?.total ?? 0, items: know },
    production: { awaitingApproval: approvals[0]?.n ?? 0, mine: mine[0]?.n ?? 0 },
    campaigns: { active: camps.length, endingSoon: ending },
  }
}
