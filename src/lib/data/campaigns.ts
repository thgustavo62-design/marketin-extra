import { pool } from '../db'

export type Campaign = { id: string; brand_id: string; brand_name: string; name: string; starts_on: string; ends_on: string; objective: string; briefing: string; approver: string }

const SQL = `select c.id, c.brand_id, b.name as brand_name, c.name, c.starts_on::text as starts_on, c.ends_on::text as ends_on,
  c.objective, c.briefing, c.approver from campaigns c join brands b on b.id = c.brand_id`

export async function getCampaigns(): Promise<Campaign[]> {
  return (await pool.query(`${SQL} order by c.ends_on desc, c.name`)).rows
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return (await pool.query(`${SQL} where c.id = $1`, [id])).rows[0] ?? null
}
