'use server'

import { redirect } from 'next/navigation'
import { audit, writerOrError, writerOrRedirect } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isIsoDate } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp } from '@/lib/session'

export async function saveCampaignAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await writerOrError()
  if (!guard.ok) return { error: guard.error }
  const user = guard.user
  const id = str(fd, 'id')
  const brandId = str(fd, 'brand_id')
  const name = str(fd, 'name')
  const start = str(fd, 'starts_on')
  const end = str(fd, 'ends_on')
  if (!name) return { error: 'Informe o nome da campanha.' }
  if (!isUuid(brandId)) return { error: 'Escolha a filial.' }
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: 'Informe início e fim válidos.' }
  if (end < start) return { error: 'O fim da campanha não pode ser antes do início.' }

  const vals = [brandId, name, start, end, str(fd, 'objective'), String(fd.get('briefing') ?? ''), str(fd, 'approver')]
  if (id) {
    if (!isUuid(id)) return { error: 'Campanha inválida.' }
    const used = await pool.query(`select count(*)::int n from posts where campaign_id = $1 and brand_id <> $2`, [id, brandId])
    if (used.rows[0].n) return { error: 'Esta campanha tem conteúdos de outra filial; não é possível mudar a filial dela.' }
    await pool.query(
      `update campaigns set brand_id=$1, name=$2, starts_on=$3, ends_on=$4, objective=$5, briefing=$6, approver=$7, updated_at=now() where id=$8`,
      [...vals, id],
    )
    // Mantém o nome histórico dos conteúdos coerente com o novo nome.
    await pool.query(`update posts set campaign_name = $1 where campaign_id = $2`, [name, id])
    await audit('campanha_editada', { userId: user.id, ip: await clientIp(), target: id })
  } else {
    const r = await pool.query(
      `insert into campaigns (brand_id, name, starts_on, ends_on, objective, briefing, approver) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      vals,
    )
    await audit('campanha_criada', { userId: user.id, ip: await clientIp(), target: r.rows[0].id })
  }
  redirect('/campanhas?salvo=1')
}

export async function deleteCampaignAction(fd: FormData) {
  const user = await writerOrRedirect()
  const id = str(fd, 'id')
  if (!isUuid(id)) redirect('/')
  // Os conteúdos ficam; o nome da campanha fica gravado neles como referência histórica.
  await pool.query(`update posts set campaign_name = (select name from campaigns where id = $1) where campaign_id = $1`, [id])
  await pool.query(`delete from campaigns where id = $1`, [id])
  await audit('campanha_excluida', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/campanhas')
}
