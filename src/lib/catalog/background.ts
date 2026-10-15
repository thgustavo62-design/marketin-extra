// Fundo transparente para foto de embalagem feita sobre fundo liso (estúdio/recorte com fundo branco ou de cor única).
// Só aceita imagem cuja borda é uniforme: foto de prateleira, com mão ou cenário, NÃO vira transparente (e não serve como foto profissional).
// Sem modelo de IA: parte da borda e apaga só o fundo conectado a ela (o branco de dentro do rótulo continua). Importações com .ts para rodar em scripts do Node.
import sharp from 'sharp'

const WORK = 1200
export const BORDER_TOLERANCE = 20 // distância de cor para contar como "fundo"
const MIN_BORDER_FRACTION = 0.92 // quanto da borda precisa ser o mesmo fundo
const MIN_REMOVED = 0.06 // abaixo disso quase não havia fundo
const MAX_REMOVED = 0.88 // acima disso o recorte comeu o produto

export type Cutout = { ok: true; png: Buffer; removed: number; background: [number, number, number] } | { ok: false; reason: 'fundo_nao_uniforme' | 'quase_sem_fundo' | 'fundo_demais' | 'erro' }

const dist = (r: number, g: number, b: number, bg: readonly [number, number, number]) => Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]))

/** Descobre o fundo pela borda e, se for liso, devolve a imagem em PNG com o fundo transparente (bordas suavizadas). */
export async function makeTransparent(input: Buffer): Promise<Cutout> {
  try {
    const base = sharp(input, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate().resize({ width: WORK, height: WORK, fit: 'inside', withoutEnlargement: true })
    const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const w = info.width, h = info.height
    const px = (x: number, y: number) => (y * w + x) * 4

    // cor de fundo = mediana de cada canal ao longo da borda; transparência já existente conta como fundo
    const edge: number[] = []
    for (let x = 0; x < w; x++) { edge.push(px(x, 0), px(x, h - 1)) }
    for (let y = 1; y < h - 1; y++) { edge.push(px(0, y), px(w - 1, y)) }
    const median = (c: number) => { const v = edge.map((i) => data[i + c]).sort((a, b) => a - b); return v[v.length >> 1] }
    const bg: [number, number, number] = [median(0), median(1), median(2)]
    const near = edge.filter((i) => data[i + 3] < 16 || dist(data[i], data[i + 1], data[i + 2], bg) <= BORDER_TOLERANCE).length
    if (near / edge.length < MIN_BORDER_FRACTION) return { ok: false, reason: 'fundo_nao_uniforme' }

    // apaga o fundo conectado à borda
    const isBg = (i: number) => data[i + 3] < 16 || dist(data[i], data[i + 1], data[i + 2], bg) <= BORDER_TOLERANCE
    const gone = new Uint8Array(w * h)
    const stack: number[] = []
    const push = (x: number, y: number) => { const k = y * w + x; if (!gone[k] && isBg(k * 4)) { gone[k] = 1; stack.push(k) } }
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
    while (stack.length) {
      const k = stack.pop()!
      const x = k % w, y = (k - x) / w
      if (x > 0) push(x - 1, y)
      if (x < w - 1) push(x + 1, y)
      if (y > 0) push(x, y - 1)
      if (y < h - 1) push(x, y + 1)
    }
    let removedCount = 0
    for (let k = 0; k < gone.length; k++) removedCount += gone[k]
    const removed = removedCount / (w * h)
    if (removed < MIN_REMOVED) return { ok: false, reason: 'quase_sem_fundo' }
    if (removed > MAX_REMOVED) return { ok: false, reason: 'fundo_demais' }

    // alfa: fundo = 0; pixel logo ao lado do fundo ganha transparência proporcional à semelhança com o fundo (borda suave, sem serrilhado)
    const out = Buffer.from(data)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x, i = k * 4
        if (gone[k]) { out[i + 3] = 0; continue }
        const touches = (x > 0 && gone[k - 1]) || (x < w - 1 && gone[k + 1]) || (y > 0 && gone[k - w]) || (y < h - 1 && gone[k + w])
        if (touches) {
          const d = dist(data[i], data[i + 1], data[i + 2], bg)
          out[i + 3] = Math.min(255, Math.round((255 * Math.max(0, d - BORDER_TOLERANCE / 2)) / (BORDER_TOLERANCE * 2.5)))
        }
      }
    }
    // recorta as margens vazias (o produto fica encostado nas bordas, como num recorte)
    const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).extend({ top: 12, bottom: 12, left: 12, right: 12, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    return { ok: true, png, removed, background: bg }
  } catch {
    return { ok: false, reason: 'erro' }
  }
}
