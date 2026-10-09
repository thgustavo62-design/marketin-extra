// Consultas de leitura (servidor). Datas voltam como texto ISO para evitar fuso.
import { pool } from './db'
import { normalizeReels, type Format, type Pillar, type ReelsScript, type Stage, type KnowledgeKind } from './domain'

export type Brand = { id: string; slug: string; name: string }
export type Branch = { id: string; brand_id: string; name: string; city: string | null; address: string | null; phone: string | null; hours: string | null; active: boolean }
export type Campaign = { id: string; brand_id: string; brand_name: string; name: string; starts_on: string; ends_on: string; objective: string; briefing: string; approver: string }
export type Post = {
  id: string; brand_id: string; brand_name: string; brand_slug: string
  branch_id: string | null; branch_name: string | null
  campaign_id: string | null; campaign_name: string | null
  title: string; post_date: string; post_time: string | null
  format: Format; pillar: Pillar; stage: Stage
  caption: string; script: string; reels: ReelsScript; origin: string; pharma_review: boolean
  reach: number | null; saves: number | null; shares: number | null; revision: number
}
export type Knowledge = {
  id: string; brand_id: string; brand_name: string; kind: KnowledgeKind; title: string; content: string
  source: string; owner: string; valid_until: string | null; confirmed: boolean; updated_at: string
}

export async function getBrands(): Promise<Brand[]> {
  return (await pool.query(`select id, slug, name from brands order by name`)).rows
}

export async function getBranches(): Promise<Branch[]> {
  return (await pool.query(`select id, brand_id, name, city, address, phone, hours, active from branches order by name`)).rows
}

const CAMPAIGN_SQL = `select c.id, c.brand_id, b.name as brand_name, c.name, c.starts_on::text as starts_on, c.ends_on::text as ends_on,
  c.objective, c.briefing, c.approver from campaigns c join brands b on b.id = c.brand_id`

export async function getCampaigns(): Promise<Campaign[]> {
  return (await pool.query(`${CAMPAIGN_SQL} order by c.ends_on desc, c.name`)).rows
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return (await pool.query(`${CAMPAIGN_SQL} where c.id = $1`, [id])).rows[0] ?? null
}

export type PostFilter = { brand?: string; branchId?: string; q?: string; from?: string; to?: string; stage?: string; format?: string; onlyUnpublished?: boolean; onlyPublished?: boolean }

const POST_SQL = `select p.id, p.brand_id, b.name as brand_name, b.slug as brand_slug, p.branch_id, br.name as branch_name,
  p.campaign_id, coalesce(c.name, p.campaign_name) as campaign_name, p.title, p.post_date::text as post_date,
  to_char(p.post_time, 'HH24:MI') as post_time, p.format, p.pillar, p.stage, p.caption, p.script, p.reels, p.origin,
  p.pharma_review, p.reach, p.saves, p.shares, p.revision
  from posts p join brands b on b.id = p.brand_id
  left join branches br on br.id = p.branch_id
  left join campaigns c on c.id = p.campaign_id`

function mapPost(r: Record<string, unknown>): Post {
  return { ...(r as unknown as Post), reels: normalizeReels(r.reels) }
}

export async function listPosts(f: PostFilter = {}): Promise<Post[]> {
  const where: string[] = []
  const args: unknown[] = []
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)) }
  if (f.brand) add('b.slug = ?', f.brand)
  // Filial: conteúdos dela + os de "Todas as unidades" da rede.
  if (f.branchId) add('(p.branch_id = ? or p.branch_id is null)', f.branchId)
  if (f.from) add('p.post_date >= ?', f.from)
  if (f.to) add('p.post_date <= ?', f.to)
  if (f.stage) add('p.stage = ?', f.stage)
  if (f.format) add('p.format = ?', f.format)
  if (f.q) {
    args.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`)
    const n = args.length
    where.push(`(p.title ilike $${n} or p.caption ilike $${n} or p.script ilike $${n})`)
  }
  if (f.onlyUnpublished) where.push(`p.stage <> 'publicado'`)
  if (f.onlyPublished) where.push(`p.stage = 'publicado'`)
  const sql = `${POST_SQL} ${where.length ? 'where ' + where.join(' and ') : ''} order by p.post_date, p.post_time nulls last, p.created_at`
  return (await pool.query(sql, args)).rows.map(mapPost)
}

export async function getPost(id: string): Promise<Post | null> {
  const r = (await pool.query(`${POST_SQL} where p.id = $1`, [id])).rows[0]
  return r ? mapPost(r) : null
}

export type IntegrationAccount = {
  id: string; kind: 'instagram' | 'ads'; account_name: string
  brand_id: string | null; brand_name: string | null; branch_id: string | null; branch_name: string | null
}

export async function getIntegrationAccounts(): Promise<IntegrationAccount[]> {
  return (await pool.query(
    `select a.id, a.kind, a.account_name, a.brand_id, b.name as brand_name, a.branch_id, br.name as branch_name
       from integration_accounts a
       left join brands b on b.id = a.brand_id
       left join branches br on br.id = a.branch_id
      order by a.kind, a.account_name`,
  )).rows
}

export type UserRow = {
  id: string; username: string; display_name: string; role: string; active: boolean
  must_change_password: boolean; created_at: string; last_login: string | null
}

export async function listUsers(): Promise<UserRow[]> {
  return (await pool.query(
    `select u.id, u.username, coalesce(u.display_name, u.username) as display_name, u.role, u.active, u.must_change_password,
            u.created_at::text as created_at,
            (select max(s.created_at)::text from sessions s where s.user_id = u.id) as last_login
       from users u order by u.active desc, u.created_at`,
  )).rows
}

export async function listKnowledge(): Promise<Knowledge[]> {
  return (await pool.query(
    `select k.id, k.brand_id, b.name as brand_name, k.kind, k.title, k.content, k.source, k.owner,
            k.valid_until::text as valid_until, k.confirmed, k.updated_at::text as updated_at
       from knowledge k join brands b on b.id = k.brand_id order by b.name, k.kind, k.title`,
  )).rows
}
