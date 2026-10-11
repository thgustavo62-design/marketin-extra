// Lista de preços da CMED (Anvisa): leitura, busca e conferência do preço de oferta contra o teto (PMC). Tudo puro e testado.
// O PMC (Preço Máximo ao Consumidor) varia conforme a alíquota de ICMS: o sistema só afirma "acima do teto" quando a filial tem a alíquota cadastrada.

export const ICMS_RATES = [0, 12, 17, 17.5, 18, 19, 19.5, 20, 20.5, 21, 22, 22.5, 23] as const
export const isIcmsRate = (v: unknown): v is (typeof ICMS_RATES)[number] => typeof v === 'number' && (ICMS_RATES as readonly number[]).includes(v)
export const rateKey = (r: number): string => String(r) // "17", "17.5"

export type CmedProduct = {
  ggrem: string; registro: string | null; eans: string[]; product: string; substance: string | null; lab: string | null; presentation: string | null
  therapeuticClass: string | null; productType: string | null; priceRegime: string | null; tarja: string | null
  pfSemImpostos: number | null; pmcSemImpostos: number | null; pmc: Record<string, number>; hospitalOnly: boolean
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
export const normalizeHeader = (h: unknown): string => strip(String(h ?? '')).toLowerCase().replace(/\s+/g, ' ').trim()

/** "27,44" · 27.44 · "1.234,56" → número; "-", vazio, texto → null. */
export function parseBrNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || /^-+$/.test(t)) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}

export function normalizeEan(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length >= 8 && d.length <= 14 ? d : null
}

const cellText = (v: unknown): string | null => {
  const s = (v !== null && typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text) : String(v ?? '')).replace(/\s+/g, ' ').trim()
  return s === '' || /^-+$/.test(s) ? null : s
}

export type HeaderIndex = { ok: true; col: Record<string, number>; pmcRates: { rate: number; col: number }[] } | { ok: false; error: string }

const NEEDED = ['codigo ggrem', 'produto', 'apresentacao', 'regime de preco', 'ean 1', 'pmc sem impostos'] as const

/** Localiza as colunas pelo NOME (não pela posição): se a CMED mudar a ordem, continua funcionando; se mudar os nomes, falha com aviso claro. */
export function buildHeaderIndex(headers: unknown[]): HeaderIndex {
  const col: Record<string, number> = {}
  const pmcRates: { rate: number; col: number }[] = []
  headers.forEach((h, i) => {
    const n = normalizeHeader(h)
    if (!n) return
    const m = /^pmc (\d+(?:,\d)?) %$/.exec(n)
    if (m) pmcRates.push({ rate: Number(m[1].replace(',', '.')), col: i })
    else if (!(n in col)) col[n] = i
  })
  const missing = NEEDED.filter((k) => !(k in col))
  if (missing.length) return { ok: false, error: `A lista da CMED mudou de formato (colunas não encontradas: ${missing.join(', ')}). Nada foi importado.` }
  if (pmcRates.length === 0) return { ok: false, error: 'A lista da CMED não traz colunas de PMC por alíquota. Nada foi importado.' }
  return { ok: true, col, pmcRates }
}

export function mapCmedRow(h: Extract<HeaderIndex, { ok: true }>, row: unknown[]): CmedProduct | null {
  const at = (name: string) => (name in h.col ? row[h.col[name]] : null)
  const ggrem = cellText(at('codigo ggrem')), product = cellText(at('produto'))
  if (!ggrem || !product) return null
  const pmc: Record<string, number> = {}
  for (const { rate, col } of h.pmcRates) { const v = parseBrNumber(row[col]); if (v !== null && v > 0) pmc[rateKey(rate)] = v }
  const eans = [at('ean 1'), at('ean 2'), at('ean 3')].map(normalizeEan).filter((x): x is string => x !== null)
  return {
    ggrem, registro: cellText(at('registro')), eans: [...new Set(eans)], product, substance: cellText(at('substancia')), lab: cellText(at('laboratorio')),
    presentation: cellText(at('apresentacao')), therapeuticClass: cellText(at('classe terapeutica')), productType: cellText(at('tipo de produto (status do produto)')),
    priceRegime: cellText(at('regime de preco')), tarja: cellText(at('tarja')), pfSemImpostos: parseBrNumber(at('pf sem impostos')), pmcSemImpostos: parseBrNumber(at('pmc sem impostos')),
    pmc, hospitalOnly: /^sim$/i.test(String(at('restricao hospitalar') ?? '').trim()),
  }
}

// ---------- descoberta do arquivo mais recente (página oficial da CMED) ----------
const FILE_RE = /arquivos\/(lista_pmc__(\d{8})_\d+\.xlsx)\/@@download\/file/

/** Só aceita o arquivo de PMC publicado no domínio oficial: o endereço nunca vem do usuário. */
export function discoverCmedFile(html: string): { file: string; url: string; version: string; publishedOn: string } | null {
  const m = FILE_RE.exec(html)
  if (!m) return null
  const [, file, ymd] = m
  return { file, url: `https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos/${file}/@@download/file`, version: file.replace(/^lista_pmc__/, '').replace(/\.xlsx$/, ''), publishedOn: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` }
}

// ---------- conferência do preço ----------
export type Verdict = 'dentro' | 'acima' | 'sem_teto' | 'sem_icms' | 'nao_encontrado'
export type PriceCheck = { status: Verdict; pmc: number | null; price: number; excess?: number; icms: number | null; product?: string; presentation?: string | null }

export const pmcFor = (p: Pick<CmedProduct, 'pmc'>, icms: number | null): number | null => (icms === null ? null : (p.pmc[rateKey(icms)] ?? null))

/**
 * Compara o preço ofertado com o PMC da alíquota da filial.
 * - "acima" só com produto encontrado, alíquota cadastrada e PMC existente para ela;
 * - sem PMC (preço liberado ou dado ausente) → "sem_teto": o sistema não afirma nada.
 */
export function checkPrice(price: number, product: Pick<CmedProduct, 'pmc' | 'product' | 'presentation'> | null, icms: number | null): PriceCheck {
  if (!product) return { status: 'nao_encontrado', pmc: null, price, icms }
  const base = { price, icms, product: product.product, presentation: product.presentation }
  if (icms === null) return { ...base, status: 'sem_icms', pmc: null }
  const pmc = pmcFor(product, icms)
  if (pmc === null) return { ...base, status: 'sem_teto', pmc: null }
  const diff = Math.round((price - pmc) * 100) / 100
  return diff > 0 ? { ...base, status: 'acima', pmc, excess: diff } : { ...base, status: 'dentro', pmc }
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export function verdictMessage(c: PriceCheck): string {
  switch (c.status) {
    case 'acima': return `Preço ${brl(c.price)} ACIMA do teto (PMC ${brl(c.pmc!)} com ICMS de ${c.icms}%): ${brl(c.excess!)} a mais. Ofertar acima do PMC é infração.`
    case 'dentro': return `Preço ${brl(c.price)} dentro do teto (PMC ${brl(c.pmc!)} com ICMS de ${c.icms}%).`
    case 'sem_teto': return 'Este item não tem PMC na lista para a alíquota da filial (preço liberado ou dado ausente): o sistema não conferiu o teto.'
    case 'sem_icms': return 'Cadastre a alíquota de ICMS da filial para conferir o preço contra o teto da CMED.'
    default: return 'Item não encontrado na lista da CMED pelo código de barras informado: o preço não foi conferido.'
  }
}

export const VERDICT_LABEL: Record<Verdict, string> = { dentro: 'Dentro do teto', acima: 'Acima do teto', sem_teto: 'Sem teto na lista', sem_icms: 'ICMS não cadastrado', nao_encontrado: 'Não encontrado' }
