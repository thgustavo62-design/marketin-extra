import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getBranches, getCampaigns } from '@/lib/data'
import { isIsoDate } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope } from '@/lib/scope'
import { PostForm } from '../post-form'

export default async function NovoConteudo({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const user = await requireUser()
  if (!canWrite(user.role)) redirect('/?sem-permissao=1')
  const sp = await searchParams
  const scope = await getScope()
  const brands = scope.brands
  const [branches, campaigns] = await Promise.all([getBranches(), getCampaigns()])
  return (
    <>
      <header className="page-head"><h1>Novo conteúdo</h1></header>
      <PostForm
        brands={brands}
        branches={branches}
        campaigns={campaigns}
        defaults={{ brand_id: scope.brand?.id, branch_id: scope.branch?.id, post_date: isIsoDate(sp.data) ? sp.data : undefined }}
      />
    </>
  )
}
