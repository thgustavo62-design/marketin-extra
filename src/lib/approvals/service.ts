// Aprovações (servidor). Regra central: a aprovação vale para UMA versão congelada do conteúdo.
// Se qualquer coisa relevante mudar depois (legenda, anexos, campanha...), a impressão digital muda e a aprovação é invalidada.
import type pg from 'pg'
import { pool, withTx } from '../db'
import { canDecide, decisionNeedsReason, stageBlockedReason, type Decision, type Pillar, type Stage } from '../domain'
import { contentChecksum, type ContentPayload } from './checksum'

type Db = Pick<pg.PoolClient, 'query'>

export type LoadedContent = ContentPayload & { postId: string; brandId: string; stage: Stage; pillar: Pillar; pharmaReview: boolean; revision: number; reviewerId: string | null }

export async function loadContent(db: Db, postId: string): Promise<LoadedContent | null> {
  const p = (await db.query(
    `select id, brand_id, title, caption, script, reels, origin, campaign_id, stage, pillar, pharma_review, revision, reviewer_id from posts where id = $1`, [postId])).rows[0]
  if (!p) return null
  const assets = (await db.query(
    `select k.asset_id, k.role, m.checksum_sha256, m.external_url from content_asset_links k join media_assets m on m.id = k.asset_id where k.post_id = $1`, [postId])).rows
  return {
    postId: p.id, brandId: p.brand_id, stage: p.stage, pillar: p.pillar, pharmaReview: p.pharma_review, revision: p.revision, reviewerId: p.reviewer_id,
    title: p.title, caption: p.caption, script: p.script, reels: p.reels, origin: p.origin, campaignId: p.campaign_id,
    assets: assets.map((a) => ({ assetId: a.asset_id, role: a.role, checksum: a.checksum_sha256, url: a.external_url })),
  }
}

const payloadOf = (c: LoadedContent): ContentPayload => ({ title: c.title, caption: c.caption, script: c.script, reels: c.reels, origin: c.origin, campaignId: c.campaignId, assets: c.assets })

async function event(db: Db, approvalId: string, ev: string, actorId: string | null, note?: string | null) {
  await db.query(`insert into approval_events (approval_id, event, actor_id, note) values ($1, $2, $3, $4)`, [approvalId, ev, actorId, note ?? null])
}

async function stageEvent(db: Db, postId: string, from: Stage, to: Stage, actorId: string | null, note: string | null) {
  await db.query(`insert into post_status_events (post_id, from_stage, to_stage, actor_id, note) values ($1, $2, $3, $4, $5)`, [postId, from, to, actorId, note])
}

// Retira a aprovação pendente (conteúdo saiu da etapa "Aguardando aprovação" sem decisão).
export async function withdrawPending(db: Db, postId: string, actorId: string | null, note: string) {
  const r = await db.query(`update approvals set status = 'invalidated', invalidated_reason = $2 where post_id = $1 and status = 'pending' returning id`, [postId, note])
  for (const row of r.rows) await event(db, row.id, 'withdrawn', actorId, note)
}

// Congela a versão atual e abre uma aprovação pendente. Um novo envio substitui o pendente anterior.
export async function submitForApproval(db: Db, postId: string, actorId: string, note?: string | null): Promise<{ approvalId: string; versionNumber: number }> {
  const c = await loadContent(db, postId)
  if (!c) throw new Error('Conteúdo não encontrado.')
  await withdrawPending(db, postId, actorId, 'Substituída por um novo envio.')
  const n = (await db.query(`select coalesce(max(version_number), 0) + 1 as n from content_versions where post_id = $1`, [postId])).rows[0].n as number
  const v = await db.query(
    `insert into content_versions (post_id, version_number, title, caption, script, reels, origin, campaign_id, asset_manifest, content_checksum, change_reason, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [postId, n, c.title, c.caption, c.script, JSON.stringify(c.reels ?? {}), c.origin, c.campaignId, JSON.stringify(c.assets), contentChecksum(payloadOf(c)), note ?? null, actorId],
  )
  const a = await db.query(
    `insert into approvals (post_id, brand_id, version_id, submitted_by, reviewer_id) values ($1,$2,$3,$4,$5) returning id`,
    [postId, c.brandId, v.rows[0].id, actorId, c.reviewerId],
  )
  await event(db, a.rows[0].id, 'submitted', actorId, note)
  return { approvalId: a.rows[0].id, versionNumber: n }
}

// A aprovação mais recente vale para o conteúdo como ele está agora?
export async function hasValidApproval(db: Db, postId: string): Promise<boolean> {
  const c = await loadContent(db, postId)
  if (!c) return false
  const r = (await db.query(
    `select v.content_checksum from approvals a join content_versions v on v.id = a.version_id
      where a.post_id = $1 and a.status = 'approved' order by a.decided_at desc nulls last limit 1`, [postId])).rows[0]
  return Boolean(r) && r.content_checksum === contentChecksum(payloadOf(c))
}

// Chamada depois de QUALQUER edição relevante. Se a versão aprovada/pendente não confere mais com o conteúdo, invalida
// e devolve o cartão para revisão (o que já foi publicado só perde a aprovação).
export async function invalidateIfChanged(postId: string, actorId: string, why: string): Promise<boolean> {
  return withTx(async (db) => {
    const c = await loadContent(db, postId)
    if (!c) return false
    const a = (await db.query(
      `select a.id, a.status, v.content_checksum from approvals a join content_versions v on v.id = a.version_id
        where a.post_id = $1 and a.status in ('approved', 'pending') order by a.created_at desc limit 1`, [postId])).rows[0]
    if (!a || a.content_checksum === contentChecksum(payloadOf(c))) return false
    await db.query(`update approvals set status = 'invalidated', invalidated_reason = $2 where id = $1`, [a.id, why])
    await event(db, a.id, 'invalidated', actorId, why)
    if (c.stage === 'aprovacao' || c.stage === 'aprovado' || c.stage === 'agendado') {
      await db.query(`update posts set stage = 'revisao', revision = revision + 1, updated_at = now(), updated_by = $2 where id = $1`, [postId, actorId])
      await stageEvent(db, postId, c.stage, 'revisao', actorId, `Aprovação invalidada: ${why}`)
    } else {
      await stageEvent(db, postId, c.stage, c.stage, actorId, `Aprovação invalidada: ${why}`)
    }
    return true
  })
}

export type DecideResult = { ok: true; stage: Stage } | { ok: false; error: string }

export async function decideApproval(postId: string, decision: Decision, reason: string, actor: { id: string; role: string }): Promise<DecideResult> {
  const text = reason.trim()
  if (decisionNeedsReason(decision) && text.length < 3) return { ok: false, error: 'Explique o motivo (mínimo de 3 caracteres).' }
  return withTx(async (db): Promise<DecideResult> => {
    const row = (await db.query(
      `select a.id, a.reviewer_id, a.submitted_by, v.content_checksum from approvals a join content_versions v on v.id = a.version_id
        where a.post_id = $1 and a.status = 'pending' for update of a`, [postId])).rows[0]
    if (!row) return { ok: false, error: 'Não há aprovação pendente para este conteúdo (já foi decidida ou perdeu a validade).' }
    const c = await loadContent(db, postId)
    if (!c) return { ok: false, error: 'Conteúdo não encontrado.' }
    const denied = canDecide({ userId: actor.id, role: actor.role, reviewerId: row.reviewer_id ?? c.reviewerId, submittedBy: row.submitted_by })
    if (denied) return { ok: false, error: denied }

    // O conteúdo mudou depois do envio: ninguém aprova uma versão que já não existe.
    if (row.content_checksum !== contentChecksum(payloadOf(c))) {
      await db.query(`update approvals set status = 'invalidated', invalidated_reason = $2 where id = $1`, [row.id, 'O conteúdo foi alterado depois do envio.'])
      await event(db, row.id, 'invalidated', actor.id, 'O conteúdo foi alterado depois do envio.')
      await db.query(`update posts set stage = 'revisao', revision = revision + 1, updated_at = now(), updated_by = $2 where id = $1`, [postId, actor.id])
      await stageEvent(db, postId, c.stage, 'revisao', actor.id, 'Aprovação invalidada: conteúdo alterado depois do envio.')
      return { ok: false, error: 'O conteúdo foi alterado depois do envio, então a aprovação foi invalidada. Envie novamente para aprovação.' }
    }

    if (decision === 'approved') {
      const why = stageBlockedReason(c.pillar, 'aprovado', c.pharmaReview)
      if (why) return { ok: false, error: why }
    }
    const to: Stage = decision === 'approved' ? 'aprovado' : 'producao'
    await db.query(`update approvals set status = $2, reason = $3, decided_by = $4, decided_at = now() where id = $1`, [row.id, decision, text || null, actor.id])
    await event(db, row.id, decision, actor.id, text || null)
    await db.query(`update posts set stage = $2, revision = revision + 1, updated_at = now(), updated_by = $3 where id = $1`, [postId, to, actor.id])
    await stageEvent(db, postId, c.stage, to, actor.id, decision === 'approved' ? 'Aprovado' : `${decision === 'rejected' ? 'Reprovado' : 'Ajustes solicitados'}: ${text}`)
    return { ok: true, stage: to }
  })
}

export type ApprovalInfo = {
  id: string; status: 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'invalidated'; version_number: number
  reason: string | null; invalidated_reason: string | null; submitted_by_name: string | null; reviewer_id: string | null; reviewer_name: string | null
  decided_by_name: string | null; decided_at: string | null; created_at: string
  /** aprovado E ainda igual ao conteúdo atual */
  valid: boolean
}

export async function getApprovalInfo(postId: string): Promise<{ latest: ApprovalInfo | null; history: { event: string; actor_name: string | null; note: string | null; created_at: string }[] }> {
  const r = (await pool.query(
    `select a.id, a.status, v.version_number, a.reason, a.invalidated_reason, us.display_name as submitted_by_name, a.reviewer_id, ur.display_name as reviewer_name,
            ud.display_name as decided_by_name, a.decided_at::text as decided_at, a.created_at::text as created_at
       from approvals a join content_versions v on v.id = a.version_id
       left join users us on us.id = a.submitted_by left join users ur on ur.id = a.reviewer_id left join users ud on ud.id = a.decided_by
      where a.post_id = $1 order by a.created_at desc limit 1`, [postId])).rows[0]
  if (!r) return { latest: null, history: [] }
  const valid = r.status === 'approved' && (await hasValidApproval(pool, postId))
  const history = (await pool.query(
    `select e.event, u.display_name as actor_name, e.note, e.created_at::text as created_at
       from approval_events e join approvals a on a.id = e.approval_id left join users u on u.id = e.actor_id where a.post_id = $1 order by e.created_at desc, e.id desc limit 30`, [postId])).rows
  return { latest: { ...r, valid }, history }
}
