// Lê a planilha de promoção (código de barras + preço promocional). Importações com .ts para rodar também em scripts do Node.
import ExcelJS from 'exceljs'
import { detectPromoColumns, parsePromoRows, type PromoParse } from '../domain/promo.ts'

const cell = (v: unknown): unknown => {
  if (v && typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map((x) => x.text).join('')
    if (o.result !== undefined) return o.result
    if (o.text !== undefined) return o.text
    return ''
  }
  return v ?? ''
}

export type PromoXlsx = ({ ok: true } & PromoParse) | { ok: false; error: string }

/** Procura, em qualquer aba, o cabeçalho com "código de barras" e "preço". Aceita CSV salvo como .xlsx e cabeçalho que não está na primeira linha. */
export async function parsePromoXlsx(file: Buffer): Promise<PromoXlsx> {
  if (file.subarray(0, 2).toString('latin1') !== 'PK') return { ok: false, error: 'Não é uma planilha .xlsx. Salve o arquivo como "Pasta de Trabalho do Excel (.xlsx)".' }
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(file as unknown as ArrayBuffer) } catch { return { ok: false, error: 'Não consegui ler a planilha (arquivo corrompido ou protegido por senha).' } }
  for (const ws of wb.worksheets) {
    const rows: unknown[][] = []
    for (let r = 1; r <= Math.min(ws.rowCount, 5000); r++) rows.push(Array.from((ws.getRow(r).values as unknown[]).slice(1), cell))
    for (let h = 0; h < Math.min(rows.length, 15); h++) {
      const cols = detectPromoColumns(rows[h])
      if (cols.ean != null && cols.price != null) {
        const parsed = parsePromoRows(rows.slice(h + 1), cols, h + 2)
        if (!parsed.rows.length) return { ok: false, error: `Achei as colunas, mas nenhuma linha válida. ${parsed.errors[0] ? `Primeiro problema (linha ${parsed.errors[0].line}): ${parsed.errors[0].message}` : ''}`.trim() }
        return { ok: true, ...parsed }
      }
    }
  }
  return { ok: false, error: 'Não encontrei as colunas "Código de barras" (ou EAN) e "Valor aproximado" (ou "Preço promocional") na planilha. Confira o cabeçalho.' }
}
