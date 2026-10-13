// Importação de plano em PDF: prévia (lida no servidor e guardada), confirmação (cria as pautas) e desfazer.
// A confirmação NUNCA recebe pautas do navegador: lê o plano guardado na prévia e só aceita dele quais linhas entrar.
import { pool, withTx } from '../db'
import { existingPostsBetween } from '../data/plan-imports'
import { buildDrafts, normalizeTitle, parsePlan, type ParsedPlan, type Pillar } from '../domain'

const PREVIEW_DAYS = 14

export type PreviewResult = { ok: true; id: string; plan: ParsedPlan } | { ok: false; error: string; existingId?: string }

export async function createPreview(o: { userId: string; brandId: string; branchId: string | null; fileName: string; sha: string; pages: string[] }): Promise<PreviewResult> {
  const plan = parsePlan(o.pages)
  if (plan.entries.length === 0) return { ok: false, error: plan.warnings.find((w) => w.level === 'erro')?.message ?? 'Não encontrei conteúdo planejado neste PDF.' }

  const dup = (await pool.query(
    `select id, imported_at::text as at from plan_imports
      where brand_id = $1 and branch_id is not distinct from $2::uuid and file_sha256 = $3 and status = 'importado'`, [o.brandId, o.branchId, o.sha])).rows[0]
  if (dup) return { ok: false, error: 'Este mesmo PDF já foi importado para esta filial. Para importar de novo, desfaça a importação anterior (no histórico abaixo).', existingId: dup.id }

  // prévias velhas e repetidas do mesmo arquivo não ficam acumulando
  await pool.query(`delete from plan_imports where status = 'previa' and (created_at < now() - ($1 || ' days')::interval or (brand_id = $2 and file_sha256 = $3 and created_by = $4))`, [String(PREVIEW_DAYS), o.brandId, o.sha, o.userId])
  const span = plan.period!
  const id = (await pool.query(
    `insert into plan_imports (brand_id, branch_id, file_name, file_sha256, pages, parsed, period_start, period_end, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [o.brandId, o.branchId, o.fileName.slice(0, 200), o.sha, o.pages.length, JSON.stringify(plan), span.start, span.end, o.userId])).rows[0].id as string
  return { ok: true, id, plan }
}

export type ImportParams = {
  id: string
  userId: string
  canUseBrand: (brandId: string) => boolean
  selected: number[]
  leadDays: number
  initialStage: 'auto' | 'ideia' | 'briefing'
  assignedTo: string | null
  reviewerId: string | null
  createCampaign: boolean
  campaignName: string
  pillarOverrides: Record<number, Pillar>
}
export type ImportResult = { ok: true; created: number; skipped: string[]; firstDate: string; campaignId: string | null } | { ok: false; error: string }

const INSERT_POSTS = `
  insert into posts (brand_id, branch_id, campaign_id, campaign_name, title, post_date, post_time, format, pillar, stage, caption, script, reels, origin,
                     created_by, updated_by, assigned_to, reviewer_id, priority, due_at, plan_import_id, plan_code)
  select $1::uuid, $2::uuid, $3::uuid, $4::text, x.title, x.post_date::date, x.post_time::time, x.format, x.pillar, x.stage, x.caption, x.script, x.reels, 'plano-pdf',
         $5::uuid, $5::uuid, $6::uuid, $7::uuid, 'normal', x.due_at::date, $8::uuid, x.code
    from jsonb_to_recordset($9::jsonb) as x(title text, post_date text, post_time text, format text, pillar text, stage text, caption text, script text, reels jsonb, due_at text, code text)
  returning id, plan_code`
const INSERT_TASKS = `insert into post_checklist_items (post_id, label, sort_order) select * from unnest($1::uuid[], $2::text[], $3::int[])`
const INSERT_COMMENTS = `insert into post_comments (post_id, author_id, body) select t.pid, $2::uuid, t.body from unnest($1::uuid[], $3::text[]) as t(pid, body)`
const INSERT_EVENTS = `insert into post_status_events (post_id, from_stage, to_stage, actor_id, note) select t.pid, null, t.stage, $2::uuid, 'Importado do plano em PDF' from unnest($1::uuid[], $3::text[]) as t(pid, stage)`

export async function importPlan(p: ImportParams): Promise<ImportResult> {
  try {
    return await withTx(async (db): Promise<ImportResult> => {
      // trava a linha: dois cliques seguidos não importam duas vezes
      const row = (await db.query(`select id, brand_id, branch_id, file_name, status, parsed from plan_imports where id = $1 for update`, [p.id])).rows[0]
      if (!row || !p.canUseBrand(row.brand_id)) return { ok: false, error: 'Importação não encontrada.' }
      if (row.status === 'importado') return { ok: false, error: 'Este plano já foi importado.' }
      if (row.status !== 'previa') return { ok: false, error: 'Esta prévia não está mais disponível. Envie o PDF de novo.' }
      const plan = row.parsed as ParsedPlan
      const valid = new Set(plan.entries.map((e) => e.index))
      const chosen = [...new Set(p.selected)].filter((i) => valid.has(i))
      if (chosen.length === 0) return { ok: false, error: 'Marque pelo menos uma peça para importar.' }

      // pessoas indicadas precisam existir, estar ativas e poder editar
      const people = [p.assignedTo, p.reviewerId].filter((x): x is string => Boolean(x))
      if (people.length) {
        const ok = (await db.query(`select id from users where id = any($1::uuid[]) and active and role in ('admin', 'editor')`, [people])).rows.length
        if (ok !== new Set(people).size) return { ok: false, error: 'Responsável ou revisor inválido.' }
      }

      const drafts = new Map(buildDrafts(plan, { leadDays: p.leadDays, initialStage: p.initialStage, fileName: row.file_name }).map((d) => [d.index, d]))
      const dates = chosen.map((i) => drafts.get(i)!.post_date).sort()
      const existing = await existingPostsBetween(row.brand_id, dates[0], dates[dates.length - 1])
      const have = new Set(existing.map((x) => `${x.post_date}|${normalizeTitle(x.title)}`))

      const toCreate = chosen.filter((i) => !have.has(`${drafts.get(i)!.post_date}|${normalizeTitle(drafts.get(i)!.title)}`))
      const skipped = chosen.filter((i) => !toCreate.includes(i)).map((i) => drafts.get(i)!.title)
      if (toCreate.length === 0) return { ok: false, error: 'Todas as peças marcadas já existem no calendário (mesma data e título).' }

      let campaignId: string | null = null
      let campaignName: string | null = null
      if (p.createCampaign) {
        campaignName = p.campaignName
        const ds = toCreate.map((i) => drafts.get(i)!.post_date).sort()
        campaignId = (await db.query(
          `insert into campaigns (brand_id, name, starts_on, ends_on, objective, briefing) values ($1, $2, $3, $4, $5, $6) returning id`,
          [row.brand_id, campaignName, ds[0], ds[ds.length - 1], (plan.objective ?? '').slice(0, 500), `Criada pela importação do plano “${row.file_name}”.`])).rows[0].id
      }

      // Tudo em lote (poucas consultas, qualquer que seja o tamanho do plano). Código repetido em datas diferentes ganha sufixo para não colidir.
      const seen = new Map<string, number>()
      const items = toCreate.map((i) => {
        const d = drafts.get(i)!
        const n = (seen.get(d.code) ?? 0) + 1
        seen.set(d.code, n)
        return { d, code: (n === 1 ? d.code : `${d.code}-${n}`).slice(0, 20), pillar: p.pillarOverrides[i] ?? d.pillar }
      })
      const payload = items.map(({ d, code, pillar }) => ({
        title: d.title, post_date: d.post_date, post_time: d.post_time, format: d.format, pillar, stage: d.stage, caption: d.caption, script: d.script, reels: d.reels, due_at: d.due_at, code,
      }))
      const ins = await db.query(INSERT_POSTS, [row.brand_id, row.branch_id, campaignId, campaignName, p.userId, p.assignedTo, p.reviewerId, p.id, JSON.stringify(payload)])
      const idByCode = new Map<string, string>(ins.rows.map((r: { id: string; plan_code: string }) => [r.plan_code, r.id]))

      const taskPost: string[] = [], taskLabel: string[] = [], taskOrder: number[] = []
      const msgPost: string[] = [], msgBody: string[] = [], msgStage: string[] = []
      for (const { d, code } of items) {
        const postId = idByCode.get(code)!
        d.checklist.forEach((label, k) => { taskPost.push(postId); taskLabel.push(label); taskOrder.push(k) })
        msgPost.push(postId); msgBody.push(d.comment); msgStage.push(d.stage)
      }
      if (taskPost.length) await db.query(INSERT_TASKS, [taskPost, taskLabel, taskOrder])
      await db.query(INSERT_COMMENTS, [msgPost, p.userId, msgBody])
      await db.query(INSERT_EVENTS, [msgPost, p.userId, msgStage])

      await db.query(
        `update plan_imports set status = 'importado', options = $2, campaign_id = $3, created_count = $4, skipped_count = $5, imported_at = now(), imported_by = $6 where id = $1`,
        [p.id, JSON.stringify({ leadDays: p.leadDays, initialStage: p.initialStage, createCampaign: p.createCampaign, campaignName, assignedTo: p.assignedTo, reviewerId: p.reviewerId }), campaignId, toCreate.length, skipped.length, p.userId])
      return { ok: true, created: toCreate.length, skipped, firstDate: dates[0], campaignId }
    })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === '23505') return { ok: false, error: 'Este plano já foi importado (ou um conteúdo com o mesmo código já existe nele).' }
    throw e
  }
}

export type UndoResult = { ok: true; removed: number; kept: number } | { ok: false; error: string }

/** Remove as pautas da importação que ainda não andaram. O que já foi mexido (etapa, edição, tarefa feita, comentário, anexo) fica. */
export async function undoImport(id: string, userId: string, canUseBrand: (brandId: string) => boolean): Promise<UndoResult> {
  return withTx(async (db): Promise<UndoResult> => {
    const row = (await db.query(`select id, brand_id, status, campaign_id from plan_imports where id = $1 for update`, [id])).rows[0]
    if (!row || !canUseBrand(row.brand_id)) return { ok: false, error: 'Importação não encontrada.' }
    if (row.status !== 'importado') return { ok: false, error: 'Só dá para desfazer uma importação já feita.' }
    const removed = (await db.query(
      `delete from posts p
        where p.plan_import_id = $1 and p.stage in ('ideia', 'briefing') and p.revision = 1
          and not exists (select 1 from post_checklist_items c where c.post_id = p.id and c.is_complete)
          and not exists (select 1 from post_comments m where m.post_id = p.id and m.body not like 'Importado do plano%')
          and not exists (select 1 from content_asset_links l where l.post_id = p.id)
          and not exists (select 1 from external_publications e where e.content_id = p.id)
        returning p.id`, [id])).rowCount ?? 0
    const kept = (await db.query(`select count(*)::int n from posts where plan_import_id = $1`, [id])).rows[0].n as number
    // posts mantidos deixam de pertencer à importação (assim o mesmo PDF pode ser importado de novo sem conflito de código)
    await db.query(`update posts set plan_import_id = null where plan_import_id = $1`, [id])
    if (row.campaign_id && kept === 0) await db.query(`delete from campaigns c where c.id = $1 and not exists (select 1 from posts where campaign_id = c.id)`, [row.campaign_id])
    await db.query(`update plan_imports set status = 'desfeito', undone_at = now(), undone_by = $2, kept_count = $3 where id = $1`, [id, userId, kept])
    return { ok: true, removed, kept }
  })
}
