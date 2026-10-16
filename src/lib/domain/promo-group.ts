// Política de encartes: produtos que só mudam de TAMANHO (fraldas) ou de FRAGRÂNCIA/SABOR entram num encarte só, com uma foto.
// Tudo puro e testado. O grupo só é formado quando o preço é o mesmo: preço diferente = encartes separados.

export type GroupInput = { ean: string; name: string; price: number; section: string | null }
export type SizeRow = { label: string; units: number | null; ean: string; name: string }
export type OptionMember = { ean: string; name: string; /** o que muda de um produto para o outro (fragrância, sabor, linha) */ variant: string }
export type Variants =
  | { kind: 'sizes'; rows: SizeRow[] }
  | { kind: 'options'; members: OptionMember[] }
export type Encarte = {
  name: string
  price: number
  section: string | null
  /** código de barras que representa o encarte (o primeiro do grupo; a foto pode vir de outro membro) */
  ean: string
  /** todos os códigos reunidos neste encarte */
  eans: string[]
  variants: Variants | null
}

// ---------- texto ----------
const strip = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '')
/** Maiúsculas, sem acento, sem pontos de abreviação ("SH." → "SH"); mantém / , + % - para quantidades como C/20 e 2,2KG. */
function tokens(desc: string): string[] {
  const t = strip(desc).toUpperCase().replace(/\.(?=\s|$)/g, '').replace(/(?<=[A-Z])\.(?=[A-Z])/g, '').replace(/[()*]/g, ' ').split(/\s+/).filter(Boolean)
  // "2 LT" → "2LT", "30 UN" → "30UN": número e unidade separados viram uma quantidade só
  const out: string[] = []
  for (const w of t) {
    if (/^(ML|L|LT|LTS|G|GR|GRS|KG|UN|UND|UNID|MG|CPR|CAP|CAPS|MT|MTS)$/.test(w) && /^\d+([.,]\d+)?$/.test(out[out.length - 1] ?? '')) out[out.length - 1] += w
    else out.push(w)
  }
  return out
}

// ---------- tamanho (fraldas e afins) ----------
const SIZE_ORDER = ['RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG', 'XXXG', 'EG', 'EXG']
const SIZE_TOKEN = new Set(SIZE_ORDER)
// só produto que tem tamanho: evita confundir "G" de gramas ou "M" de metros em outros produtos
const SIZED = /(FRALDA|PANTS|CALCINHA|CUECA|MEIA|LUVA|BODY|TOUCA|COLETE|CINTA|MEIAS)/

/** "L44P42UN" → 44 (leve 44, pague 42); "C/30", "30UN", "X36" → 30/36. */
function unitsOf(tok: string): number | null {
  let m = /^L(\d+)P(\d+)(UN|UND)?$/.exec(tok); if (m) return Number(m[1])
  m = /^C\/?(\d+)$/.exec(tok); if (m) return Number(m[1])
  m = /^(\d+)(UN|UND|UNID)$/.exec(tok); if (m) return Number(m[1])
  m = /^X(\d+)$/.exec(tok); if (m) return Number(m[1])
  return null
}

type SizeInfo = { base: string; label: string; units: number | null }
/** Separa o tamanho e as unidades do nome. Devolve null se não for produto com tamanho ou se não achar o tamanho. */
export function parseSize(desc: string): SizeInfo | null {
  const t = tokens(desc)
  if (!SIZED.test(t.join(' '))) return null
  let si = -1
  for (let i = t.length - 1; i >= 0; i--) {
    if (!SIZE_TOKEN.has(t[i])) continue
    const prev = t[i - 1] ?? ''
    if (/^\d/.test(prev) && !/UN|UND/.test(prev)) continue // "100 G": gramas, não tamanho
    si = i; break
  }
  if (si < 0) return null
  let ui = -1, units: number | null = null
  for (let i = 0; i < t.length; i++) { if (i === si) continue; const u = unitsOf(t[i]); if (u !== null) { ui = i; units = u; break } }
  // "UN" solto depois de um número ("30 UN")
  if (ui < 0) for (let i = 1; i < t.length; i++) if (/^(UN|UND|UNID)$/.test(t[i]) && /^\d+$/.test(t[i - 1])) { units = Number(t[i - 1]); ui = i; t[i - 1] = ''; break }
  const base = t.filter((_, i) => i !== si && i !== ui && t[i] !== '').join(' ').replace(/\s+/g, ' ').trim()
  return { base, label: t[si], units }
}

// ---------- fragrância / sabor ----------
const QTY = /^(\d+([.,]\d+)?(ML|G|GR|GRS|KG|L|LT|LTS|UN|UND|MG|CPR|CAP|CAPS|MT|MTS)|L\d+P\d+|C\/\d+)$/
export const OPTIONS_SUFFIX = 'VÁRIAS OPÇÕES'
const keyOf = (s: string, price: number) => `${s}|${price.toFixed(2)}`

type OptionItem = { i: number; t: string[]; q: number }
/** Posição da última quantidade no nome ("1L", "450ML", "L500P400"); -1 se não tiver. */
const lastQty = (t: string[]) => { let q = -1; for (let i = 0; i < t.length; i++) if (QTY.test(t[i])) q = i; return q }

/**
 * Entre produtos da mesma marca/produto, quantidade e preço, acha o que é igual no começo e no fim do nome; o que sobra no meio (fragrância, sabor, linha) é a variação.
 * Só agrupa se a parte comum tiver pelo menos 3 palavras (incluindo a quantidade): "DESINFETANTE CASAFLOR 1L" sim, "DESODORANTE 150ML" não.
 */
function optionGroup(items: OptionItem[], qty: string): { name: string; variants: string[] } | null {
  if (items.length < 2) return null
  let p = 0
  while (items.every((x) => x.t[p] !== undefined && x.t[p] === items[0].t[p])) p++
  let sfx = 0
  while (items.every((x) => x.t.length - 1 - sfx >= p && x.t[x.t.length - 1 - sfx] === items[0].t[items[0].t.length - 1 - sfx])) sfx++
  if (p + sfx < 3) return null
  const core = [...items[0].t.slice(0, p), ...items[0].t.slice(items[0].t.length - sfx)]
  if (!core.includes(qty)) core.push(qty) // a quantidade fica no nome mesmo quando estava no meio da variação
  return { name: core.join(' '), variants: items.map((x) => x.t.slice(p, x.t.length - sfx).join(' ') || 'ORIGINAL') }
}

/**
 * Agrupa os produtos da planilha em encartes. Primeiro por tamanho (mesmo nome, mesmo preço, tamanhos diferentes), depois por fragrância/sabor
 * (mesma marca, produto, quantidade e preço; o meio do nome muda). A ordem segue a primeira aparição de cada grupo. `enabled = false` = um encarte por produto.
 */
export function groupItems(items: GroupInput[], enabled = true): Encarte[] {
  const single = (it: GroupInput): Encarte => ({ name: it.name, price: it.price, section: it.section, ean: it.ean, eans: [it.ean], variants: null })
  if (!enabled) return items.map(single)

  const used = new Set<number>()
  // 1) tamanhos
  const bySize = new Map<string, number[]>()
  items.forEach((it, i) => {
    const p = parseSize(it.name)
    if (!p) return
    const k = keyOf(`${it.section ?? ''}|${p.base}`, it.price)
    ;(bySize.get(k) ?? bySize.set(k, []).get(k)!).push(i)
  })
  const groups = new Map<number, Encarte>() // índice do primeiro membro → encarte
  for (const idxs of bySize.values()) {
    const labels = new Set(idxs.map((i) => parseSize(items[i].name)!.label))
    if (idxs.length < 2 || labels.size < 2) continue
    const rows: SizeRow[] = idxs.map((i) => { const p = parseSize(items[i].name)!; return { label: p.label, units: p.units, ean: items[i].ean, name: items[i].name } })
    rows.sort((a, b) => SIZE_ORDER.indexOf(a.label) - SIZE_ORDER.indexOf(b.label))
    const first = items[idxs[0]]
    groups.set(idxs[0], { name: parseSize(first.name)!.base, price: first.price, section: first.section, ean: first.ean, eans: idxs.map((i) => items[i].ean), variants: { kind: 'sizes', rows } })
    idxs.forEach((i) => used.add(i))
  }

  // 2) fragrância / sabor: mesmas duas primeiras palavras, mesma quantidade e mesmo preço
  const byOpt = new Map<string, OptionItem[]>()
  items.forEach((it, i) => {
    if (used.has(i)) return
    const t = tokens(it.name)
    const q = lastQty(t)
    if (q < 2) return // precisa de "marca produto ... quantidade"
    const k = keyOf(`${it.section ?? ''}|${t[0]} ${t[1]}|${t[q]}`, it.price)
    ;(byOpt.get(k) ?? byOpt.set(k, []).get(k)!).push({ i, t, q })
  })
  for (const list of byOpt.values()) {
    const g = optionGroup(list, list[0].t[list[0].q])
    if (!g) continue
    const first = items[list[0].i]
    groups.set(list[0].i, { name: `${g.name} - ${OPTIONS_SUFFIX}`, price: first.price, section: first.section, ean: first.ean, eans: list.map((x) => items[x.i].ean), variants: { kind: 'options', members: list.map((x, k) => ({ ean: items[x.i].ean, name: items[x.i].name, variant: g.variants[k] })) } })
    list.forEach((x) => used.add(x.i))
  }

  const out: Encarte[] = []
  items.forEach((it, i) => {
    const g = groups.get(i)
    if (g) out.push(g)
    else if (!used.has(i)) out.push(single(it))
  })
  return out
}

/** Resumo para o relatório da importação. */
export function groupSummary(items: number, encartes: Encarte[]): { linhas: number; encartes: number; gruposTamanho: number; gruposOpcoes: number } {
  return { linhas: items, encartes: encartes.length, gruposTamanho: encartes.filter((e) => e.variants?.kind === 'sizes').length, gruposOpcoes: encartes.filter((e) => e.variants?.kind === 'options').length }
}
