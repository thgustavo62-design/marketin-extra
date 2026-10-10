// Links de campanha (UTM + QR).
import { pool } from '../db'

export type CampaignLink = {
  id: string; brand_id: string; brand_name: string; branch_id: string | null; branch_name: string | null; campaign_id: string | null; campaign_name: string | null
  label: string; destination_url: string; final_url: string; utm_source: string; utm_medium: string; utm_campaign: string; utm_term: string | null; utm_content: string | null
  status: 'rascunho' | 'aprovado' | 'arquivado'; notes: string | null; created_by: string | null; created_by_name: string | null
  approved_by_name: string | null; approved_at: string | null; created_at: string
}

export async function listLinks(f: { brand?: string; branchId?: string; status?: string }): Promise<CampaignLink[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.branchId) { args.push(f.branchId); w.push(`(l.branch_id = $${args.length} or l.branch_id is null)`) }
  if (f.status) { args.push(f.status); w.push(`l.status = $${args.length}`) } else w.push(`l.status <> 'arquivado'`)
  return (await pool.query(
    `select l.id, l.brand_id, b.name as brand_name, l.branch_id, br.name as branch_name, l.campaign_id, c.name as campaign_name, l.label, l.destination_url, l.final_url,
            l.utm_source, l.utm_medium, l.utm_campaign, l.utm_term, l.utm_content, l.status, l.notes, l.created_by, uc.display_name as created_by_name,
            ua.display_name as approved_by_name, l.approved_at::text as approved_at, l.created_at::text as created_at
       from campaign_links l join brands b on b.id = l.brand_id left join branches br on br.id = l.branch_id left join campaigns c on c.id = l.campaign_id
       left join users uc on uc.id = l.created_by left join users ua on ua.id = l.approved_by
      where ${w.join(' and ')} order by l.created_at desc limit 300`, args)).rows
}
