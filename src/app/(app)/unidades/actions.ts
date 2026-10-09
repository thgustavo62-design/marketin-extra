'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp, getSession } from '@/lib/session'

export async function saveBranchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSession()
  if (!user) return { error: 'Sessão expirada. Entre novamente.' }
  const id = str(fd, 'id')
  const brandId = str(fd, 'brand_id')
  const name = str(fd, 'name')
  if (!isUuid(brandId)) return { error: 'Escolha a rede.' }
  if (!name) return { error: 'Informe o nome da unidade.' }
  const vals = [brandId, name, str(fd, 'city') || null, str(fd, 'address') || null, str(fd, 'phone') || null, String(fd.get('hours') ?? '').trim() || null]
  try {
    if (id) {
      if (!isUuid(id)) return { error: 'Unidade inválida.' }
      const used = await pool.query(`select count(*)::int n from posts where branch_id = $1 and brand_id <> $2`, [id, brandId])
      if (used.rows[0].n) return { error: 'Esta unidade tem conteúdos de outra rede; não é possível mudar a rede dela.' }
      await pool.query(`update branches set brand_id=$1, name=$2, city=$3, address=$4, phone=$5, hours=$6 where id=$7`, [...vals, id])
    } else {
      await pool.query(`insert into branches (brand_id, name, city, address, phone, hours) values ($1,$2,$3,$4,$5,$6)`, vals)
    }
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { error: 'Já existe uma unidade com esse nome nessa rede.' }
    throw e
  }
  await audit(id ? 'unidade_editada' : 'unidade_criada', { userId: user.id, ip: await clientIp(), target: id || name })
  redirect('/unidades?salvo=1')
}

export async function toggleBranchAction(fd: FormData) {
  const user = await getSession()
  const id = str(fd, 'id')
  if (!user || !isUuid(id)) redirect('/login')
  await pool.query(`update branches set active = not active where id = $1`, [id])
  await audit('unidade_ativacao', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/unidades')
}
