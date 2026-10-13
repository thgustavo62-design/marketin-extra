import { pool } from '../db'
import type { ParsedPlan } from '../domain'

export type PlanImportRow = {
  id: string
  brand_id: string
  brand_name: string
  branch_id: string | null
  branch_name: string | null
  file_name: string
  pages: number
  status: 'previa' | 'importado' | 'desfeito'
  parsed: ParsedPlan
  period_start: string | null
  period_end: string | null
  campaign_id: string | null
  created_count: number | null
  skipped_count: number | null
  kept_count: number | null
  created_by_name: string | null
  created_at: string
  imported_at: string | null
  undone_at: string | null
}

const COLS = `pi.id, pi.brand_id, b.name as brand_name, pi.branch_id, br.name as branch_name, pi.file_name, pi.pages, pi.status,
  pi.period_start::text as period_start, pi.period_end::text as period_end, pi.campaign_id, pi.created_count, pi.skipped_count, pi.kept_count,
  coalesce(u.display_name, u.username) as created_by_name, pi.created_at::text as created_at, pi.imported_at::text as imported_at, pi.undone_at::text as undone_at`
const FROM = `from plan_imports pi join brands b on b.id = pi.brand_id left join branches br on br.id = pi.branch_id left join users u on u.id = pi.created_by`

export async function getPlanImport(id: string): Promise<PlanImportRow | null> {
  return (await pool.query(`select ${COLS}, pi.parsed ${FROM} where pi.id = $1`, [id])).rows[0] ?? null
}

export type PlanImportListItem = Omit<PlanImportRow, 'parsed'> & { posts_now: number; posts_open: number }

/** Histórico de importações (sem o texto lido, que é pesado). `brandIds` null = todas as filiais. */
export async function listPlanImports(brandIds: string[] | null, limit = 30): Promise<PlanImportListItem[]> {
  return (await pool.query(
    `select ${COLS},
            (select count(*)::int from posts p where p.plan_import_id = pi.id) as posts_now,
            (select count(*)::int from posts p where p.plan_import_id = pi.id and p.stage in ('ideia', 'briefing')) as posts_open
       ${FROM} where ($1::uuid[] is null or pi.brand_id = any($1)) and pi.status <> 'previa'
      order by pi.created_at desc limit $2`, [brandIds, limit])).rows
}

/** Prévias ainda não confirmadas (da filial escolhida), para a pessoa retomar. */
export async function listPreviews(brandIds: string[] | null, limit = 10): Promise<Omit<PlanImportRow, 'parsed'>[]> {
  return (await pool.query(
    `select ${COLS} ${FROM} where ($1::uuid[] is null or pi.brand_id = any($1)) and pi.status = 'previa' order by pi.created_at desc limit $2`, [brandIds, limit])).rows
}

export type ExistingPost = { id: string; post_date: string; title: string; format: string; stage: string; branch_id: string | null }

export async function existingPostsBetween(brandId: string, from: string, to: string): Promise<ExistingPost[]> {
  return (await pool.query(
    `select id, post_date::text as post_date, title, format, stage, branch_id from posts where brand_id = $1 and post_date between $2 and $3 order by post_date`, [brandId, from, to])).rows
}
