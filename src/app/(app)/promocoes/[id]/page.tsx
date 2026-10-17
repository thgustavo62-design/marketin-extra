import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getBrands } from '@/lib/data'
import { isUuid } from '@/lib/form'
import { brandAllowed, canWrite } from '@/lib/perms'
import { getCampaign, listThemes } from '@/lib/promo/store'
import { PromoStudio } from './promo-studio'

export default async function Promocao({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const brands = (await getBrands()).filter((b) => brandAllowed(user, b.id))
  if (!isUuid(id)) notFound()
  const [data, themes] = await Promise.all([getCampaign(id), listThemes()])
  if (!data) notFound()
  if (data.campaign.kind === 'template') notFound()
  if (data.campaign.kind === 'design') redirect(`/criacao/${id}`)
  const { campaign, theme, items } = data
  return (
    <>
      <header className="page-head">
        <h1>{campaign.name}</h1>
        <p><Link href="/promocoes">← Promoções</Link> · {items.length} encarte(s) · o sistema monta as peças de story, feed e A4 sozinho a partir da planilha; ajuste o que precisar e aprove.</p>
      </header>
      <PromoStudio brands={brands.map((b) => ({ id: b.id, name: b.name }))} campaign={campaign} theme={theme} themes={themes.map((t) => ({ id: t.id, name: t.name }))} items={items} canEdit={canWrite(user.role)} />
    </>
  )
}
