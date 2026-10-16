import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { getCampaign, listThemes } from '@/lib/promo/store'
import { PromoStudio } from './promo-studio'

export default async function Promocao({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const [data, themes] = await Promise.all([getCampaign(id), listThemes()])
  if (!data) notFound()
  const { campaign, theme, items } = data
  return (
    <>
      <header className="page-head">
        <h1>{campaign.name}</h1>
        <p><Link href="/promocoes">← Promoções</Link> · {items.length} produto(s) · o sistema monta as peças de feed, story e A4 sozinho a partir da planilha.</p>
      </header>
      <PromoStudio campaign={campaign} theme={theme} themes={themes.map((t) => ({ id: t.id, name: t.name }))} items={items} canEdit={canWrite(user.role)} />
    </>
  )
}
