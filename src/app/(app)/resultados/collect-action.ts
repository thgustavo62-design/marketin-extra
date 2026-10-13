'use server'

import { revalidatePath } from 'next/cache'
import { audit, writerOrError } from '@/lib/auth'
import { pool } from '@/lib/db'
import { todayISO } from '@/lib/domain'
import { collectMetrics } from '@/lib/publications/collect'
import { getScope } from '@/lib/scope'
import { clientIp } from '@/lib/session'

export type CollectOutcome =
  | { ok: true; publications: number; newPublications: number; accounts: number; unmapped: string[]; notes: string[] }
  | { ok: false; error: string }

// Coleta MANUAL do Windsor para o banco (Instagram + anúncios), usada pelo botão que aparece em Insights, Instagram, Meta Ads,
// Dashboard e Publicações vinculadas. Vale para a filial/unidade escolhida no topo (ou para todas as que a pessoa pode ver).
export async function collectAction(): Promise<CollectOutcome> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  const scope = await getScope()
  const brandIds = scope.brand ? [scope.brand.id] : scope.brands.map((b) => b.id)
  if (brandIds.length === 0) return { ok: false, error: 'Nenhuma filial disponível para coletar.' }
  const r = await collectMetrics({ brandIds, actorId: g.user.id, today: todayISO() })
  // Cada tentativa fica registrada (sem dados sensíveis); alimenta o alerta de falha na coleta.
  for (const id of brandIds) {
    await pool.query(
      `insert into integration_sync_runs (provider, job_type, brand_id, status, finished_at, records_processed, error_summary_safe, requested_by)
       values ('windsor', 'collect_metrics', $1, $2, now(), $3, $4, $5)`,
      [id, r.ok ? 'ok' : 'failed', r.ok ? r.publications : null, r.ok ? null : r.error.slice(0, 280), g.user.id])
  }
  if (!r.ok) return { ok: false, error: r.error }
  await audit('coleta_metricas', { userId: g.user.id, ip: await clientIp(), meta: { publicacoes: r.publications, novas: r.newPublications, contas: r.accounts, filiais: brandIds.length } })
  // Também limpa o cache de 5 min das telas lidas ao vivo (Insights, Instagram, Meta Ads) para mostrarem o número novo.
  revalidatePath('/resultados', 'layout'); revalidatePath('/')
  return { ok: true, publications: r.publications, newPublications: r.newPublications, accounts: r.accounts, unmapped: r.unmapped, notes: r.notes }
}
