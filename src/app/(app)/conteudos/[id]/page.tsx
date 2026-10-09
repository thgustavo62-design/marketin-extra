import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConfirmButton } from '@/components/confirm-button'
import { requireUser } from '@/lib/auth'
import { getBranches, getBrands, getCampaigns, getPost } from '@/lib/data'
import { isUuid } from '@/lib/form'
import { deletePostAction } from '../actions'
import { PostForm } from '../post-form'

export default async function EditarConteudo({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const post = await getPost(id)
  if (!post) notFound()
  const sp = await searchParams
  const [brands, branches, campaigns] = await Promise.all([getBrands(), getBranches(), getCampaigns()])
  return (
    <>
      <header className="page-head">
        <Link href={`/calendario?m=${post.post_date.slice(0, 7)}`} className="back">← Calendário</Link>
        <h1>{post.title}</h1>
        {sp.salvo && <p className="form-ok" role="status">Salvo.</p>}
      </header>
      {/* key = revisão: após salvar, o formulário remonta com os dados novos */}
      <PostForm key={post.revision} brands={brands} branches={branches} campaigns={campaigns} post={post} />
      <form action={deletePostAction} className="danger-zone">
        <input type="hidden" name="id" value={post.id} />
        <ConfirmButton message="Excluir este conteúdo? Essa ação não pode ser desfeita.">Excluir conteúdo</ConfirmButton>
      </form>
    </>
  )
}
