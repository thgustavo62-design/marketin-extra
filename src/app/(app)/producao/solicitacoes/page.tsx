import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { listRequests } from '@/lib/data'
import { REQUEST_STATUS, isRequestStatus } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { NewRequest } from './new-request'
import { RequestList } from './request-list'

export default async function Solicitacoes({ searchParams }: { searchParams: Promise<{ situacao?: string; todas?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const status = isRequestStatus(sp.situacao) ? sp.situacao : undefined
  const rows = await listRequests({ brand: scope.brand?.slug, branchId: scope.branch?.id, status, onlyOpen: !status && sp.todas !== '1' })
  const canEdit = canWrite(user.role)
  const chip = (href: string, label: string, active: boolean) => <Link href={href} className={`tab${active ? ' active' : ''}`}>{label}</Link>

  return (
    <>
      <header className="page-head">
        <h1>Solicitações de peças</h1>
        <p>
          {scopeLabel(scope)} · {rows.length} {rows.length === 1 ? 'solicitação' : 'solicitações'}. Pedidos de oferta só viram conteúdo depois que preço e validade forem confirmados por uma pessoa: nada é reaproveitado de campanhas antigas.
        </p>
      </header>
      <nav className="tabs" aria-label="Situação">
        {chip('/producao/solicitacoes', 'Em aberto', !status && sp.todas !== '1')}
        {chip('/producao/solicitacoes?todas=1', 'Todas', !status && sp.todas === '1')}
        {Object.entries(REQUEST_STATUS).map(([k, v]) => <span key={k}>{chip(`/producao/solicitacoes?situacao=${k}`, v, status === k)}</span>)}
      </nav>
      {canEdit && (
        <NewRequest
          brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
          branches={scope.branches.filter((b) => b.active).map((b) => ({ id: b.id, brand_id: b.brand_id, name: b.name }))}
          defaultBrandId={scope.brand?.id}
        />
      )}
      <RequestList rows={rows} canEdit={canEdit} />
    </>
  )
}
