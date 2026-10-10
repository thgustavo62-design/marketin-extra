// Mudança de etapa: UM ponto de entrada para quadro, editor e qualquer tela futura.
// Reúne as regras: revisão farmacêutica, bloqueio, confirmação de "Publicado", aprovação exigida e concorrência.
import { hasValidApproval, submitForApproval, withdrawPending } from '../approvals/service'
import { withTx } from '../db'
import { moveBlockedReason, needsPublishConfirmation, stageBlockedReason, type Pillar, type Stage } from '../domain'
import { reconfirmBlockedReason } from '../domain'
import { needsValidApproval } from '../domain'

export type StageResult =
  | { ok: true; revision: number; submitted?: boolean }
  | { ok: false; error: string; conflict?: boolean; needsConfirm?: boolean }

const CONFLICT = 'Este cartão foi alterado por outra pessoa depois que você o abriu. Nada foi sobrescrito; a tela será atualizada.'

export async function changeStage(opts: {
  postId: string; to: Stage; actorId: string; revision?: number; confirmPublish?: boolean; note?: string
}): Promise<StageResult> {
  const { postId, to, actorId } = opts
  return withTx(async (db): Promise<StageResult> => {
    const p = (await db.query(
      `select p.stage, p.pillar, p.pharma_review, p.blocked_reason, p.revision, b.approval_required,
              ci.status as instance_status, ci.reconfirmed_at::text as instance_reconfirmed_at
         from posts p join brands b on b.id = p.brand_id left join campaign_instances ci on ci.id = p.campaign_instance_id
        where p.id = $1 for update of p`, [postId])).rows[0] as
      { stage: Stage; pillar: Pillar; pharma_review: boolean; blocked_reason: string | null; revision: number; approval_required: boolean; instance_status: string | null; instance_reconfirmed_at: string | null } | undefined
    if (!p) return { ok: false, error: 'Este conteúdo não existe mais.', conflict: true }
    if (opts.revision !== undefined && p.revision !== opts.revision) return { ok: false, error: CONFLICT, conflict: true }
    if (p.stage === to) return { ok: true, revision: p.revision }

    const why = stageBlockedReason(p.pillar, to, p.pharma_review) ?? moveBlockedReason(p.stage, to, p.blocked_reason)
    if (why) return { ok: false, error: why }
    // Campanha gerada por modelo recorrente: preços, validade e estoque precisam ser reconfirmados por uma pessoa antes de seguir.
    const reconf = reconfirmBlockedReason(to, p.instance_status ? { status: p.instance_status, reconfirmed_at: p.instance_reconfirmed_at } : null)
    if (reconf) return { ok: false, error: reconf }
    if (needsPublishConfirmation(to) && !opts.confirmPublish) return { ok: false, error: 'Confirme que a publicação foi realizada.', needsConfirm: true }

    // Aprovado / agendado / publicado só com aprovação registrada e ainda válida (se a filial exige).
    if (needsValidApproval(to, p.approval_required) && !(await hasValidApproval(db, postId))) {
      return {
        ok: false,
        error: to === 'aprovado'
          ? 'Para aprovar, o conteúdo precisa ir para "Aguardando aprovação" e o revisor decidir com "Aprovar" no detalhe do cartão.'
          : 'Este conteúdo não tem aprovação válida (nunca foi aprovado ou foi alterado depois). Envie para aprovação antes.',
      }
    }

    let submitted = false
    if (to === 'aprovacao') {
      await submitForApproval(db, postId, actorId, opts.note)
      submitted = true
    } else if (p.stage === 'aprovacao') {
      await withdrawPending(db, postId, actorId, 'Cartão saiu de "Aguardando aprovação" sem decisão.')
    }

    const r = await db.query(
      `update posts set stage = $1, revision = revision + 1, updated_at = now(), updated_by = $2 where id = $3 returning revision`, [to, actorId, postId])
    await db.query(`insert into post_status_events (post_id, from_stage, to_stage, actor_id, note) values ($1,$2,$3,$4,$5)`, [postId, p.stage, to, actorId, opts.note?.slice(0, 300) || null])
    return { ok: true, revision: r.rows[0].revision, submitted }
  })
}
