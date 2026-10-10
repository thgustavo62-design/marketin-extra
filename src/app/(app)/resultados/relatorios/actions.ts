'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { rowAllowed } from '@/lib/access'
import { audit, writerOrError } from '@/lib/auth'
import { getBrands } from '@/lib/data'
import { pool } from '@/lib/db'
import { isFormat, isIsoDate, isReportType, monthOf, reportKey, todayISO, validatePeriod, weekOf, type Period, type ReportFilters, type ReportType } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { NO_BRAND_ACCESS, brandAllowed } from '@/lib/perms'
import { buildReport } from '@/lib/reports/build'
import { clientIp } from '@/lib/session'

// Cria (ou, no mesmo dia, substitui) o relatório. O mesmo pedido no mesmo dia nunca gera duas linhas.
async function generate(input: { userId: string; brandId: string; branchId: string | null; type: ReportType; period: Period; filters: ReportFilters }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const brand = (await getBrands()).find((b) => b.id === input.brandId)
  if (!brand) return { ok: false, error: 'Filial não encontrada.' }
  let branch: { id: string; name: string } | null = null
  if (input.branchId) {
    branch = (await pool.query(`select id, name from branches where id = $1 and brand_id = $2`, [input.branchId, input.brandId])).rows[0] ?? null
    if (!branch) return { ok: false, error: 'Unidade inválida para esta filial.' }
  }
  if (input.filters.campaignId && !(await pool.query(`select 1 from campaigns where id = $1 and brand_id = $2`, [input.filters.campaignId, input.brandId])).rowCount) return { ok: false, error: 'Campanha inválida para esta filial.' }
  const today = todayISO()
  try {
    const snapshot = await buildReport({ type: input.type, brand: { id: brand.id, slug: brand.slug, name: brand.name }, branch, period: input.period, filters: input.filters, today })
    const key = reportKey(input.type, input.brandId, input.branchId, input.period, input.filters, today)
    const r = await pool.query(
      `insert into reports (brand_id, branch_id, type, period_start, period_end, filters, dedupe_key, snapshot, data_through, generated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (dedupe_key) do update set snapshot = excluded.snapshot, data_through = excluded.data_through, generated_at = now(), generated_by = excluded.generated_by
       returning id`,
      [input.brandId, input.branchId, input.type, input.period.from, input.period.to, JSON.stringify(input.filters), key, JSON.stringify(snapshot), snapshot.meta.dataThrough, input.userId])
    return { ok: true, id: r.rows[0].id }
  } catch (e) {
    // falha na geração fica registrada (sem detalhes sensíveis) e pode ser reprocessada sem duplicar
    await pool.query(
      `insert into integration_sync_runs (provider, job_type, brand_id, status, finished_at, error_summary_safe, requested_by) values ('windsor', 'generate_report', $1, 'failed', now(), $2, $3)`,
      [input.brandId, `Falha ao gerar relatório (${e instanceof Error ? e.name : 'erro'})`, input.userId])
    return { ok: false, error: 'Não foi possível gerar o relatório agora. Nada foi duplicado: tente novamente.' }
  }
}

export async function generateReportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const brandId = str(fd, 'brand_id'), branchId = str(fd, 'branch_id'), type = str(fd, 'type'), preset = str(fd, 'preset')
  const ref = str(fd, 'ref'), format = str(fd, 'format'), campaign = str(fd, 'campaign_id')
  if (!isUuid(brandId) || !brandAllowed(g.user, brandId)) return { error: NO_BRAND_ACCESS }
  if (!isReportType(type)) return { error: 'Escolha o tipo de relatório.' }
  if (branchId && !isUuid(branchId)) return { error: 'Unidade inválida.' }
  if (format && !isFormat(format)) return { error: 'Formato inválido.' }
  if (campaign && !isUuid(campaign)) return { error: 'Campanha inválida.' }
  let period: Period
  if (preset === 'custom') period = { from: str(fd, 'from'), to: str(fd, 'to') }
  else if (isIsoDate(ref)) period = preset === 'mes' ? monthOf(ref) : weekOf(ref)
  else return { error: 'Informe a data de referência.' }
  const bad = validatePeriod(period)
  if (bad) return { error: bad }
  const r = await generate({ userId: g.user.id, brandId, branchId: branchId || null, type, period, filters: { ...(format ? { format } : {}), ...(campaign ? { campaignId: campaign } : {}) } })
  if (!r.ok) return { error: r.error }
  await audit('relatorio_gerado', { userId: g.user.id, ip: await clientIp(), target: r.id, meta: { tipo: type, inicio: period.from, fim: period.to } })
  revalidatePath('/resultados/relatorios')
  redirect(`/resultados/relatorios/${r.id}`)
}

// Regenerar = mesmos parâmetros, retrato novo (no mesmo dia substitui; em outro dia cria outra linha no histórico).
export async function regenerateReportAction(id: string): Promise<{ ok: false; error: string } | never> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id) || !(await rowAllowed(g.user, 'reports', id))) return { ok: false, error: 'Relatório não encontrado.' }
  const r = (await pool.query(`select brand_id, branch_id, type, period_start::text as ps, period_end::text as pe, filters from reports where id = $1`, [id])).rows[0]
  const out = await generate({ userId: g.user.id, brandId: r.brand_id, branchId: r.branch_id, type: r.type, period: { from: r.ps, to: r.pe }, filters: r.filters })
  if (!out.ok) return { ok: false, error: out.error }
  await audit('relatorio_gerado', { userId: g.user.id, ip: await clientIp(), target: out.id, meta: { regenerado: id } })
  revalidatePath('/resultados/relatorios')
  redirect(`/resultados/relatorios/${out.id}`)
}
