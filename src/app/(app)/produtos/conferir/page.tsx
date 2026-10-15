import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { listPending, listReview } from '@/lib/catalog/store'
import { canWrite } from '@/lib/perms'
import { Review } from './review'

export default async function Conferir() {
  const user = await requireUser()
  const [pending, similar] = await Promise.all([listPending(60), listReview(60)])
  return (
    <>
      <header className="page-head">
        <h1>Conferir imagens</h1>
        <p><Link href="/produtos">← Catálogo</Link> · Mostra até 60 por vez; ao resolver, as próximas aparecem.</p>
      </header>
      <Review pending={pending} similar={similar} canEdit={canWrite(user.role)} />
    </>
  )
}
