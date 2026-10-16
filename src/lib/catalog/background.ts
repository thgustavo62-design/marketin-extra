// Fundo transparente para foto de embalagem feita sobre fundo liso (estúdio/recorte com fundo branco ou de cor única).
// Foto de prateleira, com mão ou cenário, NÃO vira transparente (e não serve como foto profissional).
// Sem modelo de IA. Três casos:
//  1. a imagem já é um recorte (PNG com fundo transparente): mantém como está, só recorta as margens;
//  2. fundo liso: acha o fundo a partir da borda SEM atravessar as bordas do produto (produto branco sobre fundo branco continua inteiro),
//     fecha frestas, preenche buracos internos, tira fios finos e suaviza a borda;
//  3. qualquer outra coisa: recusa.
// Importações com .ts para rodar em scripts do Node.
import sharp from 'sharp'

const WORK = 900
const GRAD = 9 // borda forte: o preenchimento do fundo não atravessa
const DIST = 48 // distância máxima de cor para ser fundo
const MIN_PRODUCT = 0.06 // abaixo disso quase não sobrou produto
const MAX_PRODUCT = 0.97 // acima disso quase não havia fundo

export type Cutout =
  | { ok: true; png: Buffer; product: number; method: 'ja_recortada' | 'fundo_liso' }
  | { ok: false; reason: 'fundo_nao_uniforme' | 'quase_sem_fundo' | 'fundo_demais' | 'erro' }

/** Devolve a imagem com fundo transparente, ou o motivo de não ser possível. */
export async function makeTransparent(input: Buffer): Promise<Cutout> {
  try {
    const { data: raw, info } = await sharp(input, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate().resize({ width: WORK, height: WORK, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const w = info.width, h = info.height, n = w * h
    const edge: number[] = []
    for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x)
    for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1)

    // 1. já é um recorte: a borda é (quase toda) transparente e há bastante área transparente
    let transp = 0; for (let i = 0; i < n; i++) if (raw[i * 4 + 3] < 16) transp++
    const edgeTransp = edge.filter((i) => raw[i * 4 + 3] < 16).length / edge.length
    if (transp / n >= 0.08 && edgeTransp >= 0.9) {
      const out = Buffer.from(raw)
      for (let i = 0; i < n; i++) if (out[i * 4 + 3] < 40) out[i * 4 + 3] = 0 // névoa de transparência (fundo "quase" transparente)
      return { ok: true, png: await finish(out, w, h), product: 1 - transp / n, method: 'ja_recortada' }
    }

    // 2. fundo liso. Transparência parcial de origem conta como branco
    const rgb = new Uint8ClampedArray(n * 3)
    for (let i = 0; i < n; i++) { const a = raw[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(raw[i * 4 + c] * a + 255 * (1 - a)) }
    const grad = new Float32Array(n)
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let g = 0
      for (let c = 0; c < 3; c++) {
        const v = (yy: number, xx: number) => rgb[((y + yy) * w + (x + xx)) * 3 + c]
        const gx = v(-1, 1) + 2 * v(0, 1) + v(1, 1) - v(-1, -1) - 2 * v(0, -1) - v(1, -1)
        const gy = v(1, -1) + 2 * v(1, 0) + v(1, 1) - v(-1, -1) - 2 * v(-1, 0) - v(-1, 1)
        g = Math.max(g, Math.hypot(gx, gy) / 4)
      }
      grad[y * w + x] = g
    }
    const med = (c: number) => { const v = edge.map((i) => rgb[i * 3 + c]).sort((a, b) => a - b); return v[v.length >> 1] }
    const bg = [med(0), med(1), med(2)]
    const dist = (i: number) => Math.max(Math.abs(rgb[i * 3] - bg[0]), Math.abs(rgb[i * 3 + 1] - bg[1]), Math.abs(rgb[i * 3 + 2] - bg[2]))
    // a borda precisa ser, em quase toda a extensão, do mesmo fundo
    if (edge.filter((i) => dist(i) <= 22).length / edge.length < 0.9) return { ok: false, reason: 'fundo_nao_uniforme' }

    const fundo = new Uint8Array(n)
    const pilha: number[] = []
    for (const i of edge) if (!fundo[i] && dist(i) <= DIST) { fundo[i] = 1; pilha.push(i) }
    while (pilha.length) {
      const i = pilha.pop()!, x = i % w, y = (i - x) / w
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !fundo[j] && grad[j] <= GRAD && dist(j) <= DIST) { fundo[j] = 1; pilha.push(j) }
      }
    }
    let prod: Uint8Array = new Uint8Array(n)
    for (let i = 0; i < n; i++) prod[i] = fundo[i] ? 0 : 1
    const R = Math.max(2, Math.round(Math.min(w, h) * 0.012))
    prod = dilata(prod, w, h, R)
    prod = preencheBuracos(prod, w, h)
    prod = erode(prod, w, h, R)
    const r2 = Math.max(2, Math.round(Math.min(w, h) * 0.004)) // tira fios e sujeira mais finos que ~2*r2 pixels
    prod = dilata(erode(prod, w, h, r2), w, h, r2)
    prod = maiores(prod, w, h)
    let cob = 0; for (let i = 0; i < n; i++) cob += prod[i]
    cob /= n
    if (cob > MAX_PRODUCT) return { ok: false, reason: 'quase_sem_fundo' }
    if (cob < MIN_PRODUCT) return { ok: false, reason: 'fundo_demais' }

    const alfa = new Uint8Array(n)
    for (let i = 0; i < n; i++) alfa[i] = prod[i] ? 255 : 0
    const { data: suave, info: si } = await sharp(Buffer.from(alfa), { raw: { width: w, height: h, channels: 1 } }).blur(0.9).raw().toBuffer({ resolveWithObject: true })
    const sc = si.channels // normalmente 1; lê pelo número de canais que voltar
    const out = Buffer.alloc(n * 4)
    for (let i = 0; i < n; i++) {
      out[i * 4] = rgb[i * 3]; out[i * 4 + 1] = rgb[i * 3 + 1]; out[i * 4 + 2] = rgb[i * 3 + 2]
      out[i * 4 + 3] = prod[i] ? 255 : suave[i * sc] > 24 ? suave[i * sc] : 0
    }
    return { ok: true, png: await finish(out, w, h), product: cob, method: 'fundo_liso' }
  } catch {
    return { ok: false, reason: 'erro' }
  }
}

/** Recorta as margens vazias e deixa uma folga pequena. */
async function finish(rgba: Buffer, w: number, h: number): Promise<Buffer> {
  // pixel totalmente transparente sem cor: senão o corte das margens não reconhece o que é vazio
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (rgba[i + 3] === 0) { rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; continue }
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (x1 < 0) return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
}

// ---------- morfologia simples sobre máscara binária ----------
function dilata(m: Uint8Array, w: number, h: number, r: number): Uint8Array { // janela quadrada separável
  const t = new Uint8Array(m.length), o = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) {
    let c = 0
    for (let x = 0; x < Math.min(r, w); x++) c += m[y * w + x]
    for (let x = 0; x < w; x++) { if (x + r < w) c += m[y * w + x + r]; if (x - r - 1 >= 0) c -= m[y * w + x - r - 1]; t[y * w + x] = c > 0 ? 1 : 0 }
  }
  for (let x = 0; x < w; x++) {
    let c = 0
    for (let y = 0; y < Math.min(r, h); y++) c += t[y * w + x]
    for (let y = 0; y < h; y++) { if (y + r < h) c += t[(y + r) * w + x]; if (y - r - 1 >= 0) c -= t[(y - r - 1) * w + x]; o[y * w + x] = c > 0 ? 1 : 0 }
  }
  return o
}
function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1
  const d = dilata(inv, w, h, r)
  const o = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) o[i] = d[i] ? 0 : 1
  return o
}
/** O que não é alcançável a partir da borda passando só por fundo vira produto (buracos internos). */
function preencheBuracos(m: Uint8Array, w: number, h: number): Uint8Array {
  const alc = new Uint8Array(m.length), p: number[] = []
  const s = (i: number) => { if (!m[i] && !alc[i]) { alc[i] = 1; p.push(i) } }
  for (let x = 0; x < w; x++) { s(x); s((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { s(y * w); s(y * w + w - 1) }
  while (p.length) { const i = p.pop()!, x = i % w, y = (i - x) / w; if (x > 0) s(i - 1); if (x < w - 1) s(i + 1); if (y > 0) s(i - w); if (y < h - 1) s(i + w) }
  const o = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) o[i] = alc[i] ? 0 : 1
  return o
}
/** Mantém o maior componente e os que tenham pelo menos 12% dele (kits com várias peças). */
function maiores(m: Uint8Array, w: number, h: number): Uint8Array {
  const id = new Int32Array(m.length), tam: number[] = [0]
  let k = 0
  for (let s0 = 0; s0 < m.length; s0++) {
    if (!m[s0] || id[s0]) continue
    k++; tam[k] = 0
    const p = [s0]; id[s0] = k
    while (p.length) {
      const i = p.pop()!; tam[k]++
      const x = i % w, y = (i - x) / w
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && m[j] && !id[j]) { id[j] = k; p.push(j) }
    }
  }
  const maior = Math.max(0, ...tam.slice(1))
  const o = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) o[i] = id[i] && tam[id[i]] >= maior * 0.12 ? 1 : 0
  return o
}
