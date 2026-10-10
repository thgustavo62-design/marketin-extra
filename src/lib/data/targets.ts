// Metas mensais por filial/unidade.
import { pool } from '../db'
import type { MetricKey } from '../domain'

export type Target = {
  id: string; brand_id: string; brand_name: string; branch_id: string | null; branch_name: string | null
  period_start: string; metric_key: MetricKey; target_value: number; unit: 'count' | 'brl'; expected_source: 'internal' | 'instagram' | 'ads'
  owner_id: string | null; owner_name: string | null; notes: string | null; created_by_name: string | null; created_at: string
}

export async function listTargets(f: { brand?: string; branchId?: string; month?: string }): Promise<Target[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  // Meta da filial inteira vale para qualquer unidade; meta de unidade só aparece naquela unidade.
  if (f.branchId) { args.push(f.branchId); w.push(`(t.branch_id = $${args.length} or t.branch_id is null)`) }
  if (f.month) { args.push(`${f.month}-01`); w.push(`t.period_start = $${args.length}::date`) }
  return (await pool.query(
    `select t.id, t.brand_id, b.name as brand_name, t.branch_id, br.name as branch_name, t.period_start::text as period_start, t.metric_key,
            t.target_value::float8 as target_value, t.unit, t.expected_source, t.owner_id, uo.display_name as owner_name, t.notes,
            uc.display_name as created_by_name, t.created_at::text as created_at
       from brand_targets t
       join brands b on b.id = t.brand_id
       left join branches br on br.id = t.branch_id
       left join users uo on uo.id = t.owner_id
       left join users uc on uc.id = t.created_by
      ${w.length ? 'where ' + w.join(' and ') : ''}
      order by t.period_start desc, b.name, t.metric_key limit 300`, args)).rows
}
