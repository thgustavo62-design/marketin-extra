import Link from 'next/link'
import { FileText, Presentation as PresentationIcon } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { listPresentations } from '@/lib/presentations'
import { getScope, scopeLabel } from '@/lib/scope'
import { DeleteButton } from './row-actions'
import { UploadForm } from './upload-form'

const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default async function Apresentacoes() {
  const user = await requireUser()
  const scope = await getScope()
  const rows = await listPresentations(user, scope.brand?.id)
  const canEdit = canWrite(user.role)

  return (
    <>
      <header className="page-head">
        <h1>Apresentações</h1>
        <p>{scopeLabel(scope)} · guarde aqui as apresentações (PPTX ou PDF) e apresente direto do sistema, em tela cheia, sem abrir o PowerPoint.</p>
      </header>

      {canEdit && (
        <details className="card new-request" open={rows.length === 0}>
          <summary>Enviar apresentação</summary>
          <UploadForm brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))} defaultBrandId={scope.brand?.id} />
        </details>
      )}

      <section aria-labelledby="ap-list">
        <h2 id="ap-list" className="eyebrow">Biblioteca</h2>
        {rows.length === 0 ? <p className="empty">Nenhuma apresentação neste recorte.</p> : (
          <div className="pres-grid">
            {rows.map((p) => (
              <article key={p.id} className="card pres-card" data-id={p.id}>
                <div className="pres-card-icon" aria-hidden="true">{p.kind === 'pdf' ? <FileText size={22} /> : <PresentationIcon size={22} />}</div>
                <div className="pres-card-body">
                  <h3><Link href={`/resultados/apresentacoes/${p.id}`}>{p.title}</Link></h3>
                  <p className="muted">
                    <span className="badge">{p.kind.toUpperCase()}</span>
                    <span className="badge">{p.brand_name ?? 'Geral'}</span> {mb(p.size_bytes)} · {new Date(p.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{p.created_by_name ? ` · ${p.created_by_name}` : ''}
                  </p>
                  {p.description && <p>{p.description}</p>}
                  <div className="row-actions">
                    <Link className="mini-btn primary" href={`/resultados/apresentacoes/${p.id}?apresentar=1`}>Apresentar</Link>{' '}
                    <Link className="mini-btn" href={`/resultados/apresentacoes/${p.id}`}>Abrir</Link>{' '}
                    {canEdit && <DeleteButton id={p.id} title={p.title} />}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
