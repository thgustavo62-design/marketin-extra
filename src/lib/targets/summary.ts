// Metas do mês com o realizado GUARDADO (sistema + último retrato coletado). Não chama o Windsor: serve ao Dashboard e aos relatórios.
import { pool } from '../db'
import { TARGET_METRICS, monthRange, monthState, paceAlert, progress, type MetricKey } from '../domain'
import { historyRealized, internalCounts } from './realized'

export type GoalSummary = {
  key: MetricKey; label: string; unit: 'count' | 'brl'; direction: 'atLeast' | 'atMost'; target: number; realized: number | null
  source: 'internal' | 'history' | 'none'; asOf: string | null; status: string; statusKey: string; pct: number | null
  /** meta interna fora do ritmo (para observações e alertas) */
  behind: boolean
}

export async function storedGoals(brandId: string, branchId: string | null, month: string, today: string): Promise<GoalSummary[]> {
  const targets = (await pool.query(
    `select t.metric_key, t.target_value::float8 as target, t.branch_id from brand_targets t
      where t.brand_id = $1 and t.period_start = $2 and ($3::uuid is null or t.branch_id = $3 or t.branch_id is null) order by t.metric_key`, [brandId, `${month}-01`, branchId])).rows
  const st = monthState(month, today)
  const days = monthRange(month).days
  const out: GoalSummary[] = []
  for (const t of targets) {
    const key = t.metric_key as MetricKey, def = TARGET_METRICS[key]
    let realized: number | null = null, source: GoalSummary['source'] = 'none', asOf: string | null = null
    if (def.source === 'internal') {
      const c = await internalCounts(brandId, t.branch_id, month)
      realized = key === 'posts_planned' ? c.planned : c.published
      source = 'internal'
    } else {
      const h = (await historyRealized(brandId, t.branch_id, month, { ig: true, ads: true }))[key]
      if (h && h.value !== null) { realized = h.value; source = 'history'; asOf = h.asOf }
    }
    const pr = progress(def, realized, t.target, st.state)
    out.push({
      key, label: def.label, unit: def.unit, direction: def.direction, target: t.target, realized, source, asOf, status: pr.label, statusKey: pr.status, pct: pr.pct,
      behind: def.source === 'internal' && realized !== null && Boolean(paceAlert(def, t.target, realized, st.state, st.elapsed, days)),
    })
  }
  return out
}
