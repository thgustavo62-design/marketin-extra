import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getCampaigns, listLinks } from '@/lib/data'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { LinkForm } from './link-form'
import { LinkList } from './link-list'

export default async function Links({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const status = sp.ver === 'arquivados' ? 'arquivado' : undefined
  const [rows, campaigns] = await Promise.all([listLinks({ brand: scope.brand?.slug, branchId: scope.branch?.id, status }), getCampaigns()])
  const canEdit = canWrite(user.role)

  return (
    <>
      <header className="page-head">
        <h1>Links e QR Codes</h1>
        <p>
          {scopeLabel(scope)} · {rows.length} {rows.length === 1 ? 'link' : 'links'}. Monte o link com UTM, confira o destino e libere o QR Code só depois da aprovação de outra pessoa.
          O sistema <b>não mede cliques</b> nem atribui vendas: para ver visitas, use o analytics do site de destino filtrando pelos parâmetros UTM.
        </p>
      </header>
      <nav className="tabs" aria-label="Situação">
        <Link href="/gestao/links" className={`tab${status ? '' : ' active'}`}>Ativos</Link>
        <Link href="/gestao/links?ver=arquivados" className={`tab${status ? ' active' : ''}`}>Arquivados</Link>
        <a href="/api/export/links" className="tab">Baixar CSV</a>
      </nav>
      {canEdit && (
        <LinkForm
          brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
          branches={scope.branches.filter((b) => b.active).map((b) => ({ id: b.id, brand_id: b.brand_id, name: b.name }))}
          campaigns={campaigns.filter((c) => scope.brands.some((b) => b.id === c.brand_id)).map((c) => ({ id: c.id, brand_id: c.brand_id, name: c.name }))}
          defaultBrandId={scope.brand?.id}
        />
      )}
      <LinkList rows={rows} canEdit={canEdit} userId={user.id} role={user.role} />
    </>
  )
}
