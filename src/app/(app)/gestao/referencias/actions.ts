'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isInspirationKind, isNetwork, optionalHttps, parseTags } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { clientIp } from '@/lib/session'

type Result = { ok: true } | { ok: false; error: string }

// ---------- contas de referência ----------
export async function saveReferenceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const id = str(fd, 'id'), brandId = str(fd, 'brand_id'), name = str(fd, 'name'), network = str(fd, 'network'), category = str(fd, 'category'), region = str(fd, 'region'), notes = str(fd, 'notes')
  const rel = Number(str(fd, 'relevance') || '2')
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (id && (!isUuid(id) || !(await rowAllowed(g.user, 'reference_accounts', id)))) return { error: 'Referência não encontrada.' }
  if (name.length < 2 || name.length > 120) return { error: 'Dê um nome à referência (2 a 120 caracteres).' }
  if (!isNetwork(network)) return { error: 'Escolha a rede.' }
  if (![1, 2, 3].includes(rel)) return { error: 'Relevância inválida.' }
  if (category.length > 80 || region.length > 80) return { error: 'Categoria e região aceitam até 80 caracteres.' }
  if (notes.length > 1000) return { error: 'A observação passa de 1000 caracteres.' }
  const url = optionalHttps(str(fd, 'url'))
  if (!url.ok) return { error: url.error }
  if (id) {
    // a filial de uma referência existente não muda (as inspirações dependem dela)
    const r = await pool.query(`update reference_accounts set name=$2, network=$3, url=$4, category=$5, region=$6, relevance=$7, notes=$8 where id=$1 and brand_id=$9 returning id`,
      [id, name, network, url.url, category || null, region || null, rel, notes || null, brandId])
    if (!r.rowCount) return { error: 'A filial de uma referência existente não pode ser trocada.' }
  } else {
    await pool.query(`insert into reference_accounts (brand_id, name, network, url, category, region, relevance, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [brandId, name, network, url.url, category || null, region || null, rel, notes || null, g.user.id])
  }
  await audit(id ? 'referencia_editada' : 'referencia_criada', { userId: g.user.id, ip: await clientIp(), target: id || name })
  revalidatePath('/gestao/referencias')
  return { ok: id ? 'Referência atualizada.' : 'Referência cadastrada.' }
}

export async function toggleReferenceAction(id: string, active: boolean): Promise<Result> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id) || !(await rowAllowed(g.user, 'reference_accounts', id))) return { ok: false, error: 'Referência não encontrada.' }
  await pool.query(`update reference_accounts set active = $2 where id = $1`, [id, active])
  revalidatePath('/gestao/referencias')
  return { ok: true }
}

// ---------- inspirações ----------
export async function saveInspirationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const id = str(fd, 'id'), brandId = str(fd, 'brand_id'), kind = str(fd, 'kind'), title = str(fd, 'title'), description = str(fd, 'description')
  const referenceId = str(fd, 'reference_id'), campaignId = str(fd, 'campaign_id'), postId = str(fd, 'post_id'), assetId = str(fd, 'asset_id')
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (id && (!isUuid(id) || !(await rowAllowed(g.user, 'inspirations', id)))) return { error: 'Inspiração não encontrada.' }
  if (!isInspirationKind(kind)) return { error: 'Escolha o tipo.' }
  if (title.length < 2 || title.length > 140) return { error: 'Dê um título (2 a 140 caracteres).' }
  if (description.length > 2000) return { error: 'A descrição passa de 2000 caracteres.' }
  const src = optionalHttps(str(fd, 'source_url'))
  if (!src.ok) return { error: src.error }
  // cada vínculo precisa ser da mesma filial (as chaves do banco também garantem)
  const same = async (sql: string, v: string) => !v || (isUuid(v) && (await pool.query(sql, [v, brandId])).rowCount === 1)
  if (!(await same(`select 1 from reference_accounts where id = $1 and brand_id = $2`, referenceId))) return { error: 'Referência inválida para esta filial.' }
  if (!(await same(`select 1 from campaigns where id = $1 and brand_id = $2`, campaignId))) return { error: 'Campanha inválida para esta filial.' }
  if (!(await same(`select 1 from posts where id = $1 and brand_id = $2`, postId))) return { error: 'Conteúdo inválido para esta filial.' }
  if (!(await same(`select 1 from media_assets where id = $1 and brand_id = $2 and deleted_at is null`, assetId))) return { error: 'Arquivo inválido para esta filial.' }
  const tags = parseTags(str(fd, 'tags'))
  const vals = [kind, title, description, src.url, tags, referenceId || null, campaignId || null, postId || null, assetId || null]
  if (id) {
    const r = await pool.query(`update inspirations set kind=$2, title=$3, description=$4, source_url=$5, tags=$6, reference_id=$7, campaign_id=$8, post_id=$9, asset_id=$10 where id=$1 and brand_id=$11 returning id`, [id, ...vals, brandId])
    if (!r.rowCount) return { error: 'A filial de uma inspiração existente não pode ser trocada.' }
  } else {
    await pool.query(`insert into inspirations (brand_id, kind, title, description, source_url, tags, reference_id, campaign_id, post_id, asset_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [brandId, ...vals, g.user.id])
  }
  await audit(id ? 'inspiracao_editada' : 'inspiracao_criada', { userId: g.user.id, ip: await clientIp(), target: id || title })
  revalidatePath('/gestao/referencias')
  return { ok: id ? 'Inspiração atualizada.' : 'Inspiração salva.' }
}

export async function deleteInspirationAction(id: string): Promise<Result> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id) || !(await rowAllowed(g.user, 'inspirations', id))) return { ok: false, error: 'Inspiração não encontrada.' }
  await pool.query(`delete from inspirations where id = $1`, [id])
  await audit('inspiracao_excluida', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/gestao/referencias')
  return { ok: true }
}
