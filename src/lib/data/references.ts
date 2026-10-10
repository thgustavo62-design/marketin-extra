// Referências (concorrentes) e biblioteca de inspirações — cadastro manual.
import { pool } from '../db'
import type { InspirationKind, Network } from '../domain'

export type Reference = {
  id: string; brand_id: string; brand_name: string; name: string; network: Network; url: string | null; category: string | null; region: string | null
  relevance: 1 | 2 | 3; notes: string | null; active: boolean; inspirations: number
}
export type Inspiration = {
  id: string; brand_id: string; brand_name: string; reference_id: string | null; reference_name: string | null; campaign_id: string | null; campaign_name: string | null
  post_id: string | null; post_title: string | null; asset_id: string | null; asset_title: string | null
  kind: InspirationKind; title: string; description: string; source_url: string | null; tags: string[]; created_by_name: string | null; created_at: string
}

export async function listReferences(f: { brand?: string; includeInactive?: boolean }): Promise<Reference[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (!f.includeInactive) w.push('r.active')
  return (await pool.query(
    `select r.id, r.brand_id, b.name as brand_name, r.name, r.network, r.url, r.category, r.region, r.relevance::int as relevance, r.notes, r.active,
            (select count(*)::int from inspirations i where i.reference_id = r.id) as inspirations
       from reference_accounts r join brands b on b.id = r.brand_id ${w.length ? 'where ' + w.join(' and ') : ''}
      order by r.active desc, r.relevance desc, r.name limit 300`, args)).rows
}

export async function listInspirations(f: { brand?: string; kind?: string; tag?: string; referenceId?: string; q?: string }): Promise<Inspiration[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.kind) { args.push(f.kind); w.push(`i.kind = $${args.length}`) }
  if (f.tag) { args.push(f.tag); w.push(`$${args.length} = any(i.tags)`) }
  if (f.referenceId) { args.push(f.referenceId); w.push(`i.reference_id = $${args.length}`) }
  if (f.q) { args.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`); w.push(`(i.title ilike $${args.length} or i.description ilike $${args.length})`) }
  return (await pool.query(
    `select i.id, i.brand_id, b.name as brand_name, i.reference_id, r.name as reference_name, i.campaign_id, c.name as campaign_name, i.post_id, p.title as post_title,
            i.asset_id, a.title as asset_title, i.kind, i.title, i.description, i.source_url, i.tags, u.display_name as created_by_name, i.created_at::text as created_at
       from inspirations i join brands b on b.id = i.brand_id left join reference_accounts r on r.id = i.reference_id left join campaigns c on c.id = i.campaign_id
       left join posts p on p.id = i.post_id left join media_assets a on a.id = i.asset_id left join users u on u.id = i.created_by
      ${w.length ? 'where ' + w.join(' and ') : ''} order by i.created_at desc limit 300`, args)).rows
}

export async function listInspirationTags(brand?: string): Promise<string[]> {
  return (await pool.query(
    `select distinct t from inspirations i join brands b on b.id = i.brand_id, unnest(i.tags) t where ($1::text is null or b.slug = $1) order by t limit 100`, [brand ?? null])).rows.map((r) => r.t)
}
