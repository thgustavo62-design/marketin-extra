'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { pool } from '@/lib/db'
import { TARGET_METRICS, isMetricKey, isYearMonth, monthRange } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { clientIp } from '@/lib/session'

export async function saveTargetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const brandId = str(fd, 'brand_id'), branchId = str(fd, 'branch_id'), month = str(fd, 'month'), key = str(fd, 'metric_key')
  const valueRaw = str(fd, 'target_value').replace(/\./g, '').replace(',', '.'), owner = str(fd, 'owner_id'), notes = str(fd, 'notes')

  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (branchId && (!isUuid(branchId) || !(await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])).rowCount)) return { error: 'Unidade inválida para esta filial.' }
  if (!isYearMonth(month)) return { error: 'Escolha o mês da meta.' }
  if (!isMetricKey(key)) return { error: 'Escolha o indicador.' }
  const def = TARGET_METRICS[key]
  if (valueRaw === '' || !/^\d+(\.\d{1,2})?$/.test(valueRaw)) return { error: 'Informe o valor da meta (número, sem unidade).' }
  const value = Number(valueRaw)
  if (value > 1_000_000_000) return { error: 'Valor alto demais.' }
  if (def.unit === 'count' && !Number.isInteger(value)) return { error: 'Este indicador é uma contagem: use um número inteiro.' }
  if (notes.length > 500) return { error: 'A observação passa de 500 caracteres.' }
  if (owner) {
    const ok = isUuid(owner) && (await pool.query(
      `select 1 from users where id = $1 and active and (role = 'admin' or brand_ids is null or $2::uuid = any(brand_ids))`, [owner, brandId])).rowCount
    if (!ok) return { error: 'Responsável inválido para esta filial.' }
  }
  const r = monthRange(month)
  try {
    const ins = await pool.query(
      `insert into brand_targets (brand_id, branch_id, period_start, period_end, metric_key, target_value, unit, expected_source, owner_id, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [brandId, branchId || null, r.from, r.to, key, value, def.unit, def.source, owner || null, notes || null, g.user.id])
    await audit('meta_criada', { userId: g.user.id, ip: await clientIp(), target: ins.rows[0].id, meta: { indicador: key, mes: month } })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { error: 'Já existe uma meta deste indicador neste mês e escopo. Exclua a anterior para cadastrar outra.' }
    throw e
  }
  revalidatePath('/resultados/metas')
  return { ok: 'Meta cadastrada.' }
}

export async function deleteTargetAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id) || !(await rowAllowed(g.user, 'brand_targets', id))) return { ok: false, error: 'Meta não encontrada.' }
  await pool.query(`delete from brand_targets where id = $1`, [id])
  await audit('meta_excluida', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/resultados/metas')
  return { ok: true }
}
