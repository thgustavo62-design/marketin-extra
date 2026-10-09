'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError, audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isUuid } from '@/lib/form'
import { clientIp } from '@/lib/session'

// Política de aprovação por filial: com ela ligada, ninguém passa para aprovado/agendado/publicado sem uma aprovação válida.
export async function setApprovalRequiredAction(brandId: string, required: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await adminOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(brandId)) return { ok: false, error: 'Filial inválida.' }
  const r = await pool.query(`update brands set approval_required = $2 where id = $1 returning id`, [brandId, required])
  if (!r.rowCount) return { ok: false, error: 'Filial não encontrada.' }
  await audit('politica_aprovacao', { userId: g.user.id, ip: await clientIp(), target: brandId, meta: { exigir: required } })
  revalidatePath('/configuracoes/fluxo')
  revalidatePath('/producao')
  return { ok: true }
}
