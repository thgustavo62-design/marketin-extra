'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError, audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isUuid, str, type FormState } from '@/lib/form'
import { normalizeAliases } from '@/lib/integrations'
import { clientIp } from '@/lib/session'

const PAGE = '/configuracoes/integracoes'

// Associação manual: só para exceções (conta cujo nome não indica a filial).
export async function saveMappingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await adminOrError()
  if (!g.ok) return { error: g.error }
  const kind = str(fd, 'kind')
  const account = str(fd, 'account_name')
  const brandId = str(fd, 'brand_id')
  const branchId = str(fd, 'branch_id')
  if (kind !== 'instagram' && kind !== 'ads') return { error: 'Escolha o tipo da conta.' }
  if (!account || account.length > 120) return { error: 'Informe o nome da conta exatamente como aparece no Windsor.' }
  if (!isUuid(brandId)) return { error: 'Escolha a filial.' }
  if (branchId) {
    if (!isUuid(branchId)) return { error: 'Unidade inválida.' }
    const ok = await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])
    if (!ok.rowCount) return { error: 'A unidade escolhida não pertence a essa filial.' }
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

// Apelidos: trechos do nome da conta que identificam cada filial no Windsor.
export async function saveAliasesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await adminOrError()
  if (!g.ok) return { error: g.error }
  const brandId = str(fd, 'brand_id')
  if (!isUuid(brandId)) return { error: 'Filial inválida.' }
  const parsed = normalizeAliases(String(fd.get('aliases') ?? ''))
  if (!parsed.ok) return { error: parsed.error }

  // Um apelido não pode identificar duas filiais ao mesmo tempo.
  const others = (await pool.query(`select name, aliases from brands where id <> $1`, [brandId])).rows as { name: string; aliases: string[] }[]
  const squash = (s: string) => s.replace(/[^a-z0-9]/g, '')
  for (const o of others) {
    for (const a of o.aliases) {
      const clash = parsed.list.find((x) => squash(x).includes(squash(a)) || squash(a).includes(squash(x)))
      if (clash) return { error: `O apelido "${clash}" se confunde com "${a}", da filial ${o.name}. Use um nome mais específico.` }
    }
  }
  await pool.query(`update brands set aliases = $1 where id = $2`, [parsed.list, brandId])
  await audit('integracao_apelidos', { userId: g.user.id, ip: await clientIp(), target: brandId, meta: { total: parsed.list.length } })
  revalidatePath(PAGE)
  return { ok: 'Apelidos salvos.' }
}
