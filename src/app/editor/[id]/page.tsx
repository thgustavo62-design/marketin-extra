import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { getCampaign, listThemes } from '@/lib/promo/store'
import { PromoStudio } from '@/app/(app)/promocoes/[id]/promo-studio'

export default async function EditorPromocao({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const [data, themes] = await Promise.all([getCampaign(id), listThemes()])
  if (!data) notFound()
  return (
    <>
      <header className="page-head" style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 20 }}>{data.campaign.name}</h1>
        <p><Link href="/editor">← Console</Link> · {data.items.length} encarte(s)</p>
      </header>
      <PromoStudio mode="tab" campaign={data.campaign} theme={data.theme} themes={themes.map((t) => ({ id: t.id, name: t.name }))} items={data.items} canEdit={canWrite(user.role)} />
    </>
  )
}
