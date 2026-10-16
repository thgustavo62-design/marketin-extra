import { requireUser } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { listLibrary } from '@/lib/promo/library'
import { PromoTabs } from '../promo-tabs'
import { LibraryManager } from './library-manager'

export default async function BibliotecaImagens() {
  const user = await requireUser()
  const items = await listLibrary()
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Biblioteca de imagens</h1>
        <p>Guarde aqui os ícones, logos, selos, fundos e fotos que você usa nas criações. Nas promoções, a aba &quot;Biblioteca&quot; do editor coloca a imagem na peça (como elemento ou como fundo) com um clique. Excluir daqui não altera peças que já usaram a imagem.</p>
      </header>
      <LibraryManager items={items} canEdit={canWrite(user.role)} />
    </>
  )
}
