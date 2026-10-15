import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { ProductForm } from '../product-form'

export default async function NovoProduto() {
  const user = await requireUser()
  if (!canWrite(user.role)) return <p className="empty">Seu perfil é somente leitura.</p>
  return (
    <>
      <header className="page-head"><h1>Novo produto</h1><p>Para produto que ainda não está no ERP. <Link href="/produtos">Voltar ao catálogo</Link></p></header>
      <section className="card"><ProductForm canEdit /></section>
    </>
  )
}
