import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { getScope } from '@/lib/scope'
import { Importer } from './importer'

export default async function ImportarProdutos() {
  const user = await requireUser()
  if (!canWrite(user.role)) return <p className="empty">Seu perfil é somente leitura.</p>
  const scope = await getScope()
  if (!scope.brand) return <section className="card"><h1>Importar produtos e imagens</h1><p>Selecione uma empresa no cabeçalho para definir o catálogo de destino.</p></section>
  return (
    <>
      <header className="page-head">
        <h1>Importar produtos e imagens</h1>
        <p><Link href="/produtos">← Catálogo</Link> · Primeiro o cadastro do ERP, depois as imagens: assim cada imagem encontra o produto certo.</p>
      </header>
      <p className="notice info" role="status">Destino da importação: <strong>{scope.brand.name}</strong>{scope.branch ? ` · ${scope.branch.name}` : ' · catálogo da empresa'}. Os arquivos ficam isolados das demais empresas.</p>
      <Importer key={`${scope.brand.id}:${scope.branch?.id ?? ''}`} companyId={scope.brand.id} companyName={scope.brand.name} />
    </>
  )
}
