// Imagem de produto pelo código de barras em bancos abertos (Open Beauty Facts e Open Food Facts, imagens CC BY-SA 3.0).
// A licença exige dar crédito: autor/fonte e licença ficam gravados junto da imagem.
import { safeFetch } from '../external/fetch.ts'
import { pool } from '../db.ts'
import { ingestImage, type IngestResult } from './store.ts'

export const OPEN_LICENSE = 'CC BY-SA 3.0'
type Db = 'open_beauty_facts' | 'open_food_facts'
const HOSTS: Record<Db, { api: string; page: string; label: string }> = {
  open_beauty_facts: { api: 'https://world.openbeautyfacts.org', page: 'https://world.openbeautyfacts.org/product', label: 'Open Beauty Facts' },
  open_food_facts: { api: 'https://world.openfoodfacts.org', page: 'https://world.openfoodfacts.org/product', label: 'Open Food Facts' },
}
const IMAGE_HOST = /^https:\/\/images\.open(beauty|food)facts\.org\//

export type OpenHit = { source: Db; ean: string; name: string | null; brands: string | null; imageUrl: string; pageUrl: string }

/** Procura o produto pelo EAN, primeiro em beleza/higiene e depois em alimentos. Devolve null se nenhum banco tem foto dele. */
export async function findOpenImage(ean: string): Promise<{ hit: OpenHit | null; error?: string }> {
  for (const source of ['open_beauty_facts', 'open_food_facts'] as Db[]) {
    const h = HOSTS[source]
    const r = await safeFetch(`${h.api}/api/v2/product/${ean}.json?fields=code,product_name,brands,image_front_url,image_url`, { timeoutMs: 15_000, maxBytes: 200_000, accept: 'application/json' })
    if (!r.ok) {
      if (/erro 404/.test(r.error)) continue // não consta neste banco
      return { hit: null, error: r.error }
    }
    let j: { status?: number; product?: { product_name?: string; brands?: string; image_front_url?: string; image_url?: string } }
    try { j = JSON.parse(r.body.toString('utf8')) } catch { continue }
    const p = j.product
    const url = p?.image_front_url || p?.image_url
    if (j.status !== 1 || !p || !url || !IMAGE_HOST.test(url)) continue
    return { hit: { source, ean, name: p.product_name?.trim() || null, brands: p.brands?.trim() || null, imageUrl: url, pageUrl: `${h.page}/${ean}` } }
  }
  return { hit: null }
}

/** Baixa a imagem do achado (versão grande quando existe) e grava ligada ao produto, com fonte, licença e crédito. */
export async function importOpenHit(productId: string, hit: OpenHit, userId: string | null): Promise<IngestResult> {
  const big = hit.imageUrl.replace(/\.(\d+)\.jpg$/, '.full.jpg')
  let img = big !== hit.imageUrl ? await safeFetch(big, { timeoutMs: 30_000, maxBytes: 6 * 1024 * 1024, accept: 'image/*' }) : { ok: false as const, error: '' }
  if (!img.ok) img = await safeFetch(hit.imageUrl, { timeoutMs: 30_000, maxBytes: 6 * 1024 * 1024, accept: 'image/*' })
  if (!img.ok) return { file: hit.ean, status: 'invalida', error: img.error }
  return ingestImage({
    buf: img.body, fileName: `${hit.ean}.jpg`, userId, source: hit.source, productId, method: 'ean',
    license: OPEN_LICENSE, attribution: `${HOSTS[hit.source].label} — colaboradores${hit.brands ? ` (${hit.brands})` : ''}`, sourceUrl: hit.pageUrl,
  })
}

/** Busca e grava a foto de um produto pelo EAN. */
export async function fetchProductImage(productId: string, userId: string | null): Promise<{ ok: boolean; message: string }> {
  const p = (await pool.query(`select ean from products where id = $1`, [productId])).rows[0] as { ean: string | null } | undefined
  if (!p) return { ok: false, message: 'Produto não encontrado.' }
  if (!p.ean) return { ok: false, message: 'Este produto não tem código de barras cadastrado.' }
  const { hit, error } = await findOpenImage(p.ean)
  if (error) return { ok: false, message: error }
  if (!hit) return { ok: false, message: 'Este código de barras não tem foto nos bancos abertos (Open Beauty Facts e Open Food Facts). Envie a imagem manualmente.' }
  const r = await importOpenHit(productId, hit, userId)
  if (r.status === 'ligada') return { ok: true, message: `Foto adicionada (${HOSTS[hit.source].label}, ${OPEN_LICENSE}).` }
  if (r.status === 'duplicada') return { ok: true, message: 'Esta foto já estava no produto.' }
  return { ok: false, message: r.error ?? 'Não consegui usar a foto encontrada.' }
}
