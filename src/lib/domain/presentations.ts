// Apresentações: regras puras (tipo do arquivo, tamanho das partes, título). Testado em tests/presentations.test.ts.
import { unzipSync } from 'fflate'

/** Cada parte do envio cabe no corpo de uma requisição da Vercel (4,5 MB) com folga. */
export const CHUNK_BYTES = 3.5 * 1024 * 1024
export const MAX_PRESENTATION_BYTES = 80 * 1024 * 1024
export const maxChunks = Math.ceil(MAX_PRESENTATION_BYTES / CHUNK_BYTES)

export type PresentationKind = 'pptx' | 'pdf'

/** Tipo pelo nome do arquivo (a conferência real é feita pelos bytes, em `sniffPresentation`). */
export function kindFromName(name: string): PresentationKind | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return ext === 'pptx' ? 'pptx' : ext === 'pdf' ? 'pdf' : null
}

/** Confere pelos bytes: PDF começa com %PDF; PPTX é um ZIP com [Content_Types].xml e ppt/presentation.xml. Devolve o tipo real ou null. */
export function sniffPresentation(buf: Uint8Array): PresentationKind | null {
  if (buf.length > 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) return 'pdf'
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    try {
      const names = Object.keys(unzipSync(buf, { filter: (f) => f.name === '[Content_Types].xml' || f.name === 'ppt/presentation.xml' }))
      return names.includes('[Content_Types].xml') && names.includes('ppt/presentation.xml') ? 'pptx' : null
    } catch { return null }
  }
  return null
}

/** Título a partir do nome do arquivo ("Andamento do Marketing — Out 2026.pdf" → "Andamento do Marketing — Out 2026"). */
export function titleFromFileName(name: string): string {
  const t = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (t || 'Apresentação').slice(0, 160)
}

export const chunkCountFor = (size: number): number => Math.ceil(size / CHUNK_BYTES)

/** Valida o início de um envio: tamanho, quantidade de partes e tipo. */
export function validateUploadStart(o: { size: unknown; chunks: unknown; kind: unknown }): string | null {
  const size = Number(o.size), chunks = Number(o.chunks)
  if (!Number.isInteger(size) || size <= 0) return 'O arquivo está vazio.'
  if (size > MAX_PRESENTATION_BYTES) return `O arquivo passa de ${MAX_PRESENTATION_BYTES / 1024 / 1024} MB. Exporte um PDF mais leve ou reduza as imagens.`
  if (o.kind !== 'pptx' && o.kind !== 'pdf') return 'Use um arquivo PPTX ou PDF.'
  if (!Number.isInteger(chunks) || chunks !== chunkCountFor(size) || chunks > maxChunks) return 'Envio inválido (partes não conferem com o tamanho).'
  return null
}
