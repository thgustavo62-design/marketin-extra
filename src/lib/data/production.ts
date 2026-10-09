// Central de Produção: cartões do quadro e detalhe da tarefa. Tudo é leitura sobre `posts` (fonte única de status).
import { pool } from '../db'
import type { Format, Pillar, Priority, Stage } from '../domain'

export type BoardCard = {
  id: string; title: string
  brand_id: string; brand_name: string; brand_slug: string; branch_name: string | null; campaign_name: string | null
  format: Format; pillar: Pillar; stage: Stage; priority: Priority
  post_date: string; due_at: string | null
  assigned_to: string | null; assigned_name: string | null; reviewer_id: string | null; reviewer_name: string | null
  blocked_reason: string | null; revision: number
  checklist_done: number; checklist_total: number; comments: number
  /** outra publicação da mesma filial/unidade no mesmo dia e horário */
  conflict: boolean
}

export type BoardFilter = {
  brand?: string; branchId?: string; assignedTo?: string; campaignId?: string; format?: string; stage?: string
  q?: string; overdueOnly?: boolean; today: string
}

// Concluídos e cancelados ficam no quadro só por 30 dias, para não poluir.
const KEEP_CLOSED_DAYS = 30

const BASE = `
  select p.id, p.title, p.brand_id, b.name as brand_name, b.slug as brand_slug, br.name as branch_name,
         coalesce(c.name, p.campaign_name) as campaign_name, p.format, p.pillar, p.stage, p.priority,
         p.post_date::text as post_date, p.due_at::text as due_at,
         p.assigned_to, ua.display_name as assigned_name, p.reviewer_id, ur.display_name as reviewer_name,
         p.blocked_reason, p.revision,
         (select count(*) filter (where i.is_complete)::int from post_checklist_items i where i.post_id = p.id) as checklist_done,
         (select count(*)::int from post_checklist_items i where i.post_id = p.id) as checklist_total,
         (select count(*)::int from post_comments m where m.post_id = p.id) as comments,
         (p.post_time is not null and
          count(*) filter (where p.stage <> 'cancelado') over (partition by p.brand_id, p.branch_id, p.post_date, p.post_time) > 1) as conflict
    from posts p
    join brands b on b.id = p.brand_id
    left join branches br on br.id = p.branch_id
    left join campaigns c on c.id = p.campaign_id
    left join users ua on ua.id = p.assigned_to
    left join users ur on ur.id = p.reviewer_id`

export async function listBoard(f: BoardFilter): Promise<BoardCard[]> {
  const w: string[] = []
  const args: unknown[] = []
  const add = (sql: string, v: unknown) => { args.push(v); w.push(sql.replace('?', `$${args.length}`)) }
  if (f.brand) add('b.slug = ?', f.brand)
  if (f.branchId) add('(p.branch_id = ? or p.branch_id is null)', f.branchId)
  if (f.assignedTo) add('p.assigned_to = ?', f.assignedTo)
  if (f.campaignId) add('p.campaign_id = ?', f.campaignId)
  if (f.format) add('p.format = ?', f.format)
  if (f.stage) add('p.stage = ?', f.stage)
  if (f.q) {
    args.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`)
    w.push(`(p.title ilike $${args.length} or p.caption ilike $${args.length})`)
  }
  args.push(f.today)
  const today = `$${args.length}::date`
  w.push(`(p.stage not in ('publicado','cancelado') or p.post_date >= ${today} - ${KEEP_CLOSED_DAYS})`)
  // Atrasado = em andamento e com a data de publicação (ou o prazo de produção) já vencida.
  if (f.overdueOnly) w.push(`p.stage not in ('publicado','cancelado') and (p.post_date < ${today} or p.due_at < ${today})`)
  const sql = `${BASE} where ${w.join(' and ')}
     order by case p.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, p.due_at nulls last, p.post_date, p.created_at
     limit 600`
  return (await pool.query(sql, args)).rows
}

export type TaskDetail = {
  card: BoardCard
  checklist: { id: string; label: string; is_complete: boolean; completed_by_name: string | null; completed_at: string | null }[]
  comments: { id: string; author_name: string | null; body: string; created_at: string }[]
  events: { id: number; from_stage: Stage | null; to_stage: Stage; actor_name: string | null; note: string | null; created_at: string }[]
  assignable: { id: string; display_name: string; role: string }[]
}

export async function getTaskDetail(id: string): Promise<TaskDetail | null> {
  const card = (await pool.query(`${BASE} where p.id = $1`, [id])).rows[0] as BoardCard | undefined
  if (!card) return null
  const [checklist, comments, events, assignable] = await Promise.all([
    pool.query(
      `select i.id, i.label, i.is_complete, u.display_name as completed_by_name, i.completed_at::text as completed_at
         from post_checklist_items i left join users u on u.id = i.completed_by where i.post_id = $1 order by i.sort_order, i.created_at`, [id]),
    pool.query(
      `select m.id, u.display_name as author_name, m.body, m.created_at::text as created_at
         from post_comments m left join users u on u.id = m.author_id where m.post_id = $1 order by m.created_at`, [id]),
    pool.query(
      `select e.id, e.from_stage, e.to_stage, u.display_name as actor_name, e.note, e.created_at::text as created_at
         from post_status_events e left join users u on u.id = e.actor_id where e.post_id = $1 order by e.created_at desc, e.id desc`, [id]),
    listAssignableUsers(card.brand_id),
  ])
  return { card, checklist: checklist.rows, comments: comments.rows, events: events.rows, assignable }
}

// Quem pode receber tarefa/revisão desta filial: administradores e editores ativos com acesso a ela.
export async function listAssignableUsers(brandId: string): Promise<{ id: string; display_name: string; role: string }[]> {
  return (await pool.query(
    `select id, coalesce(display_name, username) as display_name, role from users
      where active and role in ('admin', 'editor') and (role = 'admin' or brand_ids is null or $1::uuid = any(brand_ids))
      order by coalesce(display_name, username)`, [brandId])).rows
}
