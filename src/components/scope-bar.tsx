'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useOptimistic } from 'react'
import { setScopeAction } from '@/app/(app)/scope-actions'

type B = { id: string; slug: string; name: string }
type Br = { id: string; brand_id: string; name: string; active: boolean }

// Seletor global: Rede › Filial. Vale para as listas e relatórios do sistema.
// Mostra a escolha na hora (otimista) enquanto o servidor grava e recarrega a página.
export function ScopeBar({ brands, branches, brandSlug, branchId }: { brands: B[]; branches: Br[]; brandSlug: string; branchId: string }) {
  const router = useRouter()
  const [cur, setCur] = useOptimistic({ brandSlug, branchId })
  const brand = brands.find((b) => b.slug === cur.brandSlug)
  const mine = brand ? branches.filter((x) => x.brand_id === brand.id && x.active) : []

  const apply = (slug: string, branch: string) =>
    startTransition(async () => {
      setCur({ brandSlug: slug, branchId: branch })
      await setScopeAction(slug, branch)
      router.refresh()
    })

  return (
    <div className="scope">
      <span className="scope-label">Visualizando</span>
      <select aria-label="Filial" value={cur.brandSlug} onChange={(e) => apply(e.target.value, '')}>
        <option value="">Todas as filiais</option>
        {brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
      </select>
      {/* Unidades (lojas) são opcionais: o seletor só aparece quando a filial escolhida tem alguma cadastrada. */}
      {mine.length > 0 && (
        <select aria-label="Unidade" value={cur.branchId} onChange={(e) => apply(cur.brandSlug, e.target.value)}>
          <option value="">Todas as unidades</option>
          {mine.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
    </div>
  )
}
