'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError, audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp } from '@/lib/session'

const PAGE = '/configuracoes/integracoes'

export async function saveMappingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await adminOrError()
  if (!g.ok) return { error: g.error }
  const kind = str(fd, 'kind')
  const account = str(fd, 'account_name')
  const brandId = str(fd, 'brand_id')
  const branchId = str(fd, 'branch_id')
  if (kind !== 'instagram' && kind !== 'ads') return { error: 'Escolha o tipo da conta.' }
  if (!account || account.length > 120) return { error: 'Informe o nome da conta exatamente como aparece no Windsor.' }
  if (!isUuid(brandId)) return { error: 'Escolha a rede.' }
  if (branchId) {
    if (!isUuid(branchId)) return { error: 'Filial inválida.' }
    const ok = await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])
    if (!ok.rowCount) return { error: 'A filial escolhida não pertence a essa rede.' }
  }
  await pool.query(
    `insert into integration_accounts (provider, kind, account_name, brand_id, branch_id) values ('windsor', $1, $2, $3, $4)
     on conflict (provider, kind, account_name) do update set brand_id = excluded.brand_id, branch_id = excluded.branch_id`,
    [kind, account, brandId, branchId || null],
  )
  await audit('integracao_mapeada', { userId: g.user.id, ip: await clientIp(), target: account, meta: { kind } })
  revalidatePath(PAGE)
  return { ok: `Conta "${account}" associada.` }
}

export async function deleteMappingAction(fd: FormData) {
  const g = await adminOrError()
  const id = str(fd, 'id')
  if (!g.ok || !isUuid(id)) return
  await pool.query(`delete from integration_accounts where id = $1`, [id])
  await audit('integracao_removida', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath(PAGE)
}
