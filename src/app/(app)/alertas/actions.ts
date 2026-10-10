'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { maybeSyncAlerts } from '@/lib/alerts/sync'
import { pool } from '@/lib/db'
import { isUuid } from '@/lib/form'
import { getSession } from '@/lib/session'

type Result = { ok: true } | { ok: false; error: string }

// Marcar como lido / dispensar / reabrir vale só para a pessoa. Ver alertas é leitura: leitor também pode.
async function guard(id: string) {
  const user = await getSession()
  if (!user || user.mustChange) return { ok: false, error: 'Sessão expirada. Entre novamente.' } as const
  if (!isUuid(id) || !(await rowAllowed(user, 'notification_events', id))) return { ok: false, error: 'Alerta não encontrado.' } as const
  return { ok: true, user } as const
}

async function setState(id: string, col: 'read_at' | 'dismissed_at' | 'both_null'): Promise<Result> {
  const g = await guard(id)
  if (!g.ok) return g
  if (col === 'both_null') {
    await pool.query(`update notification_user_state set read_at = null, dismissed_at = null where event_id = $1 and user_id = $2`, [id, g.user.id])
  } else {
    await pool.query(
      `insert into notification_user_state (event_id, user_id, ${col}) values ($1, $2, now())
       on conflict (event_id, user_id) do update set ${col} = coalesce(notification_user_state.${col}, now())`, [id, g.user.id])
  }
  revalidatePath('/alertas')
  return { ok: true }
}

export const markReadAction = async (id: string): Promise<Result> => setState(id, 'read_at')
export const dismissAlertAction = async (id: string): Promise<Result> => setState(id, 'dismissed_at')
export const reopenAlertAction = async (id: string): Promise<Result> => setState(id, 'both_null')

export async function markAllReadAction(): Promise<Result> {
  const user = await getSession()
  if (!user || user.mustChange) return { ok: false, error: 'Sessão expirada. Entre novamente.' }
  const args: unknown[] = [user.id]
  let filter = 'true'
  if (user.role !== 'admin' && user.brandIds !== null) { args.push(user.brandIds); filter = `e.brand_id = any($2)` }
  await pool.query(
    `insert into notification_user_state (event_id, user_id, read_at)
     select e.id, $1, now() from notification_events e where e.resolved_at is null and ${filter}
     on conflict (event_id, user_id) do update set read_at = coalesce(notification_user_state.read_at, now())`, args)
  revalidatePath('/alertas')
  return { ok: true }
}

// Reavaliar agora (ignora o intervalo mínimo).
export async function reevaluateAction(): Promise<Result> {
  const user = await getSession()
  if (!user || user.mustChange) return { ok: false, error: 'Sessão expirada. Entre novamente.' }
  await maybeSyncAlerts(true)
  revalidatePath('/alertas')
  return { ok: true }
}
