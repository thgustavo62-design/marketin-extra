// Biblioteca de imagens das promoções (ícones, logos, selos, fundos, fotos): guardadas uma vez e usadas em qualquer promoção.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { pool } from '../db.ts'
import { sniffImage } from '../catalog/images.ts'
import { MAX_LIBRARY_FILE_BYTES, MAX_LIBRARY_ITEMS, isLibraryCategory, libraryName, looksLikeSvg, svgIsSafe, type LibraryCategory } from '../domain/promo-library.ts'

export type LibraryItem = { id: string; name: string; category: LibraryCategory; width: number; height: number; created_at: string; brand_id: string | null }

export async function listLibrary(category?: string): Promise<LibraryItem[]> {
  const rows = (await pool.query(
    `select id, name, category, width, height, created_at::text as created_at, brand_id from promo_library ${isLibraryCategory(category) ? 'where category = $1' : ''} order by created_at desc limit 600`,
    isLibraryCategory(category) ? [category] : [])).rows
  return rows
}

/** Guarda uma imagem: PNG, JPG, WEBP, GIF ou SVG (rasterizado). Vira WEBP de até 2000 px, com transparência. A mesma imagem não entra duas vezes. */
export async function addLibraryImage(o: { buf: Buffer; fileName: string; category: string; userId: string; brandId?: string | null }): Promise<{ ok: true; id: string; duplicate: boolean } | { ok: false; error: string }> {
  const { buf } = o
  if (buf.length === 0) return { ok: false, error: 'Arquivo vazio.' }
  if (buf.length > MAX_LIBRARY_FILE_BYTES) return { ok: false, error: 'A imagem passa de 4 MB. Reduza o tamanho e envie de novo.' }
  const svg = !sniffImage(buf) && looksLikeSvg(buf)
  if (!svg && !sniffImage(buf)) return { ok: false, error: 'Use PNG, JPG, WEBP, GIF ou SVG.' }
  if (svg && !svgIsSafe(buf)) return { ok: false, error: 'Este SVG usa recursos externos (arquivos, endereços ou scripts). Exporte como PNG ou um SVG simples.' }
  const category: LibraryCategory = isLibraryCategory(o.category) ? o.category : 'outro'
  if (Number((await pool.query(`select count(*)::int n from promo_library`)).rows[0].n) >= MAX_LIBRARY_ITEMS) return { ok: false, error: `A biblioteca aceita até ${MAX_LIBRARY_ITEMS} imagens. Exclua as que não usa mais.` }
  try {
    const out = await sharp(buf, { failOn: 'error', limitInputPixels: 60_000_000, ...(svg ? { density: 300 } : {}) })
      .rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: !svg }).webp({ quality: 90, alphaQuality: 95 }).toBuffer({ resolveWithObject: true })
    const sha = createHash('sha256').update(out.data).digest('hex')
    const dup = (await pool.query(`select id from promo_library where sha256 = $1`, [sha])).rows[0]
    if (dup) {
      if (o.brandId) await pool.query(`update promo_library set brand_id = $2 where id = $1 and brand_id is null`, [dup.id, o.brandId])
      return { ok: true, id: dup.id, duplicate: true }
    }
    const r = await pool.query(
      `insert into promo_library (name, category, data, width, height, sha256, created_by, brand_id) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [libraryName(o.fileName), category, out.data, out.info.width, out.info.height, sha, o.userId, o.brandId ?? null])
    return { ok: true, id: r.rows[0].id, duplicate: false }
  } catch {
    return { ok: false, error: 'Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).' }
  }
}

export async function getLibraryImage(id: string, mini = false): Promise<{ data: Buffer; mime: string; sha: string } | null> {
  const r = (await pool.query(`select data, mime, sha256 from promo_library where id = $1`, [id])).rows[0]
  if (!r) return null
  if (!mini) return { data: r.data, mime: r.mime, sha: r.sha256 }
  const small = await sharp(r.data).resize({ width: 240, height: 240, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
  return { data: small, mime: 'image/webp', sha: `${r.sha256}-m` }
}

export async function updateLibraryItem(id: string, v: { name: string; category: string }): Promise<{ ok: boolean; error?: string }> {
  const name = v.name.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!name) return { ok: false, error: 'Dê um nome à imagem.' }
  if (!isLibraryCategory(v.category)) return { ok: false, error: 'Categoria inválida.' }
  const r = await pool.query(`update promo_library set name = $2, category = $3 where id = $1`, [id, name, v.category])
  return r.rowCount ? { ok: true } : { ok: false, error: 'Imagem não encontrada.' }
}

/** Exclui da biblioteca. As promoções que já usaram a imagem não mudam (elas guardam a própria cópia). */
export async function deleteLibraryItem(id: string): Promise<boolean> {
  return ((await pool.query(`delete from promo_library where id = $1`, [id])).rowCount ?? 0) > 0
}

/** Copia a imagem da biblioteca para a promoção (uma vez só por promoção) e devolve o arquivo para usar como elemento ou fundo. */
export async function importLibraryToCampaign(campaignId: string, libraryId: string, userId: string): Promise<{ ok: true; id: string; width: number; height: number } | { ok: false; error: string }> {
  if (!(await pool.query(`select 1 from promo_campaigns where id = $1`, [campaignId])).rowCount) return { ok: false, error: 'Promoção não encontrada.' }
  const l = (await pool.query(`select data, mime, width, height, sha256 from promo_library where id = $1`, [libraryId])).rows[0]
  if (!l) return { ok: false, error: 'Imagem não encontrada na biblioteca.' }
  const r = await pool.query(
    `insert into promo_assets (campaign_id, data, mime, width, height, sha256, created_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (campaign_id, sha256) do update set sha256 = excluded.sha256 returning id`, [campaignId, l.data, l.mime, l.width, l.height, l.sha256, userId])
  return { ok: true, id: r.rows[0].id, width: l.width, height: l.height }
}

/** Logos e selos oficiais de uma filial (categoria "logo" ligada à filial). */
export async function listBrandLogos(brandId: string): Promise<LibraryItem[]> {
  return (await pool.query(`select id, name, category, width, height, created_at::text as created_at, brand_id from promo_library where brand_id = $1 and category = 'logo' order by created_at`, [brandId])).rows
}
