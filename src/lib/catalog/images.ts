// Processamento de imagem de produto: valida pelos bytes, endireita, limita o tamanho e converte para WebP (mantém o fundo transparente
// dos recortes). Gera também a miniatura. Importações com .ts para rodar tanto no Next quanto em scripts do Node.
import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const MAX_IMAGE_INPUT_BYTES = 8 * 1024 * 1024
const FULL = 1200
const THUMB = 240

export type Processed = { data: Buffer; thumb: Buffer; width: number; height: number; sha256: string }

/** Tipo real pelos primeiros bytes (o nome do arquivo não conta). */
export function sniffImage(b: Uint8Array): 'png' | 'jpeg' | 'webp' | 'gif' | null {
  if (b.length < 12) return null
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif'
  return null
}

export async function processImage(input: Buffer): Promise<{ ok: true; image: Processed } | { ok: false; error: string }> {
  if (input.length === 0) return { ok: false, error: 'Arquivo vazio.' }
  if (input.length > MAX_IMAGE_INPUT_BYTES) return { ok: false, error: 'A imagem passa de 8 MB.' }
  if (!sniffImage(input)) return { ok: false, error: 'Não é uma imagem PNG, JPG, WEBP ou GIF.' }
  try {
    const base = () => sharp(input, { failOn: 'error', limitInputPixels: 50_000_000, animated: false }).rotate()
    const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata()
    if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) return { ok: false, error: 'Imagem pequena demais (mínimo 64 × 64 pixels).' }
    const data = await base().resize({ width: FULL, height: FULL, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 90 }).toBuffer({ resolveWithObject: true })
    const thumb = await base().resize({ width: THUMB, height: THUMB, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72, alphaQuality: 80 }).toBuffer()
    return { ok: true, image: { data: data.data, thumb, width: data.info.width, height: data.info.height, sha256: createHash('sha256').update(data.data).digest('hex') } }
  } catch {
    return { ok: false, error: 'Não consegui ler esta imagem (arquivo corrompido ou formato não suportado).' }
  }
}
