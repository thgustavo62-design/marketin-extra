'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isUuid, optInt, str } from '@/lib/form'
import { clientIp, getSession } from '@/lib/session'

export async function saveMetricsAction(fd: FormData) {
  const user = await getSession()
  const id = str(fd, 'id')
  if (!user || !isUuid(id)) redirect('/login')
  const reach = optInt(fd, 'reach')
  const saves = optInt(fd, 'saves')
  const shares = optInt(fd, 'shares')
  if (reach === 'invalid' || saves === 'invalid' || shares === 'invalid') redirect('/resultados?erro=1')
  await pool.query(
    `update posts set reach=$1, saves=$2, shares=$3, revision = revision + 1, updated_at = now() where id = $4 and stage = 'publicado'`,
    [reach, saves, shares, id],
  )
  await audit('metricas_registradas', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/resultados?salvo=1')
}
