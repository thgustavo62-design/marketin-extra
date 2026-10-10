// Acesso por filial (servidor): confirma que o registro mexido pertence a uma filial que a pessoa pode usar.
import { pool } from './db'
import { brandAllowed } from './perms'
import type { SessionUser } from './session'

type Table = 'posts' | 'campaigns' | 'knowledge' | 'branches' | 'media_assets' | 'content_requests' | 'approvals' | 'campaign_templates' | 'campaign_instances' | 'external_publications' | 'brand_targets' | 'notification_events' | 'reports'
const TABLES: Table[] = ['posts', 'campaigns', 'knowledge', 'branches', 'media_assets', 'content_requests', 'approvals', 'campaign_templates', 'campaign_instances', 'external_publications', 'brand_targets', 'notification_events', 'reports'] // lista fechada: o nome vai direto no SQL

// Registro inexistente → false (a ação responde "não encontrado" sem revelar nada).
export async function rowAllowed(user: Pick<SessionUser, 'role' | 'brandIds'>, table: Table, id: string): Promise<boolean> {
  if (!TABLES.includes(table)) return false
  if (user.role === 'admin' || user.brandIds === null) {
    return (await pool.query(`select 1 from ${table} where id = $1`, [id])).rowCount === 1
  }
  const r = (await pool.query(`select brand_id from ${table} where id = $1`, [id])).rows[0]
  return Boolean(r) && brandAllowed(user, r.brand_id)
}
