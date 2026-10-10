'use server'

import { revalidatePath } from 'next/cache'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { pool } from '@/lib/db'
import { buildFinalUrl, canApproveLink, normalizeUtm, validateDestination } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { clientIp } from '@/lib/session'

type Result = { ok: true } | { ok: false; error: string }

export async function createLinkAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const brandId = str(fd, 'brand_id'), branchId = str(fd, 'branch_id'), campaignId = str(fd, 'campaign_id'), label = str(fd, 'label'), notes = str(fd, 'notes')
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (label.length < 2 || label.length > 120) return { error: 'Dê um nome ao link (2 a 120 caracteres).' }
  if (notes.length > 500) return { error: 'A observação passa de 500 caracteres.' }
  if (branchId && (!isUuid(branchId) || !(await pool.query(`select 1 from branches where id = $1 and brand_id = $2`, [branchId, brandId])).rowCount)) return { error: 'Unidade inválida para esta filial.' }
  if (campaignId && (!isUuid(campaignId) || !(await pool.query(`select 1 from campaigns where id = $1 and brand_id = $2`, [campaignId, brandId])).rowCount)) return { error: 'Campanha inválida para esta filial.' }
  const dest = validateDestination(str(fd, 'destination'))
  if (!dest.ok) return { error: dest.error }
  const utm = normalizeUtm({ source: str(fd, 'utm_source'), medium: str(fd, 'utm_medium'), campaign: str(fd, 'utm_campaign'), term: str(fd, 'utm_term'), content: str(fd, 'utm_content') })
  if (!utm.ok) return { error: utm.error }
  const finalUrl = buildFinalUrl(dest.url, utm.utm)
  if (finalUrl.length > 2600) return { error: 'O link final ficou longo demais.' }
  try {
    const r = await pool.query(
      `insert into campaign_links (brand_id, branch_id, campaign_id, label, destination_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, final_url, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [brandId, branchId || null, campaignId || null, label, dest.url, utm.utm.source, utm.utm.medium, utm.utm.campaign, utm.utm.term ?? null, utm.utm.content ?? null, finalUrl, notes || null, g.user.id])
    await audit('link_criado', { userId: g.user.id, ip: await clientIp(), target: r.rows[0].id })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { error: 'Já existe um link ativo com esse mesmo endereço final nesta filial.' }
    throw e
  }
  revalidatePath('/gestao/links')
  const warn = dest.removedParams.length ? ` Os parâmetros ${dest.removedParams.join(', ')} que já estavam no endereço foram substituídos pelos definidos aqui.` : ''
  return { ok: `Link criado como rascunho. Peça a aprovação para liberar o QR Code.${warn}` }
}

async function guard(id: string) {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error } as const
  if (!isUuid(id) || !(await rowAllowed(g.user, 'campaign_links', id))) return { ok: false, error: 'Link não encontrado.' } as const
  return { ok: true, user: g.user } as const
}

// Aprovação = outra pessoa confirma que abriu o destino e conferiu. Só então o QR Code é liberado.
export async function approveLinkAction(id: string, openedAndChecked: boolean): Promise<Result> {
  const g = await guard(id)
  if (!g.ok) return g
  if (!openedAndChecked) return { ok: false, error: 'Confirme que você abriu o destino e conferiu que é a página certa.' }
  const row = (await pool.query(`select created_by, status from campaign_links where id = $1`, [id])).rows[0]
  if (!row) return { ok: false, error: 'Link não encontrado.' }
  if (row.status !== 'rascunho') return { ok: false, error: 'Só links em rascunho podem ser aprovados.' }
  const denied = canApproveLink({ userId: g.user.id, role: g.user.role, createdBy: row.created_by })
  if (denied) return { ok: false, error: denied }
  const u = await pool.query(`update campaign_links set status = 'aprovado', approved_by = $2, approved_at = now(), updated_at = now() where id = $1 and status = 'rascunho' returning id`, [id, g.user.id])
  if (!u.rowCount) return { ok: false, error: 'Este link já foi decidido por outra pessoa.' }
  await audit('link_aprovado', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/gestao/links')
  return { ok: true }
}

export async function archiveLinkAction(id: string): Promise<Result> {
  const g = await guard(id)
  if (!g.ok) return g
  await pool.query(`update campaign_links set status = 'arquivado', updated_at = now() where id = $1`, [id])
  await audit('link_arquivado', { userId: g.user.id, ip: await clientIp(), target: id })
  revalidatePath('/gestao/links')
  return { ok: true }
}
