import { requireUser } from '@/lib/auth'
import { getBranches, getBrands, getCampaigns } from '@/lib/data'
import { isIsoDate } from '@/lib/domain'
import { PostForm } from '../post-form'

export default async function NovoConteudo({ searchParams }: { searchParams: Promise<{ data?: string; rede?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const [brands, branches, campaigns] = await Promise.all([getBrands(), getBranches(), getCampaigns()])
  const brand = brands.find((b) => b.slug === sp.rede)
  return (
    <>
      <header className="page-head"><h1>Novo conteúdo</h1></header>
      <PostForm
        brands={brands}
        branches={branches}
        campaigns={campaigns}
        defaults={{ brand_id: brand?.id, post_date: isIsoDate(sp.data) ? sp.data : undefined }}
      />
    </>
  )
}
