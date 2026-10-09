// Biblioteca de mídias: leitura. Nunca devolve os bytes (ficam em media_blobs, lidos só no download).
import { pool } from '../db'

export type Asset = {
  id: string; brand_id: string; brand_name: string; branch_id: string | null; branch_name: string | null
  kind: 'file' | 'link'; title: string; original_name: string | null; mime_type: string | null; size_bytes: number | null
  external_url: string | null; group_id: string; version_number: number; versions: number
  is_final: boolean; reusable_approved: boolean; notes: string | null; uploaded_by_name: string | null
  created_at: string; tags: string[]; uses: number
}

export type AssetFilter = { brand?: string; branchId?: string; tag?: string; kind?: string; q?: string }

const COLS = `l.id, l.brand_id, b.name as brand_name, l.branch_id, br.name as branch_name, l.kind, l.title, l.original_name, l.mime_type,
  l.size_bytes, l.external_url, l.group_id, l.version_number, l.is_final, l.reusable_approved, l.notes, u.display_name as uploaded_by_name,
  l.created_at::text as created_at,
  (select count(*)::int from media_assets v where v.group_id = l.group_id and v.deleted_at is null) as versions,
  coalesce((select array_agg(t.tag order by t.tag) from media_asset_tags t where t.asset_id = l.id), '{}') as tags,
  (select count(distinct k.post_id)::int from content_asset_links k join media_assets m on m.id = k.asset_id where m.group_id = l.group_id) as uses`

// Última versão de cada peça (group_id), respeitando os filtros.
function latestSql(f: AssetFilter) {
  const w: string[] = ['a.deleted_at is null']
  const args: unknown[] = []
  const add = (sql: string, v: unknown) => { args.push(v); w.push(sql.replace('?', `$${args.length}`)) }
  if (f.brand) add('a.brand_id = (select id from brands where slug = ?)', f.brand)
  if (f.branchId) add('(a.branch_id = ? or a.branch_id is null)', f.branchId)
  if (f.kind === 'file' || f.kind === 'link') add('a.kind = ?', f.kind)
  if (f.tag) add('exists (select 1 from media_asset_tags t where t.asset_id = a.id and t.tag = ?)', f.tag)
  if (f.q) {
    args.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`)
    w.push(`(a.title ilike $${args.length} or a.original_name ilike $${args.length})`)
  }
  const sql = `select distinct on (a.group_id) a.* from media_assets a where ${w.join(' and ')} order by a.group_id, a.version_number desc`
  return { sql, args }
}

export async function listAssets(f: AssetFilter = {}, page = { limit: 24, offset: 0 }): Promise<Asset[]> {
  const { sql, args } = latestSql(f)
  args.push(page.limit, page.offset)
  return (await pool.query(
    `with l as (${sql}) select ${COLS} from l join brands b on b.id = l.brand_id left join branches br on br.id = l.branch_id left join users u on u.id = l.uploaded_by
      order by l.created_at desc limit $${args.length - 1} offset $${args.length}`, args)).rows
}

export async function countAssets(f: AssetFilter = {}): Promise<number> {
  const { sql, args } = latestSql(f)
  return (await pool.query(`with l as (${sql}) select count(*)::int as n from l`, args)).rows[0].n
}

export async function listAllTags(brand?: string): Promise<string[]> {
  return (await pool.query(
    `select distinct t.tag from media_asset_tags t join media_assets a on a.id = t.asset_id
      where a.deleted_at is null and ($1::text is null or a.brand_id = (select id from brands where slug = $1)) order by 1 limit 80`, [brand ?? null])).rows.map((r) => r.tag)
}

export type AssetDetail = {
  asset: Asset
  versions: { id: string; version_number: number; title: string; kind: 'file' | 'link'; mime_type: string | null; size_bytes: number | null; external_url: string | null; is_final: boolean; uploaded_by_name: string | null; created_at: string }[]
  usedIn: { post_id: string; title: string; role: string }[]
}

export async function getAssetDetail(id: string): Promise<AssetDetail | null> {
  const found = (await pool.query(`select group_id from media_assets where id = $1 and deleted_at is null`, [id])).rows[0]
  if (!found) return null
  const [asset, versions, usedIn] = await Promise.all([
    pool.query(
      `with l as (select * from media_assets where group_id = $1 and deleted_at is null order by version_number desc limit 1)
       select ${COLS} from l join brands b on b.id = l.brand_id left join branches br on br.id = l.branch_id left join users u on u.id = l.uploaded_by`, [found.group_id]),
    pool.query(
      `select a.id, a.version_number, a.title, a.kind, a.mime_type, a.size_bytes, a.external_url, a.is_final, u.display_name as uploaded_by_name, a.created_at::text as created_at
         from media_assets a left join users u on u.id = a.uploaded_by where a.group_id = $1 and a.deleted_at is null order by a.version_number desc`, [found.group_id]),
    pool.query(
      `select p.id as post_id, p.title, k.role from content_asset_links k join posts p on p.id = k.post_id join media_assets a on a.id = k.asset_id
        where a.group_id = $1 order by p.post_date desc`, [found.group_id]),
  ])
  return asset.rows[0] ? { asset: asset.rows[0], versions: versions.rows, usedIn: usedIn.rows } : null
}

export type PostAsset = {
  asset_id: string; role: 'reference' | 'draft' | 'final' | 'thumbnail'; title: string; kind: 'file' | 'link'
  mime_type: string | null; size_bytes: number | null; external_url: string | null; version_number: number
}

export async function listPostAssets(postId: string): Promise<PostAsset[]> {
  return (await pool.query(
    `select k.asset_id, k.role, a.title, a.kind, a.mime_type, a.size_bytes, a.external_url, a.version_number
       from content_asset_links k join media_assets a on a.id = k.asset_id where k.post_id = $1 and a.deleted_at is null order by k.sort_order, k.linked_at`, [postId])).rows
}

export async function listPickerAssets(brandId: string, q?: string): Promise<{ id: string; title: string; kind: 'file' | 'link'; mime_type: string | null; version_number: number }[]> {
  const args: unknown[] = [brandId]
  let extra = ''
  if (q) { args.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`); extra = `and a.title ilike $2` }
  return (await pool.query(
    `select id, title, kind, mime_type, version_number from (
       select distinct on (a.group_id) a.* from media_assets a where a.brand_id = $1 and a.deleted_at is null ${extra} order by a.group_id, a.version_number desc
     ) l order by created_at desc limit 40`, args)).rows
}
