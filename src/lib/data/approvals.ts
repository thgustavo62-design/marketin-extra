// Fila de aprovações pendentes.
import { pool } from '../db'
import type { Format, Priority } from '../domain'

export type PendingApproval = {
  approval_id: string; post_id: string; title: string; brand_name: string; branch_name: string | null; format: Format; priority: Priority
  post_date: string; version_number: number; submitted_by_name: string | null; reviewer_id: string | null; reviewer_name: string | null
  submitted_at: string; assets: number
}

export async function listPendingApprovals(f: { brand?: string; branchId?: string }): Promise<PendingApproval[]> {
  const w = [`a.status = 'pending'`]
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.branchId) { args.push(f.branchId); w.push(`(p.branch_id = $${args.length} or p.branch_id is null)`) }
  return (await pool.query(
    `select a.id as approval_id, p.id as post_id, p.title, b.name as brand_name, br.name as branch_name, p.format, p.priority,
            p.post_date::text as post_date, v.version_number, us.display_name as submitted_by_name,
            coalesce(a.reviewer_id, p.reviewer_id) as reviewer_id, ur.display_name as reviewer_name, a.created_at::text as submitted_at,
            (select count(*)::int from content_asset_links k where k.post_id = p.id) as assets
       from approvals a
       join content_versions v on v.id = a.version_id
       join posts p on p.id = a.post_id
       join brands b on b.id = p.brand_id
       left join branches br on br.id = p.branch_id
       left join users us on us.id = a.submitted_by
       left join users ur on ur.id = coalesce(a.reviewer_id, p.reviewer_id)
      where ${w.join(' and ')}
      order by array_position(array['urgent','high','normal','low'], p.priority), p.post_date, a.created_at
      limit 200`, args)).rows
}
