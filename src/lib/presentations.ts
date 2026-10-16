// Apresentações guardadas em partes no Postgres (private). O arquivo é remontado e conferido no fim do envio.
import { createHash } from 'node:crypto'
import { pool, withTx } from './db.ts'
import { brandAllowed } from './perms.ts'
import { CHUNK_BYTES, sniffPresentation, validateUploadStart, type PresentationKind } from './domain/presentations.ts'

export type Presentation = {
  id: string; brand_id: string | null; brand_name: string | null; title: string; description: string | null; file_name: string
  kind: PresentationKind; size_bytes: number; chunk_count: number; status: 'uploading' | 'ready'; created_at: string; created_by_name: string | null
}
type Viewer = { role: string; brandIds: string[] | null }

const COLS = `p.id, p.brand_id, b.name as brand_name, p.title, p.description, p.file_name, p.kind, p.size_bytes::float8 as size_bytes, p.chunk_count, p.status, p.created_at::text as created_at, u.display_name as created_by_name`
const FROM = `from presentations p left join brands b on b.id = p.brand_id left join users u on u.id = p.created_by`

/** Prontas e visíveis para quem consulta: as gerais (sem filial) e as das filiais a que tem acesso. `brandId` filtra por filial (mantém as gerais). */
export async function listPresentations(user: Viewer, brandId?: string | null): Promise<Presentation[]> {
  const rows: Presentation[] = (await pool.query(`select ${COLS} ${FROM} where p.deleted_at is null and p.status = 'ready' order by p.created_at desc limit 200`)).rows
  return rows.filter((p) => (!p.brand_id || brandAllowed(user, p.brand_id)) && (!brandId || !p.brand_id || p.brand_id === brandId))
}

export async function getPresentation(id: string, user: Viewer): Promise<Presentation | null> {
  const p: Presentation | undefined = (await pool.query(`select ${COLS} ${FROM} where p.id = $1 and p.deleted_at is null`, [id])).rows[0]
  if (!p || p.status !== 'ready') return null
  return !p.brand_id || brandAllowed(user, p.brand_id) ? p : null
}

export async function startUpload(o: { title: string; description: string | null; fileName: string; kind: string; size: number; chunks: number; brandId: string | null; userId: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const bad = validateUploadStart({ size: o.size, chunks: o.chunks, kind: o.kind })
  if (bad) return { ok: false, error: bad }
  const title = o.title.trim().replace(/\s+/g, ' ').slice(0, 160)
  if (title.length < 2) return { ok: false, error: 'Dê um título à apresentação.' }
  // envios abandonados há mais de 6 horas saem do caminho
  await pool.query(`delete from presentations where status = 'uploading' and created_at < now() - interval '6 hours'`)
  const r = await pool.query(
    `insert into presentations (brand_id, title, description, file_name, kind, size_bytes, chunk_count, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [o.brandId, title, o.description?.trim().slice(0, 500) || null, o.fileName.slice(0, 200), o.kind, o.size, o.chunks, o.userId])
  return { ok: true, id: r.rows[0].id }
}

/** Guarda uma parte. Só quem iniciou o envio, enquanto ele está aberto, e com o tamanho esperado. */
export async function putChunk(id: string, idx: number, data: Buffer, userId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const p = (await pool.query(`select chunk_count, size_bytes::float8 as size, created_by, status from presentations where id = $1 and deleted_at is null`, [id])).rows[0]
  if (!p || p.status !== 'uploading' || p.created_by !== userId) return { ok: false, error: 'Envio não encontrado ou já concluído.', status: 404 }
  if (!Number.isInteger(idx) || idx < 0 || idx >= p.chunk_count) return { ok: false, error: 'Parte inválida.', status: 400 }
  const expected = idx === p.chunk_count - 1 ? p.size - CHUNK_BYTES * (p.chunk_count - 1) : CHUNK_BYTES
  if (data.length !== expected) return { ok: false, error: 'Tamanho da parte não confere.', status: 400 }
  await pool.query(`insert into presentation_chunks (presentation_id, idx, data) values ($1, $2, $3) on conflict (presentation_id, idx) do update set data = excluded.data`, [id, idx, data])
  return { ok: true }
}

/** Remonta, confere o tipo pelos bytes e marca como pronta. Se algo estiver errado, apaga o envio. */
export async function finishUpload(id: string, userId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const p = (await pool.query(`select chunk_count, size_bytes::float8 as size, kind, created_by, status from presentations where id = $1 and deleted_at is null`, [id])).rows[0]
  if (!p || p.status !== 'uploading' || p.created_by !== userId) return { ok: false, error: 'Envio não encontrado ou já concluído.', status: 404 }
  const parts: Buffer[] = (await pool.query(`select data from presentation_chunks where presentation_id = $1 order by idx`, [id])).rows.map((r) => r.data)
  const fail = async (error: string) => { await pool.query(`delete from presentations where id = $1`, [id]); return { ok: false as const, error, status: 422 } }
  if (parts.length !== p.chunk_count) return { ok: false, error: `Faltam partes (${parts.length} de ${p.chunk_count}). Envie de novo.`, status: 409 }
  const all = Buffer.concat(parts)
  if (all.length !== p.size) return fail('O tamanho final não confere. Envie de novo.')
  const real = sniffPresentation(all)
  if (!real || real !== p.kind) return fail('O conteúdo não é um PPTX ou PDF válido.')
  const sha = createHash('sha256').update(all).digest('hex')
  await withTx(async (db) => { await db.query(`update presentations set status = 'ready', sha256 = $2 where id = $1`, [id, sha]) })
  return { ok: true }
}

export async function getChunk(id: string, idx: number): Promise<Buffer | null> {
  return (await pool.query(`select c.data from presentation_chunks c join presentations p on p.id = c.presentation_id where c.presentation_id = $1 and c.idx = $2 and p.status = 'ready' and p.deleted_at is null`, [id, idx])).rows[0]?.data ?? null
}

export async function updatePresentation(id: string, v: { title: string; description: string | null; brandId: string | null }): Promise<{ ok: boolean; error?: string }> {
  const title = v.title.trim().replace(/\s+/g, ' ').slice(0, 160)
  if (title.length < 2) return { ok: false, error: 'Dê um título à apresentação.' }
  const r = await pool.query(`update presentations set title = $2, description = $3, brand_id = $4 where id = $1 and deleted_at is null`, [id, title, v.description?.trim().slice(0, 500) || null, v.brandId])
  return r.rowCount ? { ok: true } : { ok: false, error: 'Apresentação não encontrada.' }
}

/** Exclusão definitiva: apaga as partes do arquivo também (não fica lixo no banco). */
export async function deletePresentation(id: string): Promise<boolean> {
  return ((await pool.query(`delete from presentations where id = $1`, [id])).rowCount ?? 0) > 0
}
