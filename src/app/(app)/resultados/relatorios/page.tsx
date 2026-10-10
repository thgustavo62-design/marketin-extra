import { requireUser } from '@/lib/auth'
import { getCampaigns, listReports } from '@/lib/data'
import { REPORT_TYPES, formatBR, todayISO } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { ReportForm } from './report-form'

export const maxDuration = 60

export default async function Relatorios() {
  const user = await requireUser()
  const scope = await getScope()
  const allowed = user.role === 'admin' || user.brandIds === null ? null : user.brandIds
  const [rows, campaigns] = await Promise.all([listReports({ brandIds: allowed, brand: scope.brand?.slug, branchId: scope.branch?.id }), getCampaigns()])
  const canEdit = canWrite(user.role)

  return (
    <>
      <header className="page-head">
        <h1>Relatórios</h1>
        <p>{scopeLabel(scope)} · relatórios operacional, de resultados e executivo, em tela, PDF (A4) e CSV. Cada relatório guarda o retrato dos números na hora em que foi gerado; gerar de novo cria um retrato novo com a data.</p>
      </header>

      {canEdit && (
        <details className="card new-request" open>
          <summary>Gerar relatório</summary>
          <ReportForm
            brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
            branches={scope.branches.filter((b) => b.active).map((b) => ({ id: b.id, brand_id: b.brand_id, name: b.name }))}
            campaigns={campaigns.filter((c) => scope.brands.some((b) => b.id === c.brand_id)).map((c) => ({ id: c.id, brand_id: c.brand_id, name: c.name }))}
            defaultBrandId={scope.brand?.id} defaultBranchId={scope.branch?.id} today={todayISO()}
          />
        </details>
      )}

      <section aria-labelledby="hist">
        <h2 id="hist" className="eyebrow">Histórico</h2>
        {rows.length === 0 ? <p className="empty">Nenhum relatório gerado neste recorte.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Gerado em</th><th>Tipo</th><th>Filial</th><th>Período</th><th>Por</th><th>Arquivos</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.generated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{REPORT_TYPES[r.type]}</td>
                    <td>{r.brand_name}{r.branch_name ? ` · ${r.branch_name}` : ''}</td>
                    <td>{formatBR(r.period_start)} a {formatBR(r.period_end)}</td>
                    <td>{r.generated_by_name ?? '—'}</td>
                    <td className="row-actions">
                      <a className="mini-btn" href={`/resultados/relatorios/${r.id}`}>Abrir</a>{' '}
                      <a className="mini-btn" href={`/api/relatorios/${r.id}/pdf`}>PDF</a>{' '}
                      <a className="mini-btn" href={`/api/relatorios/${r.id}/csv`}>CSV</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
