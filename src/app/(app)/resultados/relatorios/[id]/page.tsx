import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReportView } from '@/components/report-view'
import { requireUser } from '@/lib/auth'
import { getReport } from '@/lib/data'
import { REPORT_TYPES, formatBR } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { brandAllowed, canWrite } from '@/lib/perms'
import { snapshotToBlocks } from '@/lib/reports/blocks'
import { RegenerateButton } from './regenerate-button'

export const maxDuration = 60

export default async function RelatorioDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const r = await getReport(id)
  if (!r || !brandAllowed(user, r.brand_id)) notFound()
  const snap = r.snapshot

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Relatório {REPORT_TYPES[r.type].toLowerCase()}</h1>
          <p>
            {r.brand_name}{r.branch_name ? ` · ${r.branch_name}` : ''} · {formatBR(r.period_start)} a {formatBR(r.period_end)}.{' '}
            <b>Retrato de {new Date(snap.meta.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</b>
            {r.generated_by_name ? ` por ${r.generated_by_name}` : ''}; os números não mudam depois de gerado.
          </p>
          <p><Link href="/resultados/relatorios" className="inline-link">← Histórico</Link></p>
        </div>
        <div className="head-tools">
          <a className="btn primary-link" href={`/api/relatorios/${r.id}/pdf`}>Baixar PDF</a>
          <a className="btn" href={`/api/relatorios/${r.id}/csv`}>Baixar CSV</a>
          {canWrite(user.role) && <RegenerateButton id={r.id} />}
        </div>
      </header>
      <ReportView blocks={snapshotToBlocks(snap)} />
    </>
  )
}
