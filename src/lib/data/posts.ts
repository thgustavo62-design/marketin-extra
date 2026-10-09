import { pool } from '../db'
import { normalizeReels, type Format, type Pillar, type ReelsScript, type Stage } from '../domain'

// "Leve": o que listas e calendário precisam. Sem legenda, roteiro nem JSON do Reels (campos pesados).
export type PostRow = {
  id: string; brand_id: string; brand_name: string; brand_slug: string
  branch_id: string | null; branch_name: string | null
  title: string; post_date: string; post_time: string | null
  format: Format; pillar: Pillar; stage: Stage
}

// Completo: edição, Reels, resultados, CSV.
export type Post = PostRow & {
  campaign_id: string | null; campaign_name: string | null
  caption: string; script: string; reels: ReelsScript; origin: string; pharma_review: boolean; compliance_note: string | null
  reach: number | null; saves: number | null; shares: number | null; revision: number
}

export type PostFilter = {
  brand?: string; branchId?: string; q?: string; from?: string; to?: string; stage?: string; format?: string
  onlyPublished?: boolean
}

const JOINS = `from posts p join brands b on b.id = p.brand_id left join branches br on br.id = p.branch_id`
const LITE_COLS = `p.id, p.brand_id, b.name as brand_name, b.slug as brand_slug, p.branch_id, br.name as branch_name,
  p.title, p.post_date::text as post_date, to_char(p.post_time, 'HH24:MI') as post_time, p.format, p.pillar, p.stage`
const FULL_COLS = `${LITE_COLS}, p.campaign_id, coalesce(c.name, p.campaign_name) as campaign_name,
  p.caption, p.script, p.reels, p.origin, p.pharma_review, p.compliance_note, p.reach, p.saves, p.shares, p.revision`
const FULL_JOINS = `${JOINS} left join campaigns c on c.id = p.campaign_id`
const ORDER = `order by p.post_date, p.post_time nulls last, p.created_at`

function where(f: PostFilter) {
  const w: string[] = []
  const args: unknown[] = []
  const add = (sql: string, v: unknown) => { args.push(v); w.push(sql.replace('?', `$${args.length}`)) }
  if (f.brand) add('b.slug = ?', f.brand)
  // Unidade: conteúdos dela + os de "Todas as unidades" da filial.
  if (f.branchId) add('(p.branch_id = ? or p.branch_id is null)', f.branchId)
  if (f.from) add('p.post_date >= ?', f.from)
  if (f.to) add('p.post_date <= ?', f.to)
  if (f.stage) add('p.stage = ?', f.stage)
  if (f.format) add('p.format = ?', f.format)
  if (f.q) {
    args.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`)
    const n = args.length
    w.push(`(p.title ilike $${n} or p.caption ilike $${n} or p.script ilike $${n})`)
  }
  if (f.onlyPublished) w.push(`p.stage = 'publicado'`)
  return { clause: w.length ? 'where ' + w.join(' and ') : '', args }
}

export async function listPostsLite(f: PostFilter = {}, page: { limit: number; offset?: number } = { limit: 500 }): Promise<PostRow[]> {
  const { clause, args } = where(f)
  args.push(page.limit, page.offset ?? 0)
  const sql = `select ${LITE_COLS} ${JOINS} ${clause} ${ORDER} limit $${args.length - 1} offset $${args.length}`
  return (await pool.query(sql, args)).rows
}

export async function countPosts(f: PostFilter = {}): Promise<number> {
  const { clause, args } = where(f)
  return (await pool.query(`select count(*)::int as n ${JOINS} ${clause}`, args)).rows[0].n
}

const mapFull = (r: Record<string, unknown>): Post => ({ ...(r as unknown as Post), reels: normalizeReels(r.reels) })

export async function listPosts(f: PostFilter = {}, limit = 2000): Promise<Post[]> {
  const { clause, args } = where(f)
  args.push(limit)
  const sql = `select ${FULL_COLS} ${FULL_JOINS} ${clause} ${ORDER} limit $${args.length}`
  return (await pool.query(sql, args)).rows.map(mapFull)
}

export async function getPost(id: string): Promise<Post | null> {
  const r = (await pool.query(`select ${FULL_COLS} ${FULL_JOINS} where p.id = $1`, [id])).rows[0]
  return r ? mapFull(r) : null
}
