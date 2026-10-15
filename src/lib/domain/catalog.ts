// Catálogo de produtos: regras puras para casar nome de arquivo/imagem com a descrição do ERP, ler a planilha do ERP e validar EAN.
// Sem banco e sem rede (testável com `npm test`). Importações com extensão .ts para poder rodar também em scripts do Node.

const strip = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '')

// ---------- EAN / GTIN ----------
/** GTIN (8, 12, 13 ou 14 dígitos) com dígito verificador correto. Código interno do ERP (curto, sem verificador) não vale como EAN. */
export function isValidGtin(s: string): boolean {
  if (!/^\d+$/.test(s) || ![8, 12, 13, 14].includes(s.length)) return false
  const d = s.split('').map(Number)
  const check = d.pop()!
  const sum = d.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** Lê um EAN vindo de planilha (número, texto com espaços, notação científica perdida) e devolve só se for um GTIN válido. */
export function parseEan(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().replace(/\.0+$/, '').replace(/\s+/g, '')
  return isValidGtin(s) ? s : null
}

// ---------- normalização de nomes ----------
// Abreviações que o ERP e quem recorta imagem escrevem de jeitos diferentes.
const SYN: Record<string, string> = {
  UND: '', UNID: '', UNIDS: '', UNIDADE: '', UNIDADES: '', UN: '', UNI: '', FR: '', FRASCO: '', FRS: '', CX: '', CAIXA: '', PCT: '', PACOTE: '',
  GR: 'G', GRS: 'G', GRAMAS: 'G', GRAMA: 'G', MLS: 'ML', LT: 'L', LTS: 'L',
  CPR: 'CPR', COMP: 'CPR', COMPR: 'CPR', CP: 'CPR', COMPRIMIDO: 'CPR', COMPRIMIDOS: 'CPR',
  CPS: 'CAP', CAPS: 'CAP', CAPSULA: 'CAP', CAPSULAS: 'CAP',
  CR: 'CREME', CREME: 'CREME', SH: 'SH', SHAMPOO: 'SH', COND: 'COND', CONDICIONADOR: 'COND',
  SAB: 'SAB', SABONETE: 'SAB', DES: 'DES', DESOD: 'DES', DESODORANTE: 'DES', HID: 'HID', HIDRAT: 'HID', HIDRATANTE: 'HID',
  ABS: 'ABS', ABSORVENTE: 'ABS', ESC: 'ESC', ESCOVA: 'ESC', LIQ: 'LIQ', LIQUIDO: 'LIQ', ENV: 'ENV', ENVELOPE: 'ENV', ENVELOPES: 'ENV',
  XPE: 'XPE', XAROPE: 'XPE', SUSP: 'SUSP', SUSPENSAO: 'SUSP', GTS: 'GTS', GOTAS: 'GTS', SOL: 'SOL', SOLUCAO: 'SOL', LOC: 'LOC', LOCAO: 'LOC',
  PO: 'PO', PÓ: 'PO', SAC: 'SAC', SACHE: 'SAC', SACHES: 'SAC', TRAT: 'TRAT', TRATAMENTO: 'TRAT', FRALDA: 'FRALDA', FRALDAS: 'FRALDA',
}
// Palavras de ligação: pouco valor para distinguir um produto de outro.
const STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COM', 'C', 'P', 'PARA', 'EM', 'A', 'O', 'S', 'SABORES', 'FRAGRANCIAS', 'FRAGRANCIA', 'DIVERSOS', 'DIVERSAS'])

/** Descrição "limpa" e comparável: maiúscula, sem acento nem pontuação, unidades e abreviações unificadas. */
export function normalizeName(input: string): string {
  let s = strip(input).toUpperCase()
  s = s.replace(/C\s*\/\s*(\d)/g, 'C$1') // "C/20" → "C20"
  s = s.replace(/(\d),(\d)/g, '$1$2') // 0,5 → 05 (mesma marca em qualquer escrita)
  s = s.replace(/[^A-Z0-9+]+/g, ' ').replace(/\+/g, ' + ')
  s = s.replace(/\bC (\d+)\b/g, 'C$1').replace(/(?<![A-Z\d])(\d+) (ML|G|GR|GRS|MG|KG|L|MCG|UI|CAP|CAPS|CPS|CPR|COMP|COMPR|ENV|SAC|UND|UN)\b/g, '$1$2')
  const out: string[] = []
  for (const t of s.split(/\s+/).filter(Boolean)) {
    const m = /^(\d+)([A-Z]+)$/.exec(t) // 500GR → 500G, 20CAPS → 20CAP, 6UND → 6
    const w = m && m[2] in SYN ? m[1] + SYN[m[2]] : (t in SYN ? SYN[t] : t)
    if (w) out.push(w)
  }
  return out.join(' ')
}

/** Palavras que identificam o produto (sem ligação): é com elas que se compara. */
export function nameTokens(input: string): string[] {
  return normalizeName(input).split(' ').filter((t) => t.length > 0 && t !== '+' && !STOP.has(t))
}

/** Tokens que carregam quantidade (150ML, C20, 500MG, 1KG): dois produtos com quantidades diferentes NÃO são o mesmo produto. */
const isQty = (t: string) => /\d/.test(t)

// ---------- nome vindo de arquivo de imagem ----------
const JUNK = /^(as|asd|asdf\w*|teste|test|img|image|imagem|foto|sem nome|untitled|novo|new|design)\b/i
export function nameFromFile(file: string): { name: string | null; reason?: string } {
  let n = file.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,5}$/i, '')
  n = n.replace(/[_]+/g, ' ').replace(/\s*\((\d+)\)\s*$/, '').replace(/\s*-\s*c[oó]pia\s*$/i, '').replace(/\s+/g, ' ').trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n) || /^[0-9a-f]{20,}$/i.test(n)) return { name: null, reason: 'nome do arquivo é um código aleatório' }
  if (n.length < 4 || JUNK.test(n) || !/[a-z]{3}/i.test(strip(n))) return { name: null, reason: 'nome do arquivo não descreve um produto' }
  // restos de digitação colados no fim ("1KGasd")
  n = n.replace(/(\d(?:KG|G|ML|MG|L))(asd+f*)$/i, '$1')
  return { name: n }
}

// ---------- casamento por similaridade ----------
export type ProductLite = { id: string; description: string }
type Entry = { id: string; description: string; tokens: string[]; key: string }
export type NameIndex = { entries: Entry[]; postings: Map<string, number[]>; df: Map<string, number>; byKey: Map<string, number[]> }

export function buildIndex(products: ProductLite[]): NameIndex {
  const entries: Entry[] = products.map((p) => ({ id: p.id, description: p.description, tokens: nameTokens(p.description), key: normalizeName(p.description) }))
  const postings = new Map<string, number[]>(), df = new Map<string, number>(), byKey = new Map<string, number[]>()
  entries.forEach((e, i) => {
    for (const t of new Set(e.tokens)) { df.set(t, (df.get(t) ?? 0) + 1); const l = postings.get(t); if (l) l.push(i); else postings.set(t, [i]) }
    const k = byKey.get(e.key); if (k) k.push(i); else byKey.set(e.key, [i])
  })
  return { entries, postings, df, byKey }
}

const weight = (idx: NameIndex, t: string) => (isQty(t) ? 1.6 : 1) * Math.log(1 + idx.entries.length / (idx.df.get(t) ?? 1))

export type Candidate = { id: string; description: string; score: number }
export type MatchResult = {
  decision: 'exata' | 'similar' | 'incerto' | 'nenhum'
  best: Candidate | null
  candidates: Candidate[]
}

/**
 * Casa um nome (de arquivo, por exemplo) com a descrição do ERP.
 *  exata   — mesma descrição depois de normalizar, e só um produto: liga sozinha;
 *  similar — muito parecida, mesmas quantidades e sem concorrente próximo: liga e fica marcada para conferir;
 *  incerto — há candidatos plausíveis, mas uma pessoa decide;
 *  nenhum  — nada parecido.
 */
export function matchName(idx: NameIndex, name: string, opts: { top?: number } = {}): MatchResult {
  const top = opts.top ?? 5
  const key = normalizeName(name)
  const exact = idx.byKey.get(key)
  if (exact && key) {
    const cands = exact.map((i) => ({ id: idx.entries[i].id, description: idx.entries[i].description, score: 1 }))
    return { decision: exact.length === 1 ? 'exata' : 'incerto', best: cands[0], candidates: cands.slice(0, top) }
  }
  const q = nameTokens(name)
  if (q.length === 0) return { decision: 'nenhum', best: null, candidates: [] }
  // candidatos: quem divide algum dos tokens mais raros do nome
  const rare = [...new Set(q)].filter((t) => idx.postings.has(t)).sort((a, b) => (idx.df.get(a) ?? 0) - (idx.df.get(b) ?? 0)).slice(0, 4)
  const pool = new Set<number>()
  for (const t of rare) for (const i of (idx.postings.get(t) ?? []).slice(0, 3000)) pool.add(i)
  const qset = new Set(q), qw = q.reduce((a, t) => a + weight(idx, t), 0)
  const qQty = q.filter(isQty).sort().join(',')
  const scored: (Candidate & { qtyOk: boolean; subset: boolean })[] = []
  for (const i of pool) {
    const e = idx.entries[i]
    const eset = new Set(e.tokens)
    let common = 0
    for (const t of qset) if (eset.has(t)) common += weight(idx, t)
    const ew = [...eset].reduce((a, t) => a + weight(idx, t), 0)
    const dice = (2 * common) / (qw + ew)
    const eQty = e.tokens.filter(isQty).sort().join(',')
    const qtyOk = qQty === eQty
    // um nome contido no outro (a imagem diz "COND SEDA 250ML", o ERP "COND SEDA 250ML TOQUE DE SEDA") é variação de escrita; nomes que se contradizem (spray × gel) não
    const subset = [...qset].every((t) => eset.has(t)) || [...eset].every((t) => qset.has(t))
    // quantidades diferentes (200ML × 400ML) derrubam a nota: não é o mesmo produto
    scored.push({ id: e.id, description: e.description, score: Math.round((qtyOk ? dice : dice * 0.7) * 1000) / 1000, qtyOk, subset })
  }
  scored.sort((a, b) => b.score - a.score)
  const cands = scored.slice(0, top).map(({ id, description, score }) => ({ id, description, score }))
  if (!scored.length) return { decision: 'nenhum', best: null, candidates: [] }
  const [a, b] = scored
  if (a.score >= 0.88 && a.qtyOk && a.subset && (!b || a.score - b.score >= 0.06)) return { decision: 'similar', best: cands[0], candidates: cands }
  if (a.score >= 0.55) return { decision: 'incerto', best: cands[0], candidates: cands }
  return { decision: 'nenhum', best: null, candidates: cands.filter((c) => c.score >= 0.4) }
}

// ---------- planilha do ERP ----------
export type ErpColumns = { ean: number | null; desc: number | null; code: number | null; group: number | null; ingredient: number | null; ms: number | null }
const hdr = (s: unknown) => strip(String(s ?? '')).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Descobre as colunas pelo nome do cabeçalho ("Barras", "Descrição", "Código", "Nome Grupo", "Princípio Ativo", "Registro MS"). */
export function detectErpColumns(headerRow: unknown[]): ErpColumns {
  const find = (re: RegExp) => { const i = headerRow.findIndex((h) => re.test(hdr(h))); return i < 0 ? null : i }
  return {
    ean: find(/^(barras|cod(igo)? de barras|ean|gtin|codigo barras)$/),
    desc: find(/^(descricao|produto|nome( do produto)?|descricao do produto)$/),
    code: find(/^(codigo|cod|codigo interno|cod interno|reduzido)$/),
    group: find(/^(nome grupo|grupo|categoria|departamento)$/),
    ingredient: find(/^(principio ativo|substancia)$/),
    ms: find(/^(registro ms|registro|anvisa)$/),
  }
}

/** Texto de busca do produto: descrição + EAN + laboratório + princípio ativo, sem acento e em minúsculas. */
export function searchKey(...parts: (string | null | undefined)[]): string {
  return strip(parts.filter(Boolean).join(' ')).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Termos digitados na busca: sem acento, minúsculos; todos precisam aparecer. */
export function searchTerms(q: string): string[] {
  return strip(q).toLowerCase().split(/\s+/).filter((t) => t.length > 0).slice(0, 8)
}
