'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { decideApproval, getApprovalInfo } from '@/lib/approvals/service'
import { getTaskDetail, listAssignableUsers, listPostAssets, type PostAsset, type TaskDetail } from '@/lib/data'
import { pool } from '@/lib/db'
import { canDecide, isIsoDate, isPriority, isStage, needsPublishConfirmation, stageBlockedReason, todayISO, type Decision, type Pillar, type Stage } from '@/lib/domain'
import { changeStage } from '@/lib/production/stage'
import { isUuid } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed, canWrite } from '@/lib/perms'
import { clientIp, getSession } from '@/lib/session'

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean; needsConfirm?: boolean }

const CONFLICT = 'Este cartão foi alterado por outra pessoa depois que você o abriu. Nada foi sobrescrito; a tela será atualizada.'
const fail = (error: string, extra: { conflict?: boolean; needsConfirm?: boolean } = {}) => ({ ok: false as const, error, ...extra })

async function post(id: string) {
  return (await pool.query(
    `select id, brand_id, branch_id, stage, pillar, pharma_review, blocked_reason, revision from posts where id = $1`, [id],
  )).rows[0] as { id: string; brand_id: string; branch_id: string | null; stage: Stage; pillar: Pillar; pharma_review: boolean; blocked_reason: string | null; revision: number } | undefined
}

// ---------- mover etapa (arrastar e soltar ou seletor) ----------
export async function moveCardAction(id: string, to: string, revision: number, opts: { confirmPublish?: boolean; note?: string } = {}): Promise<ActionResult<{ revision: number }>> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  if (!isUuid(id) || !isStage(to)) return fail('Cartão ou etapa inválidos.')
  if (!(await rowAllowed(g.user, 'posts', id))) return fail(NO_BRAND_ACCESS)
  const before = (await post(id))?.stage
  const r = await changeStage({ postId: id, to, actorId: g.user.id, revision, confirmPublish: opts.confirmPublish, note: opts.note })
  if (!r.ok) return fail(r.error, { conflict: r.conflict, needsConfirm: r.needsConfirm })
  if (before !== to) await audit('conteudo_etapa', { userId: g.user.id, ip: await clientIp(), target: id, meta: { de: before, para: to } })
  revalidatePath('/producao')
  return { ok: true, revision: r.revision }
}

// ---------- decisão de aprovação ----------
export async function decideApprovalAction(postId: string, decision: string, reason: string): Promise<ActionResult<{ stage: Stage }>> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  if (!isUuid(postId) || !['approved', 'rejected', 'changes_requested'].includes(decision)) return fail('Decisão inválida.')
  if (!(await rowAllowed(g.user, 'posts', postId))) return fail(NO_BRAND_ACCESS)
  const r = await decideApproval(postId, decision as Decision, reason, { id: g.user.id, role: g.user.role })
  if (!r.ok) return fail(r.error)
  await audit('aprovacao_decisao', { userId: g.user.id, ip: await clientIp(), target: postId, meta: { decisao: decision } })
  revalidatePath('/producao')
  return { ok: true, stage: r.stage }
}

// ---------- detalhe (leitura) ----------
export type FullDetail = TaskDetail & { approval: Awaited<ReturnType<typeof getApprovalInfo>>; assets: PostAsset[]; approvalRequired: boolean; canDecide: boolean }

export async function getTaskDetailAction(id: string): Promise<ActionResult<{ detail: FullDetail }>> {
  const user = await getSession()
  if (!user || user.mustChange) return fail('Sessão expirada. Entre novamente.')
  if (!isUuid(id)) return fail('Cartão inválido.')
  if (!(await rowAllowed(user, 'posts', id))) return fail(NO_BRAND_ACCESS)
  const detail = await getTaskDetail(id)
  if (!detail) return fail('Este conteúdo não existe mais.', { conflict: true })
  const [approval, assets, brand] = await Promise.all([
    getApprovalInfo(id),
    listPostAssets(id),
    pool.query('select approval_required from brands where id = $1', [detail.card.brand_id]),
  ])
  const pending = approval.latest?.status === 'pending' ? approval.latest : null
  const sub = pending ? (await pool.query('select submitted_by from approvals where id = $1', [pending.id])).rows[0]?.submitted_by ?? null : null
  const canDecideNow = Boolean(pending) && canWrite(user.role) && canDecide({ userId: user.id, role: user.role, reviewerId: pending?.reviewer_id ?? detail.card.reviewer_id, submittedBy: sub }) === null
  return { ok: true, detail: { ...detail, approval, assets, approvalRequired: brand.rows[0]?.approval_required ?? true, canDecide: canDecideNow } }
}

// ---------- campos de produção ----------
export type TaskFields = { assigned_to: string; reviewer_id: string; priority: string; due_at: string; blocked_reason: string; post_date: string }

export async function updateTaskAction(id: string, revision: number, f: TaskFields): Promise<ActionResult<{ revision: number; warning?: string }>> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  if (!isUuid(id)) return fail('Cartão inválido.')
  if (!(await rowAllowed(g.user, 'posts', id))) return fail(NO_BRAND_ACCESS)
  const p = await post(id)
  if (!p) return fail('Este conteúdo não existe mais.', { conflict: true })
  if (p.revision !== revision) return fail(CONFLICT, { conflict: true })

  if (!isPriority(f.priority)) return fail('Prioridade inválida.')
  if (f.due_at && !isIsoDate(f.due_at)) return fail('Prazo de produção inválido.')
  if (!isIsoDate(f.post_date)) return fail('Data de publicação inválida.')
  const blocked = f.blocked_reason.trim().slice(0, 300) || null

  // Responsável e revisor precisam poder trabalhar nesta filial.
  const people = new Set((await listAssignableUsers(p.brand_id)).map((u) => u.id))
  for (const [label, uid] of [['Responsável', f.assigned_to], ['Revisor', f.reviewer_id]] as const) {
    if (uid && (!isUuid(uid) || !people.has(uid))) return fail(`${label} inválido para esta filial.`)
  }

  const r = await pool.query(
    `update posts set assigned_to = $1, reviewer_id = $2, priority = $3, due_at = $4, blocked_reason = $5, post_date = $6,
            revision = revision + 1, updated_at = now(), updated_by = $7
      where id = $8 and revision = $9 returning revision, post_time`,
    [f.assigned_to || null, f.reviewer_id || null, f.priority, f.due_at || null, blocked, f.post_date, g.user.id, id, revision],
  )
  if (!r.rowCount) return fail(CONFLICT, { conflict: true })

  if ((p.blocked_reason ?? null) !== blocked) {
    await pool.query(`insert into post_status_events (post_id, from_stage, to_stage, actor_id, note) values ($1,$2,$2,$3,$4)`, [id, p.stage, g.user.id, blocked ? `Bloqueado: ${blocked}` : 'Bloqueio resolvido'])
  }
  await audit('conteudo_producao', { userId: g.user.id, ip: await clientIp(), target: id })

  let warning: string | undefined
  if (r.rows[0].post_time) {
    const dup = await pool.query(
      `select count(*)::int n from posts where brand_id = $1 and branch_id is not distinct from $2 and post_date = $3 and post_time = $4 and id <> $5 and stage <> 'cancelado'`,
      [p.brand_id, p.branch_id, f.post_date, r.rows[0].post_time, id],
    )
    if (dup.rows[0].n > 0) warning = 'Já existe outra publicação desta filial/unidade no mesmo dia e horário.'
  }
  revalidatePath('/producao')
  return { ok: true, revision: r.rows[0].revision, warning }
}

// ---------- checklist ----------
async function itemPost(itemId: string): Promise<string | null> {
  if (!isUuid(itemId)) return null
  return (await pool.query(`select post_id from post_checklist_items where id = $1`, [itemId])).rows[0]?.post_id ?? null
}

export async function addChecklistAction(postId: string, label: string): Promise<ActionResult> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  const text = label.trim()
  if (!isUuid(postId) || text.length < 1 || text.length > 200) return fail('Escreva o item (até 200 caracteres).')
  if (!(await rowAllowed(g.user, 'posts', postId))) return fail(NO_BRAND_ACCESS)
  await pool.query(
    `insert into post_checklist_items (post_id, label, sort_order) values ($1, $2, coalesce((select max(sort_order) + 1 from post_checklist_items where post_id = $1), 0))`,
    [postId, text],
  )
  revalidatePath('/producao')
  return { ok: true }
}

export async function toggleChecklistAction(itemId: string, done: boolean): Promise<ActionResult> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  const postId = await itemPost(itemId)
  if (!postId) return fail('Item não encontrado.')
  if (!(await rowAllowed(g.user, 'posts', postId))) return fail(NO_BRAND_ACCESS)
  await pool.query(
    `update post_checklist_items set is_complete = $1, completed_by = case when $1 then $2::uuid end, completed_at = case when $1 then now() end where id = $3`,
    [done, g.user.id, itemId],
  )
  revalidatePath('/producao')
  return { ok: true }
}

export async function deleteChecklistAction(itemId: string): Promise<ActionResult> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  const postId = await itemPost(itemId)
  if (!postId) return fail('Item não encontrado.')
  if (!(await rowAllowed(g.user, 'posts', postId))) return fail(NO_BRAND_ACCESS)
  await pool.query(`delete from post_checklist_items where id = $1`, [itemId])
  revalidatePath('/producao')
  return { ok: true }
}

// ---------- comentários (não editáveis nem apagáveis: fazem parte do histórico) ----------
export async function addCommentAction(postId: string, body: string): Promise<ActionResult> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  const text = body.trim()
  if (!isUuid(postId) || text.length < 1 || text.length > 4000) return fail('Escreva o comentário (até 4000 caracteres).')
  if (!(await rowAllowed(g.user, 'posts', postId))) return fail(NO_BRAND_ACCESS)
  await pool.query(`insert into post_comments (post_id, author_id, body) values ($1, $2, $3)`, [postId, g.user.id, text])
  revalidatePath('/producao')
  return { ok: true }
}

// ---------- criar cartão direto na coluna ----------
export async function quickCreateAction(input: { title: string; stage: string; brandId: string; branchId?: string }): Promise<ActionResult<{ id: string }>> {
  const g = await writerOrError()
  if (!g.ok) return fail(g.error)
  const title = input.title.trim()
  if (title.length < 2 || title.length > 140) return fail('Dê um título ao cartão (2 a 140 caracteres).')
  if (!isStage(input.stage)) return fail('Etapa inválida.')
  if (!isUuid(input.brandId) || !brandAllowed(g.user, input.brandId)) return fail(NO_BRAND_ACCESS)
  if (input.branchId) {
    const ok = isUuid(input.branchId) && (await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [input.branchId, input.brandId])).rowCount
    if (!ok) return fail('Unidade inválida para esta filial.')
  }
  if (needsPublishConfirmation(input.stage)) return fail('Crie o cartão em outra etapa e mova para "Publicado" com confirmação.')
  const pillar: Pillar = 'institucional'
  const why = stageBlockedReason(pillar, input.stage, false)
  if (why) return fail(why)
  const r = await pool.query(
    `insert into posts (brand_id, branch_id, title, post_date, format, pillar, stage, created_by, updated_by)
     values ($1, $2, $3, $4, 'feed', 'institucional', $5, $6, $6) returning id`,
    [input.brandId, input.branchId || null, title, todayISO(), input.stage, g.user.id],
  )
  await pool.query(`insert into post_status_events (post_id, from_stage, to_stage, actor_id, note) values ($1, null, $2, $3, 'Criado no quadro')`, [r.rows[0].id, input.stage, g.user.id])
  await audit('conteudo_criado', { userId: g.user.id, ip: await clientIp(), target: r.rows[0].id, meta: { origem: 'quadro' } })
  revalidatePath('/producao')
  return { ok: true, id: r.rows[0].id }
}
