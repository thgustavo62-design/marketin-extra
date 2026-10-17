import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { getCampaign, listThemes } from '@/lib/promo/store'
import { PromoStudio } from '@/app/(app)/promocoes/[id]/promo-studio'

export default async function Design({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const [data, themes] = await Promise.all([getCampaign(id), listThemes()])
  if (!data) notFound()
  if (data.campaign.kind === 'template') notFound()
  if (data.campaign.kind !== 'design') redirect(`/promocoes/${id}`)
  return (
    <>
      <header className="page-head">
        <h1>{data.campaign.name}</h1>
        <p><Link href="/criacao">← Meus designs</Link> · arte livre: adicione texto, imagens e formas, use a biblioteca e os fundos, e baixe em PNG.</p>
      </header>
      <PromoStudio campaign={data.campaign} theme={null} themes={themes.map((t) => ({ id: t.id, name: t.name }))} items={[]} canEdit={canWrite(user.role)} />
    </>
  )
}
