import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { getPresentation } from '@/lib/presentations'
import { PresentationViewer } from './viewer'

export default async function Apresentacao({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ apresentar?: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const { apresentar } = await searchParams
  if (!isUuid(id)) notFound()
  const p = await getPresentation(id, user)
  if (!p) notFound()
  return (
    <>
      <p className="muted"><Link href="/resultados/apresentacoes">← Apresentações</Link></p>
      <PresentationViewer id={p.id} title={p.title} kind={p.kind} chunks={p.chunk_count} fileName={p.file_name} autoStart={apresentar === '1'} />
      {p.description && <p className="muted" style={{ marginTop: 10 }}>{p.description}</p>}
    </>
  )
}
