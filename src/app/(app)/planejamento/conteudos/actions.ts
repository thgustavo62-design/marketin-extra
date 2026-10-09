'use server'

import { redirect } from 'next/navigation'
import { audit, writerOrError, writerOrRedirect } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isFormat, isIsoDate, isPillar, isStage, stageBlockedReason, REELS_TEMPLATE_TIMES } from '@/lib/domain'
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
  const values = [
    brandId, branchId || null, campaignId || null, campaignName, title, date, time || null, format, pillar, stage,
    String(fd.get('caption') ?? ''), String(fd.get('script') ?? ''), JSON.stringify(reels), str(fd, 'origin'), pharma,
  ]
  const ip = await clientIp()

  if (!id) {
    const r = await pool.query(
      `insert into posts (brand_id, branch_id, campaign_id, campaign_name, title, post_date, post_time, format, pillar, stage,
                          caption, script, reels, origin, pharma_review, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
      [...values, user.id],
    )
    await audit('conteudo_criado', { userId: user.id, ip, target: r.rows[0].id })
    redirect(`/planejamento/conteudos/${r.rows[0].id}?salvo=1`)
  }

  if (!isUuid(id)) return { error: 'Conteúdo inválido.' }
  const revision = Number(str(fd, 'revision'))
  const r = await pool.query(
    `update posts set brand_id=$1, branch_id=$2, campaign_id=$3, campaign_name=$4, title=$5, post_date=$6, post_time=$7,
            format=$8, pillar=$9, stage=$10, caption=$11, script=$12, reels=$13, origin=$14, pharma_review=$15,
            revision = revision + 1, updated_at = now()
      where id = $16 and revision = $17 returning id`,
    [...values, id, revision],
  )
  if (!r.rowCount) {
    const exists = await pool.query(`select 1 from posts where id = $1`, [id])
    return {
      error: exists.rowCount
        ? 'Este conteúdo foi alterado em outro lugar depois que você abriu. Nada foi sobrescrito: copie o que digitou, recarregue a página e aplique de novo.'
        : 'Este conteúdo foi excluído.',
    }
  }
  await audit('conteudo_editado', { userId: user.id, ip, target: id })
  redirect(`/planejamento/conteudos/${id}?salvo=1`)
}

export async function deletePostAction(fd: FormData) {
  const user = await writerOrRedirect()
  const id = str(fd, 'id')
  if (!isUuid(id)) redirect('/')
  const r = await pool.query(`delete from posts where id = $1 returning to_char(post_date, 'YYYY-MM') as m`, [id])
  await audit('conteudo_excluido', { userId: user.id, ip: await clientIp(), target: id })
  redirect(`/planejamento/calendario?m=${r.rows[0]?.m ?? ''}`)
}
