import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { Importer } from './importer'

export default async function ImportarProdutos() {
  const user = await requireUser()
  if (!canWrite(user.role)) return <p className="empty">Seu perfil é somente leitura.</p>
  return (
    <>
      <header className="page-head">
        <h1>Importar produtos e imagens</h1>
        <p><Link href="/produtos">← Catálogo</Link> · Primeiro o cadastro do ERP, depois as imagens: assim cada imagem encontra o produto certo.</p>
      </header>
      <Importer />
    </>
  )
}
