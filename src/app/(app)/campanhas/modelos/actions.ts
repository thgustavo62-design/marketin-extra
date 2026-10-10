'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { generateInstances } from '@/lib/campaigns/generate'
import { pool, withTx } from '@/lib/db'
import {
  MAX_POSTS_PER_OCCURRENCE, isFormat, isFrequency, isIsoDate, isPriority, parseDateList, todayISO, validateRecurrence,
  type Format, type Recurrence,
} from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { changeStage } from '@/lib/production/stage'
import { clientIp } from '@/lib/session'

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })
const MAX_DELIVERABLE_ROWS = 6
const MAX_CHECKLIST = 15

function intIn(fd: FormData, k: string, min: number, max: number, label: string): number | string {
  const v = str(fd, k)
  if (!/^\d+$/.test(v)) return `${label}: informe um número inteiro.`
  const n = Number(v)
  return n < min || n > max ? `${label}: use um valor entre ${min} e ${max}.` : n
}

// ---------- criar / editar modelo ----------
export async function saveTemplateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const id = str(fd, 'id'), brandId = str(fd, 'brand_id'), branchId = str(fd, 'branch_id')
  const name = str(fd, 'name'), objective = str(fd, 'objective'), briefing = str(fd, 'briefing'), priority = str(fd, 'priority') || 'normal'
  const frequency = str(fd, 'frequency')

  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (id && (!isUuid(id) || !(await rowAllowed(g.user, 'campaign_templates', id)))) return { error: 'Modelo não encontrado.' }
  if (id && (await pool.query(`select 1 from campaign_templates where id = $1 and brand_id = $2`, [id, brandId])).rowCount === 0) return { error: 'A filial de um modelo existente não pode ser trocada. Crie um modelo novo para a outra filial.' }
  if (name.length < 2 || name.length > 120) return { error: 'Dê um nome ao modelo (2 a 120 caracteres).' }
  if (objective.length > 500) return { error: 'O objetivo passa de 500 caracteres.' }
  if (briefing.length > 4000) return { error: 'O briefing passa de 4000 caracteres.' }
  if (!isPriority(priority)) return { error: 'Prioridade inválida.' }
  if (!isFrequency(frequency)) return { error: 'Escolha a frequência.' }
  if (branchId && (!isUuid(branchId) || !(await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])).rowCount)) return { error: 'Unidade inválida para esta filial.' }

  const nums = {
    duration: intIn(fd, 'duration_days', 1, 31, 'Duração'), lead: intIn(fd, 'lead_days', 0, 60, 'Antecedência'),
    briefing: intIn(fd, 'briefing_days', 0, 60, 'Prazo do briefing'), creation: intIn(fd, 'creation_days', 0, 60, 'Prazo de criação'), approval: intIn(fd, 'approval_days', 0, 60, 'Prazo de aprovação'),
  }
  for (const v of Object.values(nums)) if (typeof v === 'string') return { error: v }
  const n = nums as Record<keyof typeof nums, number>

  const dow = str(fd, 'start_dow'), dom = str(fd, 'day_of_month'), anchor = str(fd, 'anchor_date')
  const list = parseDateList(str(fd, 'specific_dates'))
  if (frequency === 'dates' && list.invalid.length) return { error: `Data inválida na lista: ${list.invalid.slice(0, 3).join(', ')}.` }
  const rule: Recurrence = {
    frequency, start_dow: frequency === 'weekly' && /^[0-6]$/.test(dow) ? Number(dow) : null,
    anchor_date: frequency === 'biweekly' && isIsoDate(anchor) ? anchor : null,
    day_of_month: frequency === 'monthly' && /^\d{1,2}$/.test(dom) ? Number(dom) : null,
    specific_dates: frequency === 'dates' ? list.dates : [], duration_days: n.duration,
    valid_from: str(fd, 'valid_from') || null, valid_to: str(fd, 'valid_to') || null,
  }
  const bad = validateRecurrence(rule)
  if (bad) return { error: bad }

  const deliverables: { format: Format; quantity: number; offset: number }[] = []
  for (let i = 0; i < MAX_DELIVERABLE_ROWS; i++) {
    const f = str(fd, `del_format_${i}`)
    if (!f) continue
    const q = Number(str(fd, `del_qty_${i}`) || '1'), o = Number(str(fd, `del_off_${i}`) || '0')
    if (!isFormat(f)) return { error: `Entrega ${i + 1}: formato inválido.` }
    if (!Number.isInteger(q) || q < 1 || q > 10) return { error: `Entrega ${i + 1}: a quantidade deve ficar entre 1 e 10.` }
    if (!Number.isInteger(o) || o < 0 || o > 31) return { error: `Entrega ${i + 1}: o deslocamento deve ficar entre 0 e 31 dias.` }
    deliverables.push({ format: f, quantity: q, offset: o })
  }
  if (deliverables.length === 0) return { error: 'Informe pelo menos uma entrega (feed, carrossel ou Reels).' }
  if (deliverables.reduce((s, d) => s + d.quantity, 0) > MAX_POSTS_PER_OCCURRENCE) return { error: `No máximo ${MAX_POSTS_PER_OCCURRENCE} peças por campanha.` }

  const checklist = str(fd, 'checklist').split('\n').map((s) => s.trim()).filter(Boolean)
  if (checklist.length > MAX_CHECKLIST || checklist.some((s) => s.length > 180)) return { error: `O checklist aceita até ${MAX_CHECKLIST} itens de até 180 caracteres.` }

  // Responsável e revisor precisam ter acesso à filial.
  const owner = str(fd, 'default_owner'), reviewer = str(fd, 'default_reviewer')
  for (const [label, u] of [['Responsável', owner], ['Revisor', reviewer]] as const) {
    if (!u) continue
    const ok = isUuid(u) && (await pool.query(
      `select 1 from users where id = $1 and active and role in ('admin', 'editor') and (role = 'admin' or brand_ids is null or $2::uuid = any(brand_ids))`, [u, brandId])).rowCount
    if (!ok) return { error: `${label} inválido para esta filial.` }
  }

  const values = [
    brandId, branchId || null, name, objective, briefing, priority, frequency, rule.start_dow, rule.anchor_date, rule.day_of_month, rule.specific_dates,
    n.duration, rule.valid_from, rule.valid_to, n.lead, n.briefing, n.creation, n.approval, owner || null, reviewer || null, checklist, g.user.id,
  ]
  const savedId = await withTx(async (db) => {
    let tid = id
    if (id) {
      await db.query(
        `update campaign_templates set brand_id=$1, branch_id=$2, name=$3, objective=$4, briefing=$5, priority=$6, frequency=$7, start_dow=$8, anchor_date=$9, day_of_month=$10,
                specific_dates=$11, duration_days=$12, valid_from=$13, valid_to=$14, lead_days=$15, briefing_days=$16, creation_days=$17, approval_days=$18,
                default_owner=$19, default_reviewer=$20, checklist=$21, updated_by=$22, updated_at=now() where id=$23`, [...values, id])
      await db.query(`delete from campaign_template_deliverables where template_id = $1`, [id])
    } else {
      tid = (await db.query(
        `insert into campaign_templates (brand_id, branch_id, name, objective, briefing, priority, frequency, start_dow, anchor_date, day_of_month, specific_dates,
                duration_days, valid_from, valid_to, lead_days, briefing_days, creation_days, approval_days, default_owner, default_reviewer, checklist, created_by, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22) returning id`, values)).rows[0].id
    }
    for (let i = 0; i < deliverables.length; i++) {
      const d = deliverables[i]
      await db.query(`insert into campaign_template_deliverables (template_id, format, quantity, publish_offset_days, sort_order) values ($1,$2,$3,$4,$5)`, [tid, d.format, d.quantity, d.offset, i])
    }
    return tid
  })
  await audit(id ? 'modelo_editado' : 'modelo_criado', { userId: g.user.id, ip: await clientIp(), target: savedId })
  revalidatePath('/campanhas/modelos')
  redirect(`/campanhas/modelos/${savedId}?salvo=1`)
}

async function guardTemplate(id: string) {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error } as const
  if (!isUuid(id) || !(await rowAllowed(g.user, 'campaign_templates', id))) return { ok: false, error: 'Modelo não encontrado.' } as const
  return { ok: true, user: g.user } as const
}

// ---------- pausar / retomar ----------
export async function toggleTemplateAction(id: string, active: boolean): Promise<Result> {
  const g = await guardTemplate(id)
  if (!g.ok) return fail(g.error)
  await pool.query(`update campaign_templates set active = $2, updated_by = $3, updated_at = now() where id = $1`, [id, active, g.user.id])
  await audit(active ? 'modelo_retomado' : 'modelo_pausado', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/campanhas/modelos')
  return { ok: true }
}

// ---------- gerar (manual) ----------
export async function generateTemplateAction(id: string): Promise<Result<{ created: number; posts: number; existing: number; none: boolean; from: string; to: string }>> {
  const g = await guardTemplate(id)
  if (!g.ok) return fail(g.error)
  const r = await generateInstances(id, g.user.id, todayISO())
  if (!r.ok) return fail(r.error)
  if (r.created.length) await audit('instancias_geradas', { userId: g.user.id, ip: await clientIp(), target: id, meta: { inicio: r.created.map((c) => c.start), pecas: r.created.reduce((s, c) => s + c.posts, 0) } })
  revalidatePath('/campanhas/modelos'); revalidatePath('/campanhas'); revalidatePath('/producao')
  return {
    ok: true, created: r.created.length, posts: r.created.reduce((s, c) => s + c.posts, 0), existing: r.existing, none: r.none, from: r.window.from, to: r.window.to,
  }
}

async function guardInstance(id: string) {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error } as const
  if (!isUuid(id) || !(await rowAllowed(g.user, 'campaign_instances', id))) return { ok: false, error: 'Campanha não encontrada.' } as const
  return { ok: true, user: g.user } as const
}

// ---------- reconfirmação humana de dados comerciais ----------
export async function reconfirmInstanceAction(id: string, checks: { products: boolean; prices: boolean; validity: boolean; stock: boolean }): Promise<Result> {
  const g = await guardInstance(id)
  if (!g.ok) return fail(g.error)
  if (!(checks.products && checks.prices && checks.validity && checks.stock)) return fail('Marque os quatro itens: produtos, preços, validade e estoque.')
  const r = await pool.query(
    `update campaign_instances set reconfirmed_at = now(), reconfirmed_by = $2 where id = $1 and status = 'generated' and reconfirmed_at is null returning id`, [id, g.user.id])
  if (!r.rowCount) return fail('Esta campanha já foi reconfirmada ou foi cancelada.')
  await audit('instancia_reconfirmada', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/campanhas/modelos'); revalidatePath('/producao')
  return { ok: true }
}

// ---------- cancelar uma ocorrência ----------
// A chave continua ocupada (nunca é recriada). Cartões ainda em preparo são cancelados; o que já foi aprovado/publicado fica como está.
export async function cancelInstanceAction(id: string): Promise<Result<{ cancelled: number; kept: number }>> {
  const g = await guardInstance(id)
  if (!g.ok) return fail(g.error)
  const u = await pool.query(`update campaign_instances set status = 'cancelled' where id = $1 and status = 'generated' returning id`, [id])
  if (!u.rowCount) return fail('Esta campanha já estava cancelada.')
  const posts = (await pool.query(`select id, stage from posts where campaign_instance_id = $1`, [id])).rows as { id: string; stage: string }[]
  let cancelled = 0, kept = 0
  for (const p of posts) {
    if (['ideia', 'briefing', 'producao', 'revisao'].includes(p.stage)) {
      const r = await changeStage({ postId: p.id, to: 'cancelado', actorId: g.user.id, note: 'Ocorrência da campanha recorrente cancelada' })
      if (r.ok) cancelled++; else kept++
    } else if (p.stage !== 'cancelado') kept++
  }
  await audit('instancia_cancelada', { userId: g.user.id, ip: await clientIp(), target: id, meta: { cancelados: cancelled, mantidos: kept } })
  revalidatePath('/campanhas/modelos'); revalidatePath('/producao')
  return { ok: true, cancelled, kept }
}
