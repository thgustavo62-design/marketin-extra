'use server'

import { revalidatePath } from 'next/cache'
import { audit, writerOrError } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isDecisionStatus } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { clientIp } from '@/lib/session'

type Result = { ok: true } | { ok: false; error: string }

// Registro de decisão sobre um achado: quem decidiu, quando, e a "assinatura" da análise na hora (para avisar se ela mudar depois).
export async function decideInsightAction(brandId: string, key: string, status: string, note: string, fingerprint: string): Promise<Result> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { ok: false, error: NO_BRAND_ACCESS }
  if (!/^[a-z0-9_:-]{3,80}$/.test(key) || !/^[0-9a-f]{8}$/.test(fingerprint)) return { ok: false, error: 'Achado inválido.' }
  if (!isDecisionStatus(status)) return { ok: false, error: 'Decisão inválida.' }
  const text = note.trim().slice(0, 500)
  if (status === 'dispensada' && text.length < 3) return { ok: false, error: 'Explique em poucas palavras por que dispensou (mínimo de 3 caracteres).' }
  await pool.query(
    `insert into insight_decisions (brand_id, insight_key, status, note, fingerprint, decided_by, decided_at) values ($1, $2, $3, $4, $5, $6, now())
     on conflict (brand_id, insight_key) do update set status = excluded.status, note = excluded.note, fingerprint = excluded.fingerprint, decided_by = excluded.decided_by, decided_at = now()`,
    [brandId, key, status, text || null, fingerprint, g.user.id])
  await audit('decisao_inteligencia', { userId: g.user.id, ip: await clientIp(), target: key, meta: { status } })
  revalidatePath('/inteligencia')
  return { ok: true }
}

export async function clearInsightDecisionAction(brandId: string, key: string): Promise<Result> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { ok: false, error: NO_BRAND_ACCESS }
  await pool.query(`delete from insight_decisions where brand_id = $1 and insight_key = $2`, [brandId, key])
  await audit('decisao_inteligencia_removida', { userId: g.user.id, ip: await clientIp(), target: key })
  revalidatePath('/inteligencia')
  return { ok: true }
}
