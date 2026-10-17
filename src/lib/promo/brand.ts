// Kit de marca por filial (cores, fontes aprovadas, textos prontos); os logos ficam na biblioteca, ligados à filial.
import { pool } from '../db.ts'
import { emptyKit, normalizeKit, type BrandKit } from '../domain/promo-brand.ts'
import { listBrandLogos, type LibraryItem } from './library.ts'

export async function getKit(brandId: string): Promise<BrandKit & { logos: LibraryItem[] }> {
  const r = (await pool.query(`select colors, fonts, texts from brand_kits where brand_id = $1`, [brandId])).rows[0]
  return { ...(r ? normalizeKit(r) : emptyKit()), logos: await listBrandLogos(brandId) }
}

export async function saveKit(brandId: string, raw: unknown, userId: string): Promise<{ ok: boolean; error?: string; kit?: BrandKit }> {
  if (!(await pool.query(`select 1 from brands where id = $1`, [brandId])).rowCount) return { ok: false, error: 'Filial não encontrada.' }
  const kit = normalizeKit(raw)
  await pool.query(
    `insert into brand_kits (brand_id, colors, fonts, texts, updated_by) values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
     on conflict (brand_id) do update set colors = excluded.colors, fonts = excluded.fonts, texts = excluded.texts, updated_by = excluded.updated_by, updated_at = now()`,
    [brandId, JSON.stringify(kit.colors), JSON.stringify(kit.fonts), JSON.stringify(kit.texts), userId])
  return { ok: true, kit }
}
