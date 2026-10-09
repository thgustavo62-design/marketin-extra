import { pool } from '../db'
import type { KnowledgeKind } from '../domain'

export type Knowledge = {
  id: string; brand_id: string; brand_name: string; kind: KnowledgeKind; title: string; content: string
  source: string; owner: string; valid_until: string | null; confirmed: boolean; updated_at: string
}

export async function listKnowledge(): Promise<Knowledge[]> {
  return (await pool.query(
    `select k.id, k.brand_id, b.name as brand_name, k.kind, k.title, k.content, k.source, k.owner,
            k.valid_until::text as valid_until, k.confirmed, k.updated_at::text as updated_at
       from knowledge k join brands b on b.id = k.brand_id order by b.name, k.kind, k.title`,
  )).rows
}
