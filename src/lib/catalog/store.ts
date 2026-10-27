// Catálogo de produtos: leitura, busca, imagens e fila de conferência. Importações com .ts para rodar também em scripts do Node.
import sharp from 'sharp'
import { pool, withTx } from '../db.ts'
import { buildIndex, matchName, nameFromFile, normalizeName, parseEan, searchKey, searchTerms, type Candidate, type NameIndex } from '../domain/catalog.ts'
import { makeTransparent } from './background.ts'
import { processImage } from './images.ts'

// ---------- índice de nomes (descrição + descrições alternativas de cada produto) ----------
let cache: { at: number; idx: NameIndex } | null = null
const TTL_MS = 5 * 60_000
export const invalidateCatalogIndex = () => { cache = null }

export async function catalogIndex(): Promise<NameIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.idx
  const rows = (await pool.query(`select id, description, aliases from products where active`)).rows as { id: string; description: string; aliases: string[] }[]
  const entries: { id: string; description: string }[] = []
  for (const r of rows) {
    const seen = new Set<string>()
    for (const d of [r.description, ...r.aliases]) { const k = normalizeName(d); if (k && !seen.has(k)) { seen.add(k); entries.push({ id: r.id, description: d }) } }
  }
  const idx = buildIndex(entries)
  cache = { at: Date.now(), idx }
  return idx
}

// ---------- tipos ----------
export type ProductCard = {
  id: string; ean: string | null; description: string; group_name: string | null; manufacturer: string | null; active_ingredient: string | null
  thumb_id: string | null; image_count: number
}
export type ProductDetail = {
  id: string; ean: string | null; erp_code: string | null; description: string; aliases: string[]; group_name: string | null; active_ingredient: string | null
  manufacturer: string | null; registro_ms: string | null; tarja: string | null; source: string; active: boolean; updated_at: string
}
export type ImageMeta = {
  id: string; is_primary: boolean; width: number; height: number; size_bytes: number; source: string; license: string | null; attribution: string | null
  source_url: string | null; original_name: string | null; match_method: string | null; match_score: number | null; created_at: string; fundo: string | null
}
export type PendingImage = { id: string; original_name: string | null; suggestions: Candidate[]; created_at: string }

export type CatalogStats = { products: number; withImage: number; images: number; pending: number; review: number }

const NO_PRODUCT = '00000000-0000-0000-0000-000000000000'

export async function catalogStats(): Promise<CatalogStats> {
  const r = (await pool.query(
    `select (select count(*)::int from products where active) as products,
            (select count(distinct product_id)::int from product_images where product_id is not null) as with_image,
            (select count(*)::int from product_images) as images,
            (select count(*)::int from product_images where product_id is null) as pending,
            (select count(*)::int from product_images where match_method = 'similar') as review`)).rows[0]
  return { products: r.products, withImage: r.with_image, images: r.images, pending: r.pending, review: r.review }
}

export async function listGroups(): Promise<string[]> {
  return (await pool.query(`select group_name from products where active and group_name is not null group by group_name order by count(*) desc, group_name limit 60`)).rows.map((r) => r.group_name)
}

const likeAll = (terms: string[]) => terms.map((t) => `%${t.replace(/[\\%_]/g, (c) => '\\' + c)}%`)

export async function searchProducts(o: { q?: string; filter?: 'todos' | 'com' | 'sem'; group?: string; page?: number; pageSize?: number }): Promise<{ rows: ProductCard[]; total: number }> {
  const terms = o.q ? searchTerms(o.q) : []
  const pageSize = Math.min(120, Math.max(1, o.pageSize ?? 48))
  const offset = (Math.max(1, o.page ?? 1) - 1) * pageSize
  const args = [terms.length ? likeAll(terms) : null, o.filter ?? 'todos', o.group || null]
  const where = `p.active and ($1::text[] is null or p.search like all($1))
     and ($3::text is null or p.group_name = $3)
     and ($2 = 'todos' or ($2 = 'com' and exists (select 1 from product_images i where i.product_id = p.id)) or ($2 = 'sem' and not exists (select 1 from product_images i where i.product_id = p.id)))`
  const [rows, total] = await Promise.all([
    pool.query(
      `select p.id, p.ean, p.description, p.group_name, p.manufacturer, p.active_ingredient,
              (select i.id from product_images i where i.product_id = p.id order by i.is_primary desc, i.created_at limit 1) as thumb_id,
              (select count(*)::int from product_images i where i.product_id = p.id) as image_count
         from products p where ${where} order by p.description limit ${pageSize} offset ${offset}`, args),
    pool.query(`select count(*)::int n from products p where ${where}`, args),
  ])
  return { rows: rows.rows, total: total.rows[0].n }
}

/** Busca leve (seletor de produto em conteúdo e fila de conferência). */
export async function pickProducts(q: string, limit = 12): Promise<ProductCard[]> {
  const terms = searchTerms(q)
  if (!terms.length) return []
  return (await pool.query(
    `select p.id, p.ean, p.description, p.group_name, p.manufacturer, p.active_ingredient,
            (select i.id from product_images i where i.product_id = p.id order by i.is_primary desc, i.created_at limit 1) as thumb_id,
            (select count(*)::int from product_images i where i.product_id = p.id) as image_count
       from products p where p.active and p.search like all($1) order by (p.search like $2) desc, length(p.description), p.description limit ${Math.min(30, limit)}`,
    [likeAll(terms), `${terms[0]}%`])).rows
}

export async function getProduct(id: string): Promise<{ product: ProductDetail; images: ImageMeta[]; posts: { id: string; title: string; post_date: string; stage: string }[] } | null> {
  const p = (await pool.query(
    `select id, ean, erp_code, description, aliases, group_name, active_ingredient, manufacturer, registro_ms, tarja, source, active, updated_at::text as updated_at from products where id = $1`, [id])).rows[0]
  if (!p) return null
  const [images, posts] = await Promise.all([
    pool.query(
      `select id, is_primary, width, height, size_bytes, source, license, attribution, source_url, original_name, match_method, match_score::float8 as match_score, created_at::text as created_at, fundo
         from product_images where product_id = $1 order by is_primary desc, created_at`, [id]),
    pool.query(`select p.id, p.title, p.post_date::text as post_date, p.stage from post_products pp join posts p on p.id = pp.post_id where pp.product_id = $1 order by p.post_date desc limit 30`, [id]),
  ])
  return { product: p, images: images.rows, posts: posts.rows }
}

export async function getImageBytes(id: string, thumb: boolean): Promise<{ data: Buffer; mime: string } | null> {
  const r = (await pool.query(`select ${thumb ? 'thumb' : 'data'} as b, mime from product_images where id = $1`, [id])).rows[0]
  return r ? { data: r.b, mime: r.mime } : null
}

export async function listPending(limit = 60): Promise<PendingImage[]> {
  return (await pool.query(`select id, original_name, suggestions, created_at::text as created_at from product_images where product_id is null order by created_at limit $1`, [limit])).rows
}

export async function listReview(limit = 80): Promise<{ id: string; original_name: string | null; match_score: number | null; product_id: string; description: string }[]> {
  return (await pool.query(
    `select i.id, i.original_name, i.match_score::float8 as match_score, p.id as product_id, p.description
       from product_images i join products p on p.id = i.product_id where i.match_method = 'similar' order by i.created_at limit $1`, [limit])).rows
}

// ---------- entrada de imagem ----------
export type IngestResult = {
  file: string
  status: 'ligada' | 'pendente' | 'duplicada' | 'invalida'
  method?: 'exata' | 'similar' | 'manual' | 'ean'
  score?: number
  productId?: string
  description?: string
  imageId?: string
  error?: string
  suggestions?: Candidate[]
}

type Source = 'proprio' | 'upload' | 'open_beauty_facts' | 'open_food_facts' | 'open_products_facts' | 'open_pet_food_facts'

/** Recebe uma imagem: valida, otimiza, tenta ligar a um produto (por EAN no nome do arquivo, descrição exata ou parecida) ou manda para a fila de conferência. */
export async function ingestImage(o: {
  buf: Buffer; fileName: string; userId: string | null; source?: Source; productId?: string | null; method?: 'ean' | 'manual'; requireTransparent?: boolean; preserveCutout?: boolean
  license?: string | null; attribution?: string | null; sourceUrl?: string | null
}): Promise<IngestResult> {
  const file = o.fileName
  const p = await processImage(o.buf)
  if (!p.ok) return { file, status: 'invalida', error: p.error }
  // regra do banco: foto de produto com fundo transparente. Só dá para tirar o fundo quando ele é liso (estúdio/recorte); o resultado vem do original
  let img = p.image
  let fundo: 'transparente' | 'original' = 'original'
  let original: Buffer | null = null
  if(o.preserveCutout){const stats=await sharp(img.data).stats();fundo=stats.isOpaque?'original':'transparente'}else{
  const cut = await makeTransparent(o.buf)
  if (cut.ok) {
    const c = await processImage(cut.png)
    if (c.ok) { original = p.image.data; img = c.image; fundo = 'transparente' }
  }
  }
  // foto de banco aberto sem fundo liso é foto amadora (mão, prateleira, cenário): não serve como foto profissional
  if (fundo === 'original' && (o.requireTransparent || (o.source ?? '').startsWith('open_'))) return { file, status: 'invalida', error: 'Sem fundo liso (não dá para deixar transparente): não usada.' }

  let productId: string | null = o.productId ?? null
  let method: IngestResult['method']
  let score: number | undefined
  let suggestions: Candidate[] = []
  if (productId) { method = o.method ?? 'manual'; if (o.method === 'ean') score = 1 }
  else {
    // arquivo nomeado só com o EAN: liga direto pelo código de barras
    const base = file.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/\s*\(\d+\)\s*$/, '')
    const ean = parseEan(base)
    if (ean) {
      const hit = (await pool.query(`select id from products where ean = $1 and active`, [ean])).rows[0]
      if (hit) { productId = hit.id; method = 'ean'; score = 1 }
    }
    const { name } = nameFromFile(file)
    if (!productId && name) {
      const m = matchName(await catalogIndex(), name)
      suggestions = dedupe(m.candidates)
      if ((m.decision === 'exata' || m.decision === 'similar') && m.best) { productId = m.best.id; method = m.decision; score = m.best.score }
    }
  }

  const insert = async (primary: boolean) => (await pool.query(
    `insert into product_images (product_id, is_primary, data, thumb, width, height, size_bytes, sha256, source, license, attribution, source_url, original_name, match_method, match_score, suggestions, created_by, original, fundo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     on conflict do nothing returning id`,
    [productId, primary, img.data, img.thumb, img.width, img.height, img.data.length, img.sha256, o.source ?? 'upload', o.license ?? null, o.attribution ?? null, o.sourceUrl ?? null,
      file.replace(/^.*[\\/]/, '').slice(0, 200), method ?? null, score ?? null, JSON.stringify(productId ? [] : suggestions), o.userId, original, fundo])).rows[0]
  const hasPrimary = productId ? (await pool.query(`select 1 from product_images where product_id = $1 and is_primary`, [productId])).rowCount! > 0 : true
  let row: { id: string } | undefined
  try { row = await insert(productId !== null && !hasPrimary) } catch (e) {
    if ((e as { code?: string }).code === '23505') row = await insert(false) // outra imagem virou a principal no meio do caminho
    else throw e
  }
  if (!row) return { file, status: 'duplicada', productId: productId ?? undefined }
  if (!productId) return { file, status: 'pendente', imageId: row.id, suggestions }
  const d = (await pool.query(`select description from products where id = $1`, [productId])).rows[0]?.description as string | undefined
  return { file, status: 'ligada', method, score, productId, description: d, imageId: row.id }
}

const dedupe = (c: Candidate[]): Candidate[] => { const seen = new Set<string>(); return c.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, 5) }

// ---------- ações sobre imagens ----------
/** Liga uma imagem da fila a um produto (decisão de uma pessoa). Se o produto já tiver a mesma imagem, a da fila é descartada. */
export async function assignImage(imageId: string, productId: string): Promise<{ ok: boolean; error?: string }> {
  return withTx(async (db) => {
    const img = (await db.query(`select id, sha256, product_id from product_images where id = $1 for update`, [imageId])).rows[0]
    if (!img) return { ok: false, error: 'Imagem não encontrada.' }
    if (!(await db.query(`select 1 from products where id = $1 and active`, [productId])).rowCount) return { ok: false, error: 'Produto não encontrado.' }
    const dup = (await db.query(`select 1 from product_images where product_id = $1 and sha256 = $2 and id <> $3`, [productId, img.sha256, imageId])).rowCount
    if (dup) { await db.query(`delete from product_images where id = $1`, [imageId]); return { ok: true } }
    const hasPrimary = (await db.query(`select 1 from product_images where product_id = $1 and is_primary`, [productId])).rowCount! > 0
    await db.query(`update product_images set product_id = $2, is_primary = $3, match_method = 'manual', match_score = null, suggestions = '[]'::jsonb where id = $1`, [imageId, productId, !hasPrimary])
    return { ok: true }
  })
}

/** Confirma uma ligação "parecida": deixa de aparecer para conferir. */
export async function confirmImage(imageId: string): Promise<void> {
  await pool.query(`update product_images set match_method = 'manual' where id = $1 and match_method = 'similar'`, [imageId])
}

/** Desliga a imagem do produto e a devolve para a fila (ligação errada). */
export async function unlinkImage(imageId: string): Promise<void> {
  await withTx(async (db) => {
    const img = (await db.query(`select product_id, is_primary from product_images where id = $1 for update`, [imageId])).rows[0]
    if (!img?.product_id) return
    await db.query(`update product_images set product_id = null, is_primary = false, match_method = null, match_score = null where id = $1`, [imageId])
    if (img.is_primary) await db.query(`update product_images set is_primary = true where id = (select id from product_images where product_id = $1 order by created_at limit 1)`, [img.product_id])
  })
}

export async function setPrimaryImage(imageId: string): Promise<void> {
  await withTx(async (db) => {
    const img = (await db.query(`select product_id from product_images where id = $1 for update`, [imageId])).rows[0]
    if (!img?.product_id) return
    await db.query(`update product_images set is_primary = false where product_id = $1 and is_primary`, [img.product_id])
    await db.query(`update product_images set is_primary = true where id = $1`, [imageId])
  })
}

export async function deleteImage(imageId: string): Promise<void> {
  await withTx(async (db) => {
    const img = (await db.query(`delete from product_images where id = $1 returning product_id, is_primary`, [imageId])).rows[0]
    if (img?.product_id && img.is_primary) await db.query(`update product_images set is_primary = true where id = (select id from product_images where product_id = $1 order by created_at limit 1)`, [img.product_id])
  })
}

// ---------- produto ----------
export type ProductInput = { description: string; ean: string | null; group_name: string | null; manufacturer: string | null; active_ingredient: string | null }

export async function saveProduct(id: string | null, v: ProductInput, userId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const description = v.description.trim().replace(/\s+/g, ' ')
  if (description.length < 2 || description.length > 300) return { ok: false, error: 'A descrição deve ter de 2 a 300 caracteres.' }
  if (v.ean && !parseEan(v.ean)) return { ok: false, error: 'Código de barras inválido (precisa ser um EAN/GTIN de 8, 12, 13 ou 14 dígitos com o dígito verificador certo).' }
  const ean = v.ean ? parseEan(v.ean) : null
  const name_key = normalizeName(description)
  const search = searchKey(description, ean, v.manufacturer, v.active_ingredient, v.group_name)
  try {
    if (id) {
      const r = await pool.query(
        `update products set description = $2, ean = $3, name_key = $4, search = $5, group_name = $6, manufacturer = $7, active_ingredient = $8, updated_at = now() where id = $1 returning id`,
        [id, description, ean, name_key, search, v.group_name, v.manufacturer, v.active_ingredient])
      if (!r.rowCount) return { ok: false, error: 'Produto não encontrado.' }
      invalidateCatalogIndex()
      return { ok: true, id }
    }
    const r = await pool.query(
      `insert into products (ean, description, name_key, search, group_name, manufacturer, active_ingredient, source, created_by) values ($1,$2,$3,$4,$5,$6,$7,'manual',$8) returning id`,
      [ean, description, name_key, search, v.group_name, v.manufacturer, v.active_ingredient, userId])
    invalidateCatalogIndex()
    return { ok: true, id: r.rows[0].id }
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { ok: false, error: 'Já existe um produto com este código de barras (ou, sem código, com esta descrição).' }
    throw e
  }
}

// ---------- produtos em conteúdos ----------
export async function getPostProducts(postId: string): Promise<ProductCard[]> {
  return (await pool.query(
    `select p.id, p.ean, p.description, p.group_name, p.manufacturer, p.active_ingredient,
            (select i.id from product_images i where i.product_id = p.id order by i.is_primary desc, i.created_at limit 1) as thumb_id,
            (select count(*)::int from product_images i where i.product_id = p.id) as image_count
       from post_products pp join products p on p.id = pp.product_id where pp.post_id = $1 order by pp.added_at`, [postId])).rows
}

export async function setPostProducts(postId: string, productIds: string[], userId: string): Promise<void> {
  const ids = [...new Set(productIds)].slice(0, 30)
  await withTx(async (db) => {
    await db.query(`delete from post_products where post_id = $1 and not (product_id = any($2::uuid[]))`, [postId, ids])
    if (ids.length) await db.query(`insert into post_products (post_id, product_id, added_by) select $1, x, $3 from unnest($2::uuid[]) x where exists (select 1 from products where id = x) on conflict do nothing`, [postId, ids, userId])
  })
}

export const NO_PRODUCT_ID = NO_PRODUCT
