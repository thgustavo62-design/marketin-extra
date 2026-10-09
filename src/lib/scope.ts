import { cookies } from 'next/headers'
import { cache } from 'react'
import { getBranches, getBrands, type Branch, type Brand } from './data'
import { isUuid } from './form'

export const SCOPE_COOKIE = 'extra_scope'

// Escopo global de visualização: rede (e filial dentro dela). Não é segurança, só filtro de tela.
export type Scope = { brand: Brand | null; branch: Branch | null; brands: Brand[]; branches: Branch[] }

export const getScope = cache(async (): Promise<Scope> => {
  const [brands, branches] = await Promise.all([getBrands(), getBranches()])
  const raw = (await cookies()).get(SCOPE_COOKIE)?.value ?? ''
  const [slug, branchId] = raw.split('|')
  const brand = brands.find((b) => b.slug === slug) ?? null
  const branch = brand && isUuid(branchId) ? branches.find((x) => x.id === branchId && x.brand_id === brand.id) ?? null : null
  return { brand, branch, brands, branches }
})

export const scopeLabel = (s: Scope): string =>
  s.branch ? `${s.brand?.name} · ${s.branch.name}` : s.brand ? `${s.brand.name} · todas as filiais` : 'Todas as redes'
