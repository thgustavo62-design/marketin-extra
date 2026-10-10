// Publicações reais (Instagram) e seus retratos de métricas, lidos do banco — nunca do Windsor ao vivo.
import { pool } from '../db'
import { mediaFormat, type MediaFormat, type PubMetrics } from '../domain'

export type PublicationRow = {
  id: string; brand_id: string; brand_name: string; branch_id: string | null; account_name: string; external_media_id: string
  permalink: string | null; media_type: string | null; media_product_type: string | null; caption_excerpt: string | null
  published_at: string | null; published_on: string | null; format: MediaFormat
  content_id: string | null; content_title: string | null; link_method: 'api' | 'manual' | 'verified_match' | null; linked_by_name: string | null
  metrics: PubMetrics | null; collected_at: string | null; collected_on: string | null; data_quality: 'complete' | 'partial' | null
}

export type PublicationFilter = { brand?: string; branchId?: string; from?: string; unlinkedOnly?: boolean }

const SQL = `
  select e.id, e.brand_id, b.name as brand_name, e.branch_id, e.account_name, e.external_media_id, e.permalink, e.media_type, e.media_product_type,
         e.caption_excerpt, e.published_at::text as published_at, (e.published_at at time zone 'America/Sao_Paulo')::date::text as published_on, e.content_id, p.title as content_title, e.link_method, ul.display_name as linked_by_name,
         s.collected_at::text as collected_at, s.collected_on::text as collected_on, s.data_quality,
         s.reach, s.views, s.likes, s.comments, s.saves, s.shares, s.reel_interactions
    from external_publications e
    join brands b on b.id = e.brand_id
    left join posts p on p.id = e.content_id
    left join users ul on ul.id = e.linked_by
    left join lateral (select * from publication_metric_snapshots x where x.publication_id = e.id order by x.collected_on desc limit 1) s on true`

export async function listPublications(f: PublicationFilter, limit = 300): Promise<PublicationRow[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.branchId) { args.push(f.branchId); w.push(`(e.branch_id = $${args.length} or e.branch_id is null)`) }
  if (f.from) { args.push(f.from); w.push(`e.published_at >= $${args.length}::date`) }
  if (f.unlinkedOnly) w.push(`e.content_id is null`)
  const rows = (await pool.query(`${SQL} ${w.length ? 'where ' + w.join(' and ') : ''} order by e.published_at desc nulls last limit ${Math.min(limit, 500)}`, args)).rows
  return rows.map((r) => ({
    id: r.id, brand_id: r.brand_id, brand_name: r.brand_name, branch_id: r.branch_id, account_name: r.account_name, external_media_id: r.external_media_id,
    permalink: r.permalink, media_type: r.media_type, media_product_type: r.media_product_type, caption_excerpt: r.caption_excerpt,
    published_at: r.published_at, published_on: r.published_on,
    format: mediaFormat(r.media_product_type, r.media_type),
    content_id: r.content_id, content_title: r.content_title, link_method: r.link_method, linked_by_name: r.linked_by_name,
    metrics: r.collected_on ? { reach: r.reach, views: r.views, likes: r.likes, comments: r.comments, saves: r.saves, shares: r.shares, reel_interactions: r.reel_interactions } : null,
    collected_at: r.collected_at, collected_on: r.collected_on, data_quality: r.data_quality,
  }))
}

// Conteúdos que podem receber uma publicação: da mesma filial, perto da data, sem cancelados.
export type Candidate = { id: string; brand_id: string; title: string; post_date: string; format: 'feed' | 'carrossel' | 'reels'; stage: string }

export async function listCandidatePosts(brandIds: string[], from: string, to: string): Promise<Candidate[]> {
  if (brandIds.length === 0) return []
  return (await pool.query(
    `select id, brand_id, title, post_date::text as post_date, format, stage from posts
      where brand_id = any($1) and post_date between $2 and $3 and stage <> 'cancelado' order by post_date, title limit 2000`, [brandIds, from, to])).rows
}

// Última coleta das filiais informadas (mostra "atualizado em" e aplica o limite de uso da API).
export async function lastCollection(brandIds: string[]): Promise<string | null> {
  const r = (await pool.query(
    `select greatest(
        (select max(s.collected_at) from publication_metric_snapshots s join external_publications e on e.id = s.publication_id where e.brand_id = any($1)),
        (select max(a.collected_at) from account_metric_snapshots a where a.brand_id = any($1))
      )::text as at`, [brandIds])).rows[0]
  return r?.at ?? null
}
