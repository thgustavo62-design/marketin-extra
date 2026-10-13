'use server'

import { revalidatePath } from 'next/cache'
import { audit, writerOrError } from '@/lib/auth'
import { rowAllowed } from '@/lib/access'
import { pool } from '@/lib/db'
import { formatBR, isPillar, type Pillar } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { brandAllowed } from '@/lib/perms'
import { importPlan, undoImport } from '@/lib/plan/service'
import { clientIp } from '@/lib/session'

const STAGES_OK = ['auto', 'ideia', 'briefing'] as const

function refresh(id?: string) {
  for (const p of ['/planejamento/calendario', '/planejamento/conteudos', '/producao', '/', '/planejamento/importar-plano']) revalidatePath(p)
  if (id) revalidatePath(`/planejamento/importar-plano/${id}`)
}

export async function confirmPlanImportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const user = g.user
  const id = str(fd, 'id')
  if (!isUuid(id)) return { error: 'Prévia inválida.' }
  if (!(await rowAllowed(user, 'plan_imports', id))) return { error: 'Prévia não encontrada.' }

  const selected = fd.getAll('sel').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0)
  if (selected.length === 0) return { error: 'Marque pelo menos uma peça para importar.' }

  const lead = Number(str(fd, 'lead_days'))
  if (!Number.isInteger(lead) || lead < 0 || lead > 14) return { error: 'A antecedência do prazo deve ser de 0 a 14 dias.' }
  const initialStage = str(fd, 'initial_stage') || 'auto'
  if (!(STAGES_OK as readonly string[]).includes(initialStage)) return { error: 'Etapa inicial inválida.' }
  const assignedTo = str(fd, 'assigned_to'), reviewerId = str(fd, 'reviewer_id')
  if ((assignedTo && !isUuid(assignedTo)) || (reviewerId && !isUuid(reviewerId))) return { error: 'Responsável ou revisor inválido.' }
  const createCampaign = fd.get('create_campaign') === 'on'
  const campaignName = str(fd, 'campaign_name')
  if (createCampaign && (campaignName.length < 3 || campaignName.length > 120)) return { error: 'O nome da campanha deve ter de 3 a 120 caracteres.' }

  const pillarOverrides: Record<number, Pillar> = {}
  for (const i of selected) {
    const v = str(fd, `pillar_${i}`)
    if (v && isPillar(v)) pillarOverrides[i] = v
  }

  const r = await importPlan({
    id, userId: user.id, canUseBrand: (b) => brandAllowed(user, b), selected, leadDays: lead, initialStage: initialStage as (typeof STAGES_OK)[number],
    assignedTo: assignedTo || null, reviewerId: reviewerId || null, createCampaign, campaignName, pillarOverrides,
  })
  if (!r.ok) return { error: r.error }
  await audit('plano_importado', { userId: user.id, ip: await clientIp(), target: id, meta: { criadas: r.created, ignoradas: r.skipped.length, campanha: r.campaignId ? 'sim' : 'não' } })
  refresh(id)
  const parts = [`${r.created} ${r.created === 1 ? 'pauta criada' : 'pautas criadas'} a partir de ${formatBR(r.firstDate)}, com tarefas e comentário do briefing.`]
  if (r.skipped.length) parts.push(`${r.skipped.length} já existiam no calendário e foram ignoradas.`)
  return { ok: parts.join(' ') }
}

export async function undoPlanImportAction(id: string): Promise<{ ok: true; removed: number; kept: number } | { ok: false; error: string }> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id) || !(await rowAllowed(g.user, 'plan_imports', id))) return { ok: false, error: 'Importação não encontrada.' }
  const r = await undoImport(id, g.user.id, (b) => brandAllowed(g.user, b))
  if (!r.ok) return r
  await audit('plano_desfeito', { userId: g.user.id, ip: await clientIp(), target: id, meta: { removidas: r.removed, mantidas: r.kept } })
  refresh(id)
  return r
}

export async function discardPreviewAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id) || !(await rowAllowed(g.user, 'plan_imports', id))) return { ok: false, error: 'Prévia não encontrada.' }
  const r = await pool.query(`delete from plan_imports where id = $1 and status = 'previa'`, [id])
  if (!r.rowCount) return { ok: false, error: 'Só dá para descartar uma prévia ainda não importada.' }
  refresh()
  return { ok: true }
}
