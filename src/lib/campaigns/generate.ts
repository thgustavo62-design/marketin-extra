// Motor de campanhas recorrentes. Geração MANUAL (um clique); só depois de validada em uso real vale ligar um agendador.
// Idempotente: a chave `modelo|filial|unidade|início` é única no banco, então rodar duas vezes nunca duplica.
// Cada instância é independente: mudar o modelo depois não mexe no que já foi gerado.
import { withTx } from '../db'
import {
  MAX_POSTS_PER_OCCURRENCE, addDays, generationKey, occurrencesBetween, planChecklist, planPosts, validateRecurrence, type Format, type Recurrence,
} from '../domain'

export type GenerateResult =
  | { ok: true; created: { instanceId: string; campaignId: string; start: string; posts: number }[]; existing: number; window: { from: string; to: string }; none: boolean }
  | { ok: false; error: string }

export async function generateInstances(templateId: string, actorId: string, today: string, origin: 'manual' | 'job' = 'manual'): Promise<GenerateResult> {
  return withTx(async (db): Promise<GenerateResult> => {
    // Trava o modelo: duas pessoas clicando ao mesmo tempo esperam uma pela outra.
    const t = (await db.query(
      `select t.*, t.specific_dates::text[] as dates_txt, t.anchor_date::text as anchor_txt, t.valid_from::text as vf, t.valid_to::text as vt,
              (select display_name from users where id = t.default_reviewer) as reviewer_name
         from campaign_templates t where t.id = $1 for update of t`, [templateId])).rows[0]
    if (!t) return { ok: false, error: 'Modelo não encontrado.' }
    if (!t.active) return { ok: false, error: 'Este modelo está pausado. Retome-o para gerar campanhas.' }

    const rule: Recurrence = {
      frequency: t.frequency, start_dow: t.start_dow, anchor_date: t.anchor_txt, day_of_month: t.day_of_month,
      specific_dates: t.dates_txt ?? [], duration_days: t.duration_days, valid_from: t.vf, valid_to: t.vt,
    }
    const bad = validateRecurrence(rule)
    if (bad) return { ok: false, error: bad }
    const dels = (await db.query(`select format, quantity, publish_offset_days from campaign_template_deliverables where template_id = $1 order by sort_order`, [templateId])).rows as
      { format: Format; quantity: number; publish_offset_days: number }[]
    if (dels.length === 0) return { ok: false, error: 'Cadastre pelo menos uma entrega (feed, carrossel ou Reels) neste modelo.' }

    const window = { from: today, to: addDays(today, t.lead_days) }
    const occs = occurrencesBetween(rule, window.from, window.to)
    const created: { instanceId: string; campaignId: string; start: string; posts: number }[] = []
    let existing = 0

    for (const occ of occs) {
      const key = generationKey(t.id, t.brand_id, t.branch_id, occ.start)
      const ins = await db.query(
        `insert into campaign_instances (template_id, brand_id, branch_id, occurrence_start, occurrence_end, generation_key, origin, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing returning id`,
        [t.id, t.brand_id, t.branch_id, occ.start, occ.end, key, origin, actorId])
      if (!ins.rowCount) { existing++; continue }
      const instanceId = ins.rows[0].id as string

      const name = `${t.name} — ${occ.start.slice(8, 10)}/${occ.start.slice(5, 7)}`
      const camp = await db.query(
        `insert into campaigns (brand_id, name, starts_on, ends_on, objective, briefing, approver) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [t.brand_id, name.slice(0, 160), occ.start, occ.end, t.objective, t.briefing, t.reviewer_name ?? ''])
      const campaignId = camp.rows[0].id as string
      await db.query(`update campaign_instances set campaign_id = $2 where id = $1`, [instanceId, campaignId])

      const planned = planPosts(t.name, occ, dels, t.approval_days)
      const checklist = planChecklist(occ, { briefing_days: t.briefing_days, creation_days: t.creation_days, approval_days: t.approval_days, checklist: t.checklist ?? [] })
      for (const p of planned.slice(0, MAX_POSTS_PER_OCCURRENCE)) {
        const post = await db.query(
          `insert into posts (brand_id, branch_id, campaign_id, campaign_name, campaign_instance_id, title, post_date, format, pillar, stage, priority,
                              due_at, assigned_to, reviewer_id, created_by, updated_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'campanha', 'briefing', $9, $10, $11, $12, $13, $13) returning id`,
          [t.brand_id, t.branch_id, campaignId, name.slice(0, 160), instanceId, p.title, p.post_date, p.format, t.priority, p.due_at, t.default_owner, t.default_reviewer, actorId])
        const postId = post.rows[0].id as string
        await db.query(`insert into post_status_events (post_id, from_stage, to_stage, actor_id, note) values ($1, null, 'briefing', $2, $3)`, [postId, actorId, 'Gerado pelo modelo recorrente "' + t.name + '"'])
        for (let i = 0; i < checklist.length; i++) {
          await db.query(`insert into post_checklist_items (post_id, label, sort_order) values ($1, $2, $3)`, [postId, checklist[i], i])
        }
      }
      created.push({ instanceId, campaignId, start: occ.start, posts: Math.min(planned.length, MAX_POSTS_PER_OCCURRENCE) })
    }
    return { ok: true, created, existing, window, none: occs.length === 0 }
  })
}
