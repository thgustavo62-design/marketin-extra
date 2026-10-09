'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { invalidateIfChanged } from '@/lib/approvals/service'
import { audit, writerOrError } from '@/lib/auth'
import { getAssetDetail, listPickerAssets, type AssetDetail } from '@/lib/data'
import { pool, withTx } from '@/lib/db'
import { parseTags, validateExternalUrl } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { clientIp, getSession } from '@/lib/session'

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })
const ROLES = ['reference', 'draft', 'final', 'thumbnail']

// ---------- link externo (vídeos grandes, pastas do Drive...) ----------
export async function createLinkAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const brandId = str(fd, 'brand_id'), branchId = str(fd, 'branch_id'), title = str(fd, 'title').slice(0, 160), url = str(fd, 'url')
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (!title) return { error: 'Dê um título ao link.' }
  const bad = validateExternalUrl(url)
  if (bad) return { error: bad }
  if (branchId && (!isUuid(branchId) || !(await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])).rowCount)) return { error: 'Unidade inválida para esta filial.' }
  const id = await withTx(async (db) => {
    const r = await db.query(
      `insert into media_assets (brand_id, branch_id, kind, title, external_url, uploaded_by) values ($1, $2, 'link', $3, $4, $5) returning id`,
      [brandId, branchId || null, title, url.trim(), g.user.id])
    for (const t of parseTags(str(fd, 'tags'))) await db.query(`insert into media_asset_tags (asset_id, tag) values ($1, $2) on conflict do nothing`, [r.rows[0].id, t])
    return r.rows[0].id as string
  })
  await audit('midia_link', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/producao/biblioteca')
  return { ok: 'Link adicionado à biblioteca.' }
}

// ---------- detalhe (leitura) ----------
export async function getAssetDetailAction(id: string): Promise<Result<{ detail: AssetDetail }>> {
  const user = await getSession()
  if (!user || user.mustChange) return fail('Sessão expirada. Entre novamente.')
  if (!isUuid(id) || !(await rowAllowed(user, 'media_assets', id))) return fail('Mídia não encontrada.')
  const detail = await getAssetDetail(id)
  return detail ? { ok: true, detail } : fail('Mídia não encontrada.')
}

export async function listPickerAction(brandId: string, q: string): Promise<Result<{ items: Awaited<ReturnType<typeof listPickerAssets>> }>> {
  const user = await getSession()
  if (!user || user.mustChange) return fail('Sessão expirada. Entre novamente.')
  if (!isUuid(brandId) || !brandAllowed(user, brandId)) return fail(NO_BRAND_ACCESS)
  return { ok: true, items: await listPickerAssets(brandId, q.trim().slice(0, 80) || undefined) }
}

// ---------- metadados ----------
async function guardAsset(id: string) {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error } as const
  if (!isUuid(id) || !(await rowAllowed(g.user, 'media_assets', id))) return { ok: false, error: 'Mídia não encontrada.' } as const
  return { ok: true, user: g.user } as const
}

export async function setTagsAction(id: string, tags: string): Promise<Result> {
  const g = await guardAsset(id)
  if (!g.ok) return fail(g.error)
  const list = parseTags(tags)
  await withTx(async (db) => {
    await db.query(`delete from media_asset_tags where asset_id = $1`, [id])
    for (const t of list) await db.query(`insert into media_asset_tags (asset_id, tag) values ($1, $2)`, [id, t])
  })
  revalidatePath('/producao/biblioteca')
  return { ok: true }
}

// Só uma versão por peça é a "final aprovada".
export async function setFinalAction(id: string, final: boolean): Promise<Result> {
  const g = await guardAsset(id)
  if (!g.ok) return fail(g.error)
  await withTx(async (db) => {
    if (final) await db.query(`update media_assets set is_final = false where group_id = (select group_id from media_assets where id = $1)`, [id])
    await db.query(`update media_assets set is_final = $2 where id = $1`, [id, final])
  })
  await audit('midia_final', { userId: g.user.id, ip: await clientIp(), target: id, meta: { final } })
  revalidatePath('/producao/biblioteca')
  return { ok: true }
}

export async function setReusableAction(id: string, reusable: boolean): Promise<Result> {
  const g = await guardAsset(id)
  if (!g.ok) return fail(g.error)
  await pool.query(`update media_assets set reusable_approved = $2 where group_id = (select group_id from media_assets where id = $1)`, [id, reusable])
  revalidatePath('/producao/biblioteca')
  return { ok: true }
}

// Excluir é "esconder": nada é apagado fisicamente, e peça usada em conteúdo não sai da biblioteca.
export async function deleteAssetAction(id: string): Promise<Result> {
  const g = await guardAsset(id)
  if (!g.ok) return fail(g.error)
  const used = (await pool.query(
    `select p.title from content_asset_links k join posts p on p.id = k.post_id join media_assets a on a.id = k.asset_id
      where a.group_id = (select group_id from media_assets where id = $1) limit 3`, [id])).rows
  if (used.length) return fail(`Esta peça está em uso em: ${used.map((u) => `"${u.title}"`).join(', ')}. Desvincule antes de excluir.`)
  await pool.query(`update media_assets set deleted_at = now() where group_id = (select group_id from media_assets where id = $1)`, [id])
  await audit('midia_excluida', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/producao/biblioteca')
  return { ok: true }
}

// ---------- vínculo mídia ↔ conteúdo ----------
async function guardLink(postId: string, assetId?: string) {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error } as const
  if (!isUuid(postId) || !(await rowAllowed(g.user, 'posts', postId))) return { ok: false, error: NO_BRAND_ACCESS } as const
  if (assetId && (!isUuid(assetId) || !(await rowAllowed(g.user, 'media_assets', assetId)))) return { ok: false, error: 'Mídia não encontrada.' } as const
  return { ok: true, user: g.user } as const
}

const invalidate = (postId: string, userId: string) => invalidateIfChanged(postId, userId, 'Os anexos do conteúdo mudaram depois do envio para aprovação.')

export async function linkAssetAction(postId: string, assetId: string, role: string): Promise<Result> {
  const g = await guardLink(postId, assetId)
  if (!g.ok) return fail(g.error)
  if (!ROLES.includes(role)) return fail('Papel do anexo inválido.')
  try {
    await pool.query(
      `insert into content_asset_links (post_id, asset_id, brand_id, role, sort_order, linked_by)
       select $1, $2, p.brand_id, $3, coalesce((select max(sort_order) + 1 from content_asset_links where post_id = $1), 0), $4 from posts p where p.id = $1
       on conflict (post_id, asset_id) do update set role = excluded.role`,
      [postId, assetId, role, g.user.id])
  } catch (e) {
    // a chave composta impede ligar mídia de uma filial a conteúdo de outra
    if ((e as { code?: string }).code === '23503') return fail('Esta mídia pertence a outra filial.')
    throw e
  }
  await invalidate(postId, g.user.id)
  await audit('midia_vinculada', { userId: g.user.id, ip: await clientIp(), target: postId, meta: { asset: assetId, role } })
  revalidatePath('/producao')
  return { ok: true }
}

export async function unlinkAssetAction(postId: string, assetId: string): Promise<Result> {
  const g = await guardLink(postId, assetId)
  if (!g.ok) return fail(g.error)
  await pool.query(`delete from content_asset_links where post_id = $1 and asset_id = $2`, [postId, assetId])
  await invalidate(postId, g.user.id)
  await audit('midia_desvinculada', { userId: g.user.id, ip: await clientIp(), target: postId, meta: { asset: assetId } })
  revalidatePath('/producao')
  return { ok: true }
}
