'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { listCandidatePosts, listPublications } from '@/lib/data'
import { pool } from '@/lib/db'
import { addDays, suggestMatches, todayISO } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { collectMetrics } from '@/lib/publications/collect'
import { getScope } from '@/lib/scope'
import { clientIp } from '@/lib/session'

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })

// ---------- coleta manual ----------
export async function collectAction(): Promise<Result<{ publications: number; newPublications: number; accounts: number; unmapped: string[]; notes: string[]; skippedBrands: string[] }>> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  const scope = await getScope()
  const brandIds = scope.brand ? [scope.brand.id] : scope.brands.map((b) => b.id)
  if (brandIds.length === 0) return fail('Nenhuma filial disponível para coletar.')
  const r = await collectMetrics({ brandIds, actorId: g.user.id, today: todayISO() })
  // Cada tentativa fica registrada (sem dados sensíveis); alimenta o alerta de falha na coleta.
  for (const id of brandIds) {
    await pool.query(
      `insert into integration_sync_runs (provider, job_type, brand_id, status, finished_at, records_processed, error_summary_safe, requested_by)
       values ('windsor', 'collect_metrics', $1, $2, now(), $3, $4, $5)`,
      [id, r.ok ? 'ok' : r.reason === 'windsor' ? 'failed' : 'skipped', r.ok ? r.publications : null, r.ok ? null : r.error.slice(0, 280), g.user.id])
  }
  if (!r.ok) return fail(r.error)
  await audit('coleta_metricas', { userId: g.user.id, ip: await clientIp(), meta: { publicacoes: r.publications, novas: r.newPublications, contas: r.accounts, filiais: brandIds.length } })
  revalidatePath('/resultados/vinculos'); revalidatePath('/resultados/metas')
  return { ok: true, publications: r.publications, newPublications: r.newPublications, accounts: r.accounts, unmapped: r.unmapped, notes: r.notes, skippedBrands: r.skippedBrands }
}

// ---------- vínculo ----------
export async function linkPublicationAction(publicationId: string, postId: string, method: 'manual' | 'verified_match'): Promise<Result> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  if (!isUuid(publicationId) || !isUuid(postId)) return fail('Publicação ou conteúdo inválidos.')
  if (!(await rowAllowed(g.user, 'external_publications', publicationId)) || !(await rowAllowed(g.user, 'posts', postId))) return fail('Publicação ou conteúdo não encontrados.')

  if (method === 'verified_match') {
    // A sugestão é recalculada aqui: o navegador não consegue "forjar" um vínculo verificado.
    const pubs = await listPublications({ from: addDays(todayISO(), -120), unlinkedOnly: true }, 500)
    const mine = pubs.filter((p) => p.id === publicationId)
    const candidates = mine.length ? await listCandidatePosts([mine[0].brand_id], addDays(mine[0].published_on ?? todayISO(), -1), addDays(mine[0].published_on ?? todayISO(), 1)) : []
    const ok = suggestMatches(
      pubs.filter((p) => p.brand_id === mine[0]?.brand_id).map((p) => ({ id: p.id, brand_id: p.brand_id, published_on: p.published_on, format: p.format })),
      candidates.map((c) => ({ id: c.id, brand_id: c.brand_id, post_date: c.post_date, format: c.format, stage: c.stage })),
    ).some((s) => s.publicationId === publicationId && s.postId === postId)
    if (!ok) return fail('Essa sugestão não vale mais (há outra publicação ou outro conteúdo no mesmo dia e formato). Vincule manualmente.')
  }

  try {
    const r = await pool.query(
      `update external_publications set content_id = $2, link_method = $3, linked_by = $4, linked_at = now()
        where id = $1 and (content_id is null or content_id = $2) returning id`, [publicationId, postId, method, g.user.id])
    if (!r.rowCount) {
      const cur = (await pool.query(`select p.title from external_publications e join posts p on p.id = e.content_id where e.id = $1`, [publicationId])).rows[0]
      return fail(`Esta publicação já está vinculada a "${cur?.title ?? 'outro conteúdo'}". Desvincule antes.`)
    }
  } catch (e) {
    if ((e as { code?: string }).code === '23503') return fail('O conteúdo e a publicação pertencem a filiais diferentes.')
    throw e
  }
  await audit('publicacao_vinculada', { userId: g.user.id, ip: await clientIp(), target: publicationId, meta: { conteudo: postId, metodo: method } })
  revalidatePath('/resultados/vinculos')
  return { ok: true }
}

export async function unlinkPublicationAction(publicationId: string): Promise<Result> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  if (!isUuid(publicationId) || !(await rowAllowed(g.user, 'external_publications', publicationId))) return fail('Publicação não encontrada.')
  await pool.query(`update external_publications set content_id = null, link_method = null, linked_by = null, linked_at = null where id = $1`, [publicationId])
  await audit('publicacao_desvinculada', { userId: g.user.id, ip: await clientIp(), target: publicationId })
  revalidatePath('/resultados/vinculos')
  return { ok: true }
}
