'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { pool, withTx } from '@/lib/db'
import {
  FORMAT_BY_TYPE, canMoveRequest, convertBlockedReason, isIsoDate, isPriority, isRequestStatus, isRequestType, todayISO,
  type RequestStatus, type RequestType,
} from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { clientIp } from '@/lib/session'

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })
const MAX_PRICE = 1_000_000

// ---------- nova solicitação ----------
export async function createRequestAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const brandId = str(fd, 'brand_id'), branchId = str(fd, 'branch_id'), title = str(fd, 'title'), type = str(fd, 'type')
  const briefing = str(fd, 'briefing'), priority = str(fd, 'priority') || 'normal', due = str(fd, 'due_at')
  const item = str(fd, 'offer_item'), priceRaw = str(fd, 'offer_price').replace(',', '.'), until = str(fd, 'offer_valid_until')
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (title.length < 2 || title.length > 140) return { error: 'Dê um título à solicitação (2 a 140 caracteres).' }
  if (!isRequestType(type)) return { error: 'Escolha o tipo da peça.' }
  if (!isPriority(priority)) return { error: 'Prioridade inválida.' }
  if (briefing.length > 4000) return { error: 'O briefing passa de 4000 caracteres.' }
  if (due && !isIsoDate(due)) return { error: 'Prazo inválido.' }
  if (branchId && (!isUuid(branchId) || !(await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])).rowCount)) return { error: 'Unidade inválida para esta filial.' }
  let price: number | null = null
  if (priceRaw) {
    price = Number(priceRaw)
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) return { error: 'Preço inválido.' }
  }
  if (until && !isIsoDate(until)) return { error: 'Validade da oferta inválida.' }
  if ((price !== null || until) && !item) return { error: 'Informe qual é o item da oferta.' }
  const r = await pool.query(
    `insert into content_requests (brand_id, branch_id, requested_by, title, type, briefing, priority, due_at, offer_item, offer_price, offer_valid_until)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [brandId, branchId || null, g.user.id, title, type, briefing, priority, due || null, item || null, price, until || null])
  await audit('solicitacao_criada', { userId: g.user.id, ip: await clientIp(), target: r.rows[0].id })
  revalidatePath('/producao/solicitacoes')
  return { ok: 'Solicitação enviada.' }
}

async function guard(id: string) {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error } as const
  if (!isUuid(id) || !(await rowAllowed(g.user, 'content_requests', id))) return { ok: false, error: 'Solicitação não encontrada.' } as const
  return { ok: true, user: g.user } as const
}

// ---------- andamento ----------
export async function moveRequestAction(id: string, to: string): Promise<Result> {
  const g = await guard(id)
  if (!g.ok) return fail(g.error)
  if (!isRequestStatus(to)) return fail('Situação inválida.')
  const cur = (await pool.query(`select status from content_requests where id = $1`, [id])).rows[0]?.status as RequestStatus | undefined
  if (!cur) return fail('Solicitação não encontrada.')
  if (!canMoveRequest(cur, to)) return fail('Essa mudança de situação não é permitida a partir do estado atual.')
  await pool.query(`update content_requests set status = $2, updated_at = now() where id = $1`, [id, to])
  await audit('solicitacao_situacao', { userId: g.user.id, ip: await clientIp(), target: id, meta: { de: cur, para: to } })
  revalidatePath('/producao/solicitacoes')
  return { ok: true }
}

// Mexer na oferta tira a confirmação: preço e validade precisam ser conferidos de novo.
export async function saveOfferAction(id: string, offer: { item: string; price: string; until: string }): Promise<Result> {
  const g = await guard(id)
  if (!g.ok) return fail(g.error)
  const item = offer.item.trim().slice(0, 200)
  const price = offer.price.trim() === '' ? null : Number(offer.price.replace(',', '.'))
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > MAX_PRICE)) return fail('Preço inválido.')
  if (offer.until && !isIsoDate(offer.until)) return fail('Validade inválida.')
  if (!item && (price !== null || offer.until)) return fail('Informe qual é o item da oferta.')
  await pool.query(
    `update content_requests set offer_item = $2, offer_price = $3, offer_valid_until = $4, info_confirmed_at = null, info_confirmed_by = null, updated_at = now() where id = $1`,
    [id, item || null, price, offer.until || null])
  await audit('solicitacao_oferta', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/producao/solicitacoes')
  return { ok: true }
}

export async function confirmRequestInfoAction(id: string): Promise<Result> {
  const g = await guard(id)
  if (!g.ok) return fail(g.error)
  const r = (await pool.query(`select offer_item, offer_price, offer_valid_until::text as offer_valid_until from content_requests where id = $1`, [id])).rows[0]
  if (!r?.offer_item || r.offer_price === null || !r.offer_valid_until) return fail('Preencha item, preço e validade da oferta antes de confirmar.')
  if (r.offer_valid_until < todayISO()) return fail('A validade da oferta já passou. Atualize antes de confirmar.')
  await pool.query(`update content_requests set info_confirmed_at = now(), info_confirmed_by = $2, updated_at = now() where id = $1`, [id, g.user.id])
  await audit('solicitacao_confirmada', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/producao/solicitacoes')
  return { ok: true }
}

// ---------- virar conteúdo ----------
export async function convertRequestAction(id: string): Promise<Result<{ postId: string }>> {
  const g = await guard(id)
  if (!g.ok) return fail(g.error)
  const today = todayISO()
  const out = await withTx(async (db): Promise<Result<{ postId: string }>> => {
    const r = (await db.query(
      `select *, offer_price::float8 as offer_price_n, offer_valid_until::text as vu, due_at::text as due_txt from content_requests where id = $1 for update`, [id])).rows[0]
    if (!r) return fail('Solicitação não encontrada.')
    const why = convertBlockedReason({
      status: r.status, linked_post_id: r.linked_post_id, offer_item: r.offer_item, offer_price: r.offer_price_n,
      offer_valid_until: r.vu, info_confirmed_at: r.info_confirmed_at,
    }, today)
    if (why) return fail(why)
    const type = r.type as RequestType
    const date = r.due_txt && r.due_txt >= today ? r.due_txt : today
    const p = await db.query(
      `insert into posts (brand_id, branch_id, title, post_date, format, pillar, stage, priority, due_at, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, 'briefing', $7, $8, $9, $9) returning id`,
      [r.brand_id, r.branch_id, r.title, date, FORMAT_BY_TYPE[type], r.offer_item ? 'campanha' : 'institucional', r.priority, r.due_txt || null, g.user.id])
    const postId = p.rows[0].id as string
    await db.query(`insert into post_status_events (post_id, from_stage, to_stage, actor_id, note) values ($1, null, 'briefing', $2, 'Criado a partir de uma solicitação')`, [postId, g.user.id])
    const lines = [`Briefing da solicitação: ${r.briefing || '(sem texto)'}`]
    if (r.offer_item) lines.push(`Oferta: ${r.offer_item} por R$ ${Number(r.offer_price_n).toFixed(2).replace('.', ',')}, válida até ${String(r.vu).split('-').reverse().join('/')} (confirmada).`)
    await db.query(`insert into post_comments (post_id, author_id, body) values ($1, $2, $3)`, [postId, g.user.id, lines.join('\n').slice(0, 4000)])
    await db.query(`update content_requests set linked_post_id = $2, status = 'em_producao', updated_at = now() where id = $1`, [id, postId])
    return { ok: true, postId }
  })
  if (out.ok) {
    await audit('solicitacao_convertida', { userId: g.user.id, ip: await clientIp(), target: id, meta: { post: out.postId } })
    revalidatePath('/producao/solicitacoes')
    revalidatePath('/producao')
  }
  return out
}
