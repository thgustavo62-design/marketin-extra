// Mapeamento das contas externas (Windsor) para rede/filial. Puro e testável.
export type AccountKind = 'instagram' | 'ads'

export type Mapping = { account_name: string; kind: AccountKind; brand_id: string | null; branch_id: string | null }

export type ScopeIds = { brandId?: string; branchId?: string }

// 'in'  → a conta entra no recorte atual;
// 'out' → pertence a outra rede/filial;
// 'unmapped' → ainda não foi associada a nenhuma rede (só aparece sem filtro, sempre sinalizada).
export function accountInScope(account: string, kind: AccountKind, maps: Mapping[], scope: ScopeIds): 'in' | 'out' | 'unmapped' {
  const m = maps.find((x) => x.account_name === account && x.kind === kind)
  if (!m || !m.brand_id) return scope.brandId ? 'out' : 'unmapped'
  if (scope.brandId && m.brand_id !== scope.brandId) return 'out'
  // Conta da rede inteira (sem filial) vale para qualquer filial dela, como "Todas as unidades" nos conteúdos.
  if (scope.branchId && m.branch_id && m.branch_id !== scope.branchId) return 'out'
  return 'in'
}

export function partitionByScope<T extends { account_name?: string }>(rows: T[], kind: AccountKind, maps: Mapping[], scope: ScopeIds) {
  const kept: T[] = []
  const unmapped = new Set<string>()
  for (const r of rows) {
    const name = r.account_name ?? ''
    const s = accountInScope(name, kind, maps, scope)
    if (s === 'in') kept.push(r)
    else if (s === 'unmapped') { kept.push(r); unmapped.add(name) }
  }
  return { rows: kept, unmapped: [...unmapped] }
}
