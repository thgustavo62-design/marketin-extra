// Modelos de campanha recorrente e suas instâncias geradas.
import { pool } from '../db'
import type { Format, Frequency, Priority } from '../domain'

export type Deliverable = { format: Format; quantity: number; publish_offset_days: number }

export type Template = {
  id: string; brand_id: string; brand_name: string; branch_id: string | null; branch_name: string | null
  name: string; objective: string; briefing: string; priority: Priority; active: boolean
  frequency: Frequency; start_dow: number | null; anchor_date: string | null; day_of_month: number | null; specific_dates: string[]
  duration_days: number; valid_from: string | null; valid_to: string | null
  lead_days: number; briefing_days: number; creation_days: number; approval_days: number
  default_owner: string | null; default_owner_name: string | null; default_reviewer: string | null; default_reviewer_name: string | null
  checklist: string[]; deliverables: Deliverable[]
  /** instâncias já geradas que ainda esperam a reconfirmação humana */
  pending_reconfirm: number
}

const SQL = `
  select t.id, t.brand_id, b.name as brand_name, t.branch_id, br.name as branch_name, t.name, t.objective, t.briefing, t.priority, t.active,
         t.frequency, t.start_dow::int as start_dow, t.anchor_date::text as anchor_date, t.day_of_month::int as day_of_month,
         coalesce((select array_agg(d::text order by d) from unnest(t.specific_dates) d), '{}') as specific_dates,
         t.duration_days::int as duration_days, t.valid_from::text as valid_from, t.valid_to::text as valid_to,
         t.lead_days::int as lead_days, t.briefing_days::int as briefing_days, t.creation_days::int as creation_days, t.approval_days::int as approval_days,
         t.default_owner, uo.display_name as default_owner_name, t.default_reviewer, ur.display_name as default_reviewer_name, t.checklist,
         coalesce((select json_agg(json_build_object('format', d.format, 'quantity', d.quantity, 'publish_offset_days', d.publish_offset_days) order by d.sort_order)
                     from campaign_template_deliverables d where d.template_id = t.id), '[]'::json) as deliverables,
         (select count(*)::int from campaign_instances i where i.template_id = t.id and i.status = 'generated' and i.reconfirmed_at is null) as pending_reconfirm
    from campaign_templates t
    join brands b on b.id = t.brand_id
    left join branches br on br.id = t.branch_id
    left join users uo on uo.id = t.default_owner
    left join users ur on ur.id = t.default_reviewer`

export async function listTemplates(f: { brand?: string; branchId?: string }): Promise<Template[]> {
  const w: string[] = []
  const args: unknown[] = []
  if (f.brand) { args.push(f.brand); w.push(`b.slug = $${args.length}`) }
  if (f.branchId) { args.push(f.branchId); w.push(`(t.branch_id = $${args.length} or t.branch_id is null)`) }
  return (await pool.query(`${SQL} ${w.length ? 'where ' + w.join(' and ') : ''} order by t.active desc, t.name`, args)).rows
}

export async function getTemplate(id: string): Promise<Template | null> {
  return (await pool.query(`${SQL} where t.id = $1`, [id])).rows[0] ?? null
}

export type Instance = {
  id: string; template_id: string; campaign_id: string | null; campaign_name: string | null
  occurrence_start: string; occurrence_end: string; status: 'generated' | 'cancelled'
  reconfirmed_at: string | null; reconfirmed_by_name: string | null; generated_at: string; origin: 'manual' | 'job'
  posts: number; posts_done: number
}

export async function listInstances(templateId: string, limit = 30): Promise<Instance[]> {
  return (await pool.query(
    `select i.id, i.template_id, i.campaign_id, c.name as campaign_name, i.occurrence_start::text as occurrence_start, i.occurrence_end::text as occurrence_end,
            i.status, i.reconfirmed_at::text as reconfirmed_at, u.display_name as reconfirmed_by_name, i.generated_at::text as generated_at, i.origin,
            (select count(*)::int from posts p where p.campaign_instance_id = i.id) as posts,
            (select count(*)::int from posts p where p.campaign_instance_id = i.id and p.stage in ('aprovado', 'agendado', 'publicado')) as posts_done
       from campaign_instances i
       left join campaigns c on c.id = i.campaign_id
       left join users u on u.id = i.reconfirmed_by
      where i.template_id = $1 order by i.occurrence_start desc limit $2`, [templateId, limit])).rows
}

// Início das ocorrências já registradas (geradas ou canceladas) dentro de um intervalo — para mostrar "já gerada" na prévia.
export async function listInstanceStarts(templateId: string, from: string, to: string): Promise<Map<string, 'generated' | 'cancelled'>> {
  const rows = (await pool.query(
    `select occurrence_start::text as s, status from campaign_instances where template_id = $1 and occurrence_start between $2 and $3`, [templateId, from, to])).rows
  return new Map(rows.map((r) => [r.s as string, r.status as 'generated' | 'cancelled']))
}

export type StaleData = { knowledge: { id: string; title: string; valid_until: string }[]; offers: { id: string; title: string; offer_valid_until: string }[] }

// Dados com validade vencida que uma campanha nova não pode usar sem confirmação.
export async function getStaleData(brandId: string, today: string): Promise<StaleData> {
  const [k, o] = await Promise.all([
    pool.query(`select id, title, valid_until::text as valid_until from knowledge where brand_id = $1 and valid_until < $2 order by valid_until desc limit 8`, [brandId, today]),
    pool.query(
      `select id, title, offer_valid_until::text as offer_valid_until from content_requests
        where brand_id = $1 and offer_item is not null and offer_valid_until < $2 and status not in ('concluida', 'cancelada') order by offer_valid_until desc limit 8`, [brandId, today]),
  ])
  return { knowledge: k.rows, offers: o.rows }
}
