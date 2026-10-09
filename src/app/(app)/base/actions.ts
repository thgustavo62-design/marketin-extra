'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isIsoDate, isKind } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp, getSession } from '@/lib/session'

export async function saveKnowledgeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSession()
  if (!user) return { error: 'Sessão expirada. Entre novamente.' }
  const id = str(fd, 'id')
  const brandId = str(fd, 'brand_id')
  const kind = str(fd, 'kind')
  const title = str(fd, 'title')
  const validUntil = str(fd, 'valid_until')
  const confirmed = fd.get('confirmed') === 'on'
  if (!isUuid(brandId)) return { error: 'Escolha a rede.' }
  if (!isKind(kind)) return { error: 'Escolha o tipo da informação.' }
  if (!title) return { error: 'Informe um título.' }
  if (validUntil && !isIsoDate(validUntil)) return { error: 'Validade inválida.' }

  const vals = [brandId, kind, title, String(fd.get('content') ?? ''), str(fd, 'source'), str(fd, 'owner'), validUntil || null, confirmed]
  if (id) {
    if (!isUuid(id)) return { error: 'Registro inválido.' }
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
  redirect('/base?salvo=1')
}

export async function confirmKnowledgeAction(fd: FormData) {
  const user = await getSession()
  const id = str(fd, 'id')
  if (!user || !isUuid(id)) redirect('/login')
  // Reconfirmar: marca como confirmada agora. Se a validade já passou, o usuário precisa editar a validade.
  await pool.query(`update knowledge set confirmed = true, confirmed_at = now(), updated_at = now() where id = $1`, [id])
  await audit('base_confirmada', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/base')
}

export async function deleteKnowledgeAction(fd: FormData) {
  const user = await getSession()
  const id = str(fd, 'id')
  if (!user || !isUuid(id)) redirect('/login')
  await pool.query(`delete from knowledge where id = $1`, [id])
  await audit('base_excluida', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/base')
}
