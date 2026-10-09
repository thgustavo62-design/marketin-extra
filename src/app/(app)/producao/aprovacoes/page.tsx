import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { listPendingApprovals } from '@/lib/data'
import { FORMATS, PRIORITIES, formatBR } from '@/lib/domain'
import { getScope, scopeLabel } from '@/lib/scope'

export default async function Aprovacoes() {
  const user = await requireUser()
  const scope = await getScope()
  const items = await listPendingApprovals({ brand: scope.brand?.slug, branchId: scope.branch?.id })
  const mine = (i: { reviewer_id: string | null }) => user.role === 'admin' || i.reviewer_id === user.id

  return (
    <>
      <header className="page-head">
        <h1>Aprovações</h1>
        <p>
          {scopeLabel(scope)} · {items.length} {items.length === 1 ? 'conteúdo aguardando' : 'conteúdos aguardando'} decisão. Quem decide é o revisor indicado no cartão ou um administrador; quem enviou não aprova o próprio envio (exceto administrador).
        </p>
      </header>
      {items.length === 0 ? (
        <p className="empty">Nada aguardando aprovação neste recorte.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Conteúdo</th><th>Filial</th><th>Formato</th><th>Publicação</th><th>Prioridade</th><th>Versão</th><th>Enviado por</th><th>Revisor</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.approval_id}>
                  <td><b>{i.title}</b>{i.assets > 0 && <small className="muted"> · {i.assets} anexo{i.assets > 1 ? 's' : ''}</small>}</td>
                  <td>{i.brand_name}{i.branch_name ? ` · ${i.branch_name}` : ''}</td>
                  <td>{FORMATS[i.format]}</td>
                  <td>{formatBR(i.post_date)}</td>
                  <td>{PRIORITIES[i.priority]}</td>
                  <td>v{i.version_number}</td>
                  <td>{i.submitted_by_name ?? '—'}</td>
                  <td>{i.reviewer_name ?? <span className="muted">só administrador</span>}</td>
                  <td><Link className="btn" href={`/producao?abrir=${i.post_id}`}>{mine(i) ? 'Revisar' : 'Ver'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
