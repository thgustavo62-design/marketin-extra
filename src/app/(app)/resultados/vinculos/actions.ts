'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { listCandidatePosts, listPublications } from '@/lib/data'
import { pool } from '@/lib/db'
import { addDays, suggestMatches, todayISO } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { clientIp } from '@/lib/session'

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })

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
