// Contas externas (Windsor) → filial. Puro e testável.
// Regra: associação manual vence; senão reconhece pelo NOME da conta usando os apelidos de cada filial;
// senão a conta fica "sem filial" e aparece sinalizada (só em "Todas as unidades").
export type AccountKind = 'instagram' | 'ads'

export type Mapping = { account_name: string; kind: AccountKind; brand_id: string | null; branch_id: string | null }
export type BrandAliases = { id: string; name?: string; aliases: string[] }
export type ScopeIds = { brandId?: string; branchId?: string }

export type Resolved = { brandId: string; branchId: string | null; source: 'manual' | 'auto' }

// minúsculas, sem acento; "squash" tira tudo que não é letra/número (pega "farmaefarmabg").
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const squash = (s: string) => plain(s).replace(/[^a-z0-9]/g, '')

// Devolve a filial cujo apelido aparece no nome da conta; ambíguo (duas filiais) ou nenhum → null.
export function identifyBrand(accountName: string, brands: BrandAliases[]): string | null {
  const name = squash(accountName)
  if (!name) return null
  const hits = brands.filter((b) => b.aliases.some((a) => squash(a).length >= 4 && name.includes(squash(a))))
  return hits.length === 1 ? hits[0].id : null
}

export function resolveAccount(account: string, kind: AccountKind, maps: Mapping[], brands: BrandAliases[]): Resolved | null {
  const m = maps.find((x) => x.account_name === account && x.kind === kind)
  if (m?.brand_id) return { brandId: m.brand_id, branchId: m.branch_id, source: 'manual' }
  const auto = identifyBrand(account, brands)
  return auto ? { brandId: auto, branchId: null, source: 'auto' } : null
}

// 'in'  → a conta entra no recorte atual;
// 'out' → pertence a outra filial/unidade;
// 'unmapped' → não foi possível identificar (só aparece sem filtro, sempre sinalizada).
export function accountInScope(account: string, kind: AccountKind, maps: Mapping[], brands: BrandAliases[], scope: ScopeIds): 'in' | 'out' | 'unmapped' {
  const r = resolveAccount(account, kind, maps, brands)
  if (!r) return scope.brandId ? 'out' : 'unmapped'
  if (scope.brandId && r.brandId !== scope.brandId) return 'out'
  // Conta da filial inteira (sem unidade) vale para qualquer unidade dela, como "Todas as unidades" nos conteúdos.
  if (scope.branchId && r.branchId && r.branchId !== scope.branchId) return 'out'
  return 'in'
}

// Texto do formulário ("minas farma, minasfarma") → lista de apelidos limpa. Cada apelido precisa de ao menos 4 letras/números.
export function normalizeAliases(text: string): { ok: true; list: string[] } | { ok: false; error: string } {
  const list = [...new Set(text.split(/[,\n;]/).map((a) => plain(a).replace(/\s+/g, ' ').trim()).filter(Boolean))]
  if (list.length === 0) return { ok: false, error: 'Informe pelo menos um apelido.' }
  if (list.length > 12) return { ok: false, error: 'No máximo 12 apelidos por filial.' }
  const short = list.find((a) => squash(a).length < 4)
  if (short) return { ok: false, error: `O apelido "${short}" é curto demais: use pelo menos 4 letras ou números, para não confundir contas.` }
  return { ok: true, list }
}

export function partitionByScope<T extends { account_name?: string }>(rows: T[], kind: AccountKind, maps: Mapping[], brands: BrandAliases[], scope: ScopeIds) {
  const kept: T[] = []
  const unmapped = new Set<string>()
  for (const r of rows) {
    const name = r.account_name ?? ''
    const s = accountInScope(name, kind, maps, brands, scope)
    if (s === 'in') kept.push(r)
    else if (s === 'unmapped') { kept.push(r); unmapped.add(name) }
  }
  return { rows: kept, unmapped: [...unmapped] }
}
