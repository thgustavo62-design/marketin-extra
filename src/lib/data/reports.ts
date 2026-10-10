// Relatórios gerados: histórico por filial e leitura de um retrato.
import { pool } from '../db'
import type { ReportType } from '../domain'
import type { ReportSnapshot } from '../reports/build'

export type ReportRow = {
  id: string; brand_id: string; brand_name: string; branch_name: string | null; type: ReportType; period_start: string; period_end: string
  generated_at: string; generated_by_name: string | null; filters: { format?: string; campaignId?: string }
}

export async function listReports(f: { brandIds: string[] | null; brand?: string; branchId?: string }): Promise<ReportRow[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brandIds) { args.push(f.brandIds); w.push(`r.brand_id = any($${args.length})`) }
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.branchId) { args.push(f.branchId); w.push(`(r.branch_id = $${args.length} or r.branch_id is null)`) }
  return (await pool.query(
    `select r.id, r.brand_id, b.name as brand_name, br.name as branch_name, r.type, r.period_start::text as period_start, r.period_end::text as period_end,
            r.generated_at::text as generated_at, u.display_name as generated_by_name, r.filters
       from reports r join brands b on b.id = r.brand_id left join branches br on br.id = r.branch_id left join users u on u.id = r.generated_by
      ${w.length ? 'where ' + w.join(' and ') : ''} order by r.generated_at desc limit 100`, args)).rows
}

export type ReportFull = ReportRow & { snapshot: ReportSnapshot }

export async function getReport(id: string): Promise<ReportFull | null> {
  const r = (await pool.query(
    `select r.id, r.brand_id, b.name as brand_name, br.name as branch_name, r.type, r.period_start::text as period_start, r.period_end::text as period_end,
            r.generated_at::text as generated_at, u.display_name as generated_by_name, r.filters, r.snapshot, r.branch_id
       from reports r join brands b on b.id = r.brand_id left join branches br on br.id = r.branch_id left join users u on u.id = r.generated_by where r.id = $1`, [id])).rows[0]
  return r ?? null
}
