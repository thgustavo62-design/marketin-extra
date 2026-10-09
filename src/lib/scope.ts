import { cookies } from 'next/headers'
import { cache } from 'react'
import { getBranches, getBrands, type Branch, type Brand } from './data'
import { isUuid } from './form'
import { getSession } from './session'

export const SCOPE_COOKIE = 'extra_scope'

// Escopo global de visualização: filial (Minas Farma / Farma e Farma) e, dentro dela, unidade (opcional).
// Para quem tem acesso restrito a certas filiais, `brands` já vem só com as permitidas e a filial nunca fica em "todas".
export type Scope = { brand: Brand | null; branch: Branch | null; brands: Brand[]; branches: Branch[]; restricted: boolean }

export const getScope = cache(async (): Promise<Scope> => {
  const [allBrands, allBranches, user] = await Promise.all([getBrands(), getBranches(), getSession()])
  const allowed = user?.brandIds ?? null
  const brands = allowed ? allBrands.filter((b) => allowed.includes(b.id)) : allBrands
  const branches = allBranches.filter((x) => brands.some((b) => b.id === x.brand_id))
  const raw = (await cookies()).get(SCOPE_COOKIE)?.value ?? ''
  const [slug, branchId] = raw.split('|')
  let brand = brands.find((b) => b.slug === slug) ?? null
  if (!brand && allowed) brand = brands[0] ?? null // restrito: nunca "todas as filiais"
  const branch = brand && isUuid(branchId) ? branches.find((x) => x.id === branchId && x.brand_id === brand!.id) ?? null : null
  return { brand, branch, brands, branches, restricted: Boolean(allowed) }
})

export const scopeLabel = (s: Scope): string =>
  s.branch ? `${s.brand?.name} · ${s.branch.name}` : s.brand ? `${s.brand.name} · todas as unidades` : 'Todas as filiais'
