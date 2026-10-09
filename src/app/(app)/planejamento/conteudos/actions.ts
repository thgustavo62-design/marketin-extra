'use server'

import { redirect } from 'next/navigation'
import { rowAllowed } from '@/lib/access'
import { brandAllowed, NO_BRAND_ACCESS } from '@/lib/perms'
import { audit, writerOrError, writerOrRedirect } from '@/lib/auth'
import { pool } from '@/lib/db'
import { invalidateIfChanged } from '@/lib/approvals/service'
import { isFormat, isIsoDate, isPillar, isStage, stageBlockedReason, REELS_TEMPLATE_TIMES, type Stage } from '@/lib/domain'
import { changeStage } from '@/lib/production/stage'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp } from '@/lib/session'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export async function savePostAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await writerOrError()
  if (!guard.ok) return { error: guard.error }
  const user = guard.user

  const id = str(fd, 'id')
  const brandId = str(fd, 'brand_id')
  const branchId = str(fd, 'branch_id')
  const campaignId = str(fd, 'campaign_id')
  const title = str(fd, 'title')
  const date = str(fd, 'post_date')
  const time = str(fd, 'post_time')
  const format = str(fd, 'format')
  const pillar = str(fd, 'pillar')
  const stage = str(fd, 'stage')
  const pharma = fd.get('pharma_review') === 'on'

  if (!title) return { error: 'Informe o título da pauta.' }
  if (!isUuid(brandId)) return { error: 'Escolha a filial.' }
  if (!brandAllowed(user, brandId)) return { error: NO_BRAND_ACCESS }
  if (!isIsoDate(date)) return { error: 'Informe uma data válida.' }
  if (time && !TIME.test(time)) return { error: 'Horário inválido (use HH:MM).' }
  if (!isFormat(format) || !isPillar(pillar) || !isStage(stage)) return { error: 'Formato, pilar ou etapa inválidos.' }
  const blocked = stageBlockedReason(pillar, stage, pharma)
  if (blocked) return { error: blocked }

  // Unidade e campanha precisam pertencer à filial escolhida.
  if (branchId) {
    if (!isUuid(branchId)) return { error: 'Unidade inválida.' }
    const ok = await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])
    if (!ok.rowCount) return { error: 'A unidade escolhida não pertence a essa filial.' }
  }
  let campaignName: string | null = null
  if (campaignId) {
    if (!isUuid(campaignId)) return { error: 'Campanha inválida.' }
    const c = await pool.query(`select name from campaigns where id = $1 and brand_id = $2`, [campaignId, brandId])
    if (!c.rowCount) return { error: 'A campanha escolhida não pertence a essa filial.' }
    campaignName = c.rows[0].name
  }

  const sceneCount = Math.min(12, Math.max(REELS_TEMPLATE_TIMES.length, Number(str(fd, 'scene_count')) || 0))
  const reels = {
    hook: str(fd, 'reels_hook'),
    cta: str(fd, 'reels_cta'),
    scenes: Array.from({ length: sceneCount }, (_, i) => ({
      time: str(fd, `scene_time_${i}`),
      scene: str(fd, `scene_scene_${i}`),
      speech: str(fd, `scene_speech_${i}`),
      onscreen: str(fd, `scene_onscreen_${i}`),
    })),
  }
  const compliance = String(fd.get('compliance_note') ?? '').trim().slice(0, 1000) || null
  const values = [
    brandId, branchId || null, campaignId || null, campaignName, title, date, time || null, format, pillar, stage,
    String(fd.get('caption') ?? ''), String(fd.get('script') ?? ''), JSON.stringify(reels), str(fd, 'origin'), pharma,
  ]
  const ip = await clientIp()

  if (!id) {
    // Aprovação, agendamento e publicação não se pulam na criação: o conteúdo nasce antes e avança pelo fluxo.
    if (['aprovacao', 'aprovado', 'agendado', 'publicado'].includes(stage)) {
      return { error: 'Crie o conteúdo em Ideia, Briefing, Em produção ou Em revisão e avance pelo quadro: a aprovação não pode ser pulada.' }
    }
    const r = await pool.query(
      `insert into posts (brand_id, branch_id, campaign_id, campaign_name, title, post_date, post_time, format, pillar, stage,
                          caption, script, reels, origin, pharma_review, created_by, updated_by, compliance_note, pharma_reviewed_by, pharma_reviewed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$17, case when $15 then $16::uuid end, case when $15 then now() end) returning id`,
      [...values, user.id, compliance],
    )
    await pool.query(`insert into post_status_events (post_id, from_stage, to_stage, actor_id) values ($1, null, $2, $3)`, [r.rows[0].id, stage, user.id])
    await audit('conteudo_criado', { userId: user.id, ip, target: r.rows[0].id })
    redirect(`/planejamento/conteudos/${r.rows[0].id}?salvo=1`)
  }

  if (!isUuid(id)) return { error: 'Conteúdo inválido.' }
  if (!(await rowAllowed(user, 'posts', id))) return { error: NO_BRAND_ACCESS }
  const revision = Number(str(fd, 'revision'))
  const prev = (await pool.query(`select stage from posts where id = $1`, [id])).rows[0]?.stage as Stage | undefined
  // Os campos são salvos com a etapa ATUAL; a troca de etapa passa depois pelas regras do fluxo (aprovação, bloqueio...).
  const updateValues = [...values.slice(0, 9), prev ?? stage, ...values.slice(10)]
  const r = await pool.query(
    `update posts set brand_id=$1, branch_id=$2, campaign_id=$3, campaign_name=$4, title=$5, post_date=$6, post_time=$7,
            format=$8, pillar=$9, stage=$10, caption=$11, script=$12, reels=$13, origin=$14,
            pharma_reviewed_by = case when $15 and not pharma_review then $18::uuid when not $15 then null else pharma_reviewed_by end,
            pharma_reviewed_at = case when $15 and not pharma_review then now() when not $15 then null else pharma_reviewed_at end,
            pharma_review=$15, compliance_note=$19,
            revision = revision + 1, updated_at = now(), updated_by = $18
      where id = $16 and revision = $17 returning id`,
    [...updateValues, id, revision, user.id, compliance],
  )
  if (!r.rowCount) {
    const exists = await pool.query(`select 1 from posts where id = $1`, [id])
    return {
      error: exists.rowCount
        ? 'Este conteúdo foi alterado em outro lugar depois que você abriu. Nada foi sobrescrito: copie o que digitou, recarregue a página e aplique de novo.'
        : 'Este conteúdo foi excluído.',
    }
  }
  let aviso = ''
  if (prev && prev !== stage) {
    const sr = await changeStage({ postId: id, to: stage as Stage, actorId: user.id, confirmPublish: true })
    if (!sr.ok) aviso = sr.error
    else await audit('conteudo_etapa', { userId: user.id, ip, target: id, meta: { de: prev, para: stage } })
  }
  // Se o texto ou os anexos mudaram depois de enviado/aprovado, a aprovação deixa de valer.
  await invalidateIfChanged(id, user.id, 'O conteúdo foi alterado depois do envio para aprovação.')
  await audit('conteudo_editado', { userId: user.id, ip, target: id })
  redirect(`/planejamento/conteudos/${id}?salvo=1${aviso ? '&aviso=' + encodeURIComponent('Conteúdo salvo, mas a etapa não mudou: ' + aviso) : ''}`)
}

export async function deletePostAction(fd: FormData) {
  const user = await writerOrRedirect()
  const id = str(fd, 'id')
  if (!isUuid(id)) redirect('/')
  if (!(await rowAllowed(user, 'posts', id))) redirect('/?sem-permissao=1')
  const r = await pool.query(`delete from posts where id = $1 returning to_char(post_date, 'YYYY-MM') as m`, [id])
  await audit('conteudo_excluido', { userId: user.id, ip: await clientIp(), target: id })
  redirect(`/planejamento/calendario?m=${r.rows[0]?.m ?? ''}`)
}
