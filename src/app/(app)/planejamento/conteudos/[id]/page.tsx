import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormatBadge, StageBadge } from '@/components/badges'
import { ConfirmButton } from '@/components/confirm-button'
import { requireUser } from '@/lib/auth'
import { getBranches, getBrands, getCampaigns, getPost } from '@/lib/data'
import { PILLARS, formatBR } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { deletePostAction } from '../actions'
import { PostForm } from '../post-form'

export default async function EditarConteudo({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const post = await getPost(id)
  if (!post) notFound()
  const sp = await searchParams
  const back = (
    <Link href={`/planejamento/calendario?m=${post.post_date.slice(0, 7)}`} className="back">← Calendário</Link>
  )

  // Perfil "Leitura": só visualiza.
  if (!canWrite(user.role)) {
    return (
      <>
        <header className="page-head">
          {back}
          <h1>{post.title}</h1>
          <p>{post.brand_name} · {post.branch_name ?? 'Todas as filiais'} · {formatBR(post.post_date)} · {PILLARS[post.pillar]}</p>
        </header>
        <div className="card narrow-lg">
          <p><FormatBadge format={post.format} /> <StageBadge stage={post.stage} /></p>
          <h3>Legenda</h3><p className="pre">{post.caption || '—'}</p>
          <h3>Roteiro</h3><p className="pre">{post.script || '—'}</p>
          <p className="muted">Seu perfil é somente leitura.</p>
        </div>
      </>
    )
  }

  const [brands, branches, campaigns] = await Promise.all([getBrands(), getBranches(), getCampaigns()])
  return (
    <>
      <header className="page-head">
        {back}
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
