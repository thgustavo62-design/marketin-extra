// Solicitações de peças (briefing que vira conteúdo).
import { pool } from '../db'
import type { Priority, RequestStatus, RequestType } from '../domain'

export type RequestRow = {
  id: string; brand_id: string; brand_name: string; branch_id: string | null; branch_name: string | null
  title: string; type: RequestType; briefing: string; priority: Priority; due_at: string | null
  offer_item: string | null; offer_price: number | null; offer_valid_until: string | null
  info_confirmed_at: string | null; info_confirmed_by_name: string | null
  status: RequestStatus; linked_post_id: string | null; requested_by_name: string | null; created_at: string
}

export async function listRequests(f: { brand?: string; branchId?: string; status?: string; onlyOpen?: boolean }): Promise<RequestRow[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.branchId) { args.push(f.branchId); w.push(`(r.branch_id = $${args.length} or r.branch_id is null)`) }
  if (f.status) { args.push(f.status); w.push(`r.status = $${args.length}`) }
  if (f.onlyOpen) w.push(`r.status not in ('concluida', 'cancelada')`)
  const rows = (await pool.query(
    `select r.id, r.brand_id, b.name as brand_name, r.branch_id, br.name as branch_name, r.title, r.type, r.briefing, r.priority,
            r.due_at::text as due_at, r.offer_item, r.offer_price::float8 as offer_price, r.offer_valid_until::text as offer_valid_until,
            r.info_confirmed_at::text as info_confirmed_at, uc.display_name as info_confirmed_by_name,
            r.status, r.linked_post_id, ur.display_name as requested_by_name, r.created_at::text as created_at
       from content_requests r
       join brands b on b.id = r.brand_id
       left join branches br on br.id = r.branch_id
       left join users ur on ur.id = r.requested_by
       left join users uc on uc.id = r.info_confirmed_by
      ${w.length ? 'where ' + w.join(' and ') : ''}
      order by (r.status in ('concluida', 'cancelada')), array_position(array['urgent','high','normal','low'], r.priority), r.due_at nulls last, r.created_at desc
      limit 200`, args)).rows
  return rows
}
