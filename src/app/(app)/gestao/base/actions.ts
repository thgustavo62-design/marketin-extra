'use server'

import { redirect } from 'next/navigation'
import { rowAllowed } from '@/lib/access'
import { brandAllowed, NO_BRAND_ACCESS } from '@/lib/perms'
import { audit, writerOrError, writerOrRedirect } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isIsoDate, isKind } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp } from '@/lib/session'

export async function saveKnowledgeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await writerOrError()
  if (!guard.ok) return { error: guard.error }
  const user = guard.user
  const id = str(fd, 'id')
  const brandId = str(fd, 'brand_id')
  const kind = str(fd, 'kind')
  const title = str(fd, 'title')
  const validUntil = str(fd, 'valid_until')
  const confirmed = fd.get('confirmed') === 'on'
  if (!isUuid(brandId)) return { error: 'Escolha a filial.' }
  if (!brandAllowed(user, brandId)) return { error: NO_BRAND_ACCESS }
  if (!isKind(kind)) return { error: 'Escolha o tipo da informação.' }
  if (!title) return { error: 'Informe um título.' }
  if (validUntil && !isIsoDate(validUntil)) return { error: 'Validade inválida.' }

  const vals = [brandId, kind, title, String(fd.get('content') ?? ''), str(fd, 'source'), str(fd, 'owner'), validUntil || null, confirmed]
  if (id) {
    if (!isUuid(id)) return { error: 'Registro inválido.' }
    if (!(await rowAllowed(user, 'knowledge', id))) return { error: NO_BRAND_ACCESS }
    await pool.query(
      `update knowledge set brand_id=$1, kind=$2, title=$3, content=$4, source=$5, owner=$6, valid_until=$7, confirmed=$8,
              confirmed_at = case when $8 then coalesce(confirmed_at, now()) else null end, updated_at = now() where id = $9`,
      [...vals, id],
    )
  } else {
    await pool.query(
      `insert into knowledge (brand_id, kind, title, content, source, owner, valid_until, confirmed, confirmed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, case when $8 then now() end)`,
      vals,
    )
  }
  await audit(id ? 'base_editada' : 'base_criada', { userId: user.id, ip: await clientIp(), target: id || title })
  redirect('/gestao/base?salvo=1')
}

export async function confirmKnowledgeAction(fd: FormData) {
  const user = await writerOrRedirect()
  const id = str(fd, 'id')
  if (!isUuid(id)) redirect('/')
  if (!(await rowAllowed(user, 'knowledge', id))) redirect('/?sem-permissao=1')
  // Reconfirmar: marca como confirmada agora. Se a validade já passou, o usuário precisa editar a validade.
  await pool.query(`update knowledge set confirmed = true, confirmed_at = now(), updated_at = now() where id = $1`, [id])
  await audit('base_confirmada', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/gestao/base')
}

export async function deleteKnowledgeAction(fd: FormData) {
  const user = await writerOrRedirect()
  const id = str(fd, 'id')
  if (!isUuid(id)) redirect('/')
  if (!(await rowAllowed(user, 'knowledge', id))) redirect('/?sem-permissao=1')
  await pool.query(`delete from knowledge where id = $1`, [id])
  await audit('base_excluida', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/gestao/base')
}
