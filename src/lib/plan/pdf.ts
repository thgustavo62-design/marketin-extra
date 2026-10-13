// Extração do texto de um PDF enviado pela pessoa (plano de conteúdo). Só lê texto: não executa nada do arquivo.
// O PDF é dado não confiável: tamanho, páginas, tempo e volume de texto têm limite.
import { extractText, getDocumentProxy } from 'unpdf'

export const MAX_PLAN_PAGES = 150
const MAX_TEXT_CHARS = 3_000_000
const TIMEOUT_MS = 40_000

export type PdfResult = { ok: true; pages: string[] } | { ok: false; error: string }

export const looksLikePdf = (b: Uint8Array): boolean => {
  // o cabeçalho "%PDF-" pode ter alguns bytes de lixo antes, mas sempre nos primeiros 1 KB
  const head = Buffer.from(b.subarray(0, 1024)).toString('latin1')
  return head.includes('%PDF-')
}

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfResult> {
  if (!looksLikePdf(bytes)) return { ok: false, error: 'O arquivo não é um PDF.' }
  const work = async (): Promise<PdfResult> => {
    // o pdf.js toma posse do buffer; passamos uma cópia
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    if (pdf.numPages > MAX_PLAN_PAGES) return { ok: false, error: `O PDF tem ${pdf.numPages} páginas; o limite é ${MAX_PLAN_PAGES}.` }
    const { text } = await extractText(pdf, { mergePages: false })
    const pages = text.map((t) => t.trim())
    const total = pages.reduce((n, p) => n + p.length, 0)
    if (total === 0) return { ok: false, error: 'Este PDF não tem texto selecionável (parece uma imagem ou digitalização). Exporte o plano como PDF a partir do documento original.' }
    if (total > MAX_TEXT_CHARS) return { ok: false, error: 'O texto do PDF é grande demais para importar de uma vez.' }
    return { ok: true, pages }
  }
  try {
    return await Promise.race([
      work(),
      new Promise<PdfResult>((resolve) => setTimeout(() => resolve({ ok: false, error: 'O PDF demorou demais para ser lido. Tente um arquivo menor.' }), TIMEOUT_MS)),
    ])
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'PasswordException') return { ok: false, error: 'O PDF está protegido por senha. Salve uma cópia sem senha e envie de novo.' }
    return { ok: false, error: 'Não consegui abrir este PDF. Ele pode estar corrompido; exporte de novo a partir do documento original.' }
  }
}
