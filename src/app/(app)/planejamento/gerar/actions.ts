'use server'

import { brandAllowed, NO_BRAND_ACCESS } from '@/lib/perms'
import { audit, writerOrError } from '@/lib/auth'
import { pool } from '@/lib/db'
import { addDays, formatBR, generateWeek, isIsoDate } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp } from '@/lib/session'

export async function generateWeekAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await writerOrError()
  if (!guard.ok) return { error: guard.error }
  const user = guard.user
  const brandId = str(fd, 'brand_id')
  const start = str(fd, 'start')
  const campaignId = str(fd, 'campaign_id')
  if (!isUuid(brandId)) return { error: 'Escolha a filial.' }
  if (!brandAllowed(user, brandId)) return { error: NO_BRAND_ACCESS }
  if (!isIsoDate(start)) return { error: 'Informe a data inicial.' }

  const brand = (await pool.query(`select name from brands where id = $1`, [brandId])).rows[0]
  if (!brand) return { error: 'Filial não encontrada.' }
  let campaign = null
  if (campaignId) {
    if (!isUuid(campaignId)) return { error: 'Campanha inválida.' }
    campaign = (await pool.query(
      `select id, name, starts_on::text as starts_on, ends_on::text as ends_on from campaigns where id = $1 and brand_id = $2`,
      [campaignId, brandId],
    )).rows[0]
    if (!campaign) return { error: 'A campanha escolhida não pertence a essa filial.' }
  }

  const end = addDays(start, 6)
  const existing = (await pool.query(
    `select post_date::text as post_date, title from posts where brand_id = $1 and post_date between $2 and $3`,
    [brandId, start, end],
  )).rows
  const result = generateWeek({ brandName: brand.name, startDate: start, campaign, existing })
  if (result.error) return { error: result.error }

  const client = await pool.connect()
  try {
    await client.query('begin')
    for (const d of result.drafts) {
      await client.query(
        `insert into posts (brand_id, campaign_id, campaign_name, title, post_date, format, pillar, stage, caption, script, reels, origin, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,'rascunho',$8,$9,$10,$11,$12)`,
        [brandId, d.campaign_id, campaign?.name ?? null, d.title, d.post_date, d.format, d.pillar, d.caption, d.script, JSON.stringify(d.reels), d.origin, user.id],
      )
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
  await audit('semana_gerada', { userId: user.id, ip: await clientIp(), target: brandId, meta: { start, criados: result.drafts.length, ignorados: result.skipped.length } })

  const parts = [`${result.drafts.length} rascunho(s) criado(s) de ${formatBR(start)} a ${formatBR(end)}. Preencha os trechos entre [colchetes] antes de aprovar.`]
  if (result.skipped.length) parts.push(`Ignorados por já existirem: ${result.skipped.join('; ')}.`)
  return { ok: parts.join(' ') }
}
