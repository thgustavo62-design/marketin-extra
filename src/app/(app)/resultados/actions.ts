'use server'

import { redirect } from 'next/navigation'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrRedirect } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isUuid, optInt, str } from '@/lib/form'
import { clientIp } from '@/lib/session'

export async function saveMetricsAction(fd: FormData) {
  const user = await writerOrRedirect()
  const id = str(fd, 'id')
  if (!isUuid(id)) redirect('/')
  if (!(await rowAllowed(user, 'posts', id))) redirect('/?sem-permissao=1')
  const reach = optInt(fd, 'reach')
  const saves = optInt(fd, 'saves')
  const shares = optInt(fd, 'shares')
  if (reach === 'invalid' || saves === 'invalid' || shares === 'invalid') redirect('/resultados/publicacoes?erro=1')
  await pool.query(
    `update posts set reach=$1, saves=$2, shares=$3, revision = revision + 1, updated_at = now() where id = $4 and stage = 'publicado'`,
    [reach, saves, shares, id],
  )
  await audit('metricas_registradas', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/resultados/publicacoes?salvo=1')
}
