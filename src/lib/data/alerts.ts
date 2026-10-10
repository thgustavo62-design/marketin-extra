// Central de alertas: leitura dos eventos que a pessoa pode ver (só filiais autorizadas) com o estado dela.
import { pool } from '../db'
import type { AlertStatusFilter, AlertType, Severity } from '../domain'

export type AlertRow = {
  id: string; brand_id: string; brand_name: string; branch_name: string | null; type: AlertType; severity: Severity
  title: string; detail: string | null; href: string; created_at: string; resolved_at: string | null; read_at: string | null; dismissed_at: string | null
}

type Viewer = { id: string; role: string; brandIds: string[] | null }

// Administrador e quem não tem restrição veem todas as filiais; os demais, só as da lista.
const brandFilter = (u: Viewer, args: unknown[]): string => {
  if (u.role === 'admin' || u.brandIds === null) return 'true'
  args.push(u.brandIds)
  return `e.brand_id = any($${args.length})`
}

// Quantos alertas ativos ainda não foram lidos nem dispensados por esta pessoa (contador do sino).
export async function countUnreadAlerts(u: Viewer): Promise<number> {
  const args: unknown[] = [u.id]
  const f = brandFilter(u, args)
  const r = await pool.query(
    `select count(*)::int as n from notification_events e
      left join notification_user_state s on s.event_id = e.id and s.user_id = $1
     where e.resolved_at is null and ${f} and s.read_at is null and s.dismissed_at is null`, args)
  return r.rows[0].n
}

export async function listAlerts(u: Viewer, f: { status: AlertStatusFilter; type?: string; severity?: string; brand?: string; branchId?: string }): Promise<AlertRow[]> {
  const args: unknown[] = [u.id]
  const w = [brandFilter(u, args)]
  if (f.status === 'resolvidos') w.push('e.resolved_at is not null')
  else {
    w.push('e.resolved_at is null')
    if (f.status === 'ativos') w.push('s.read_at is null and s.dismissed_at is null')
    if (f.status === 'lidos') w.push('s.read_at is not null and s.dismissed_at is null')
    if (f.status === 'dispensados') w.push('s.dismissed_at is not null')
  }
  if (f.type) { args.push(f.type); w.push(`e.type = $${args.length}`) }
  if (f.severity) { args.push(f.severity); w.push(`e.severity = $${args.length}`) }
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.branchId) { args.push(f.branchId); w.push(`(e.branch_id = $${args.length} or e.branch_id is null)`) }
  return (await pool.query(
    `select e.id, e.brand_id, b.name as brand_name, br.name as branch_name, e.type, e.severity, e.title, e.detail, e.href,
            e.created_at::text as created_at, e.resolved_at::text as resolved_at, s.read_at::text as read_at, s.dismissed_at::text as dismissed_at
       from notification_events e
       join brands b on b.id = e.brand_id
       left join branches br on br.id = e.branch_id
       left join notification_user_state s on s.event_id = e.id and s.user_id = $1
      where ${w.join(' and ')}
      order by array_position(array['critical','warning','info'], e.severity), e.created_at desc limit 200`, args)).rows
}
