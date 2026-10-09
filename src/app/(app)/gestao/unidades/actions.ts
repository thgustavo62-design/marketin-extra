'use server'

import { redirect } from 'next/navigation'
import { rowAllowed } from '@/lib/access'
import { brandAllowed, NO_BRAND_ACCESS } from '@/lib/perms'
import { audit, writerOrError, writerOrRedirect } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp } from '@/lib/session'

export async function saveBranchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await writerOrError()
  if (!guard.ok) return { error: guard.error }
  const user = guard.user
  const id = str(fd, 'id')
  const brandId = str(fd, 'brand_id')
  const name = str(fd, 'name')
  if (!isUuid(brandId)) return { error: 'Escolha a filial.' }
  if (!brandAllowed(user, brandId)) return { error: NO_BRAND_ACCESS }
  if (!name) return { error: 'Informe o nome da unidade.' }
  const vals = [brandId, name, str(fd, 'city') || null, str(fd, 'address') || null, str(fd, 'phone') || null, String(fd.get('hours') ?? '').trim() || null]
  try {
    if (id) {
      if (!isUuid(id)) return { error: 'Unidade inválida.' }
      if (!(await rowAllowed(user, 'branches', id))) return { error: NO_BRAND_ACCESS }
      const used = await pool.query(`select count(*)::int n from posts where branch_id = $1 and brand_id <> $2`, [id, brandId])
      if (used.rows[0].n) return { error: 'Esta unidade tem conteúdos de outra filial; não é possível mudar a filial dela.' }
      await pool.query(`update branches set brand_id=$1, name=$2, city=$3, address=$4, phone=$5, hours=$6 where id=$7`, [...vals, id])
    } else {
      await pool.query(`insert into branches (brand_id, name, city, address, phone, hours) values ($1,$2,$3,$4,$5,$6)`, vals)
    }
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { error: 'Já existe uma unidade com esse nome nessa filial.' }
    throw e
  }
  await audit(id ? 'unidade_editada' : 'unidade_criada', { userId: user.id, ip: await clientIp(), target: id || name })
  redirect('/gestao/unidades?salvo=1')
}

export async function toggleBranchAction(fd: FormData) {
  const user = await writerOrRedirect()
  const id = str(fd, 'id')
  if (!isUuid(id)) redirect('/')
  if (!(await rowAllowed(user, 'branches', id))) redirect('/?sem-permissao=1')
  await pool.query(`update branches set active = not active where id = $1`, [id])
  await audit('unidade_ativacao', { userId: user.id, ip: await clientIp(), target: id })
  redirect('/gestao/unidades')
}
