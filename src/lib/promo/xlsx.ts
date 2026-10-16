// Lê a planilha de promoção (código de barras + valor). Importações com .ts para rodar também em scripts do Node.
import ExcelJS from 'exceljs'
import { detectPromoColumns, parsePromoRows, type PromoParse, type PromoRow } from '../domain/promo.ts'

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

export type PromoXlsx = ({ ok: true; sheets: { name: string; items: number }[] } & PromoParse) | { ok: false; error: string }

/**
 * Lê TODAS as abas: em cada uma procura o cabeçalho com "código de barras" e o preço ("Valor aproximado" tem prioridade) e junta os produtos, na ordem das abas.
 * Linhas vazias ou só com cor (separadores de grupo) são ignoradas; o mesmo código em duas abas vale só na primeira. Aba sem as colunas é ignorada com aviso.
 */
export async function parsePromoXlsx(file: Buffer): Promise<PromoXlsx> {
  if (file.subarray(0, 2).toString('latin1') !== 'PK') return { ok: false, error: 'Não é uma planilha .xlsx. Salve o arquivo como "Pasta de Trabalho do Excel (.xlsx)".' }
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(file as unknown as ArrayBuffer) } catch { return { ok: false, error: 'Não consegui ler a planilha (arquivo corrompido ou protegido por senha).' } }
  const rows: PromoRow[] = [], errors: PromoParse['errors'] = [], sheets: { name: string; items: number }[] = []
  const seen = new Set<string>()
  let found = false, lastProblem = ''
  for (const ws of wb.worksheets) {
    const cells: unknown[][] = []
    for (let r = 1; r <= Math.min(ws.rowCount, 5000); r++) cells.push(Array.from((ws.getRow(r).values as unknown[]).slice(1), cell))
    let header = -1
    let cols: ReturnType<typeof detectPromoColumns> | null = null
    for (let h = 0; h < Math.min(cells.length, 15); h++) {
      const c = detectPromoColumns(cells[h])
      if (c.ean != null && c.price != null) { header = h; cols = c; break }
    }
    if (!cols) {
      if (cells.some((r) => r.some((v) => String(v ?? '').trim()))) errors.push({ line: 0, message: `Aba "${ws.name}" ignorada: não achei as colunas de código de barras e valor.` })
      continue
    }
    found = true
    const parsed = parsePromoRows(cells.slice(header + 1), cols, header + 2, { seen, section: ws.name.trim() || null })
    rows.push(...parsed.rows)
    for (const e of parsed.errors) errors.push({ line: e.line, message: wb.worksheets.length > 1 ? `[${ws.name}] ${e.message}` : e.message })
    sheets.push({ name: ws.name, items: parsed.rows.length })
    if (!parsed.rows.length && parsed.errors[0]) lastProblem = `Primeiro problema (aba ${ws.name}, linha ${parsed.errors[0].line}): ${parsed.errors[0].message}`
  }
  if (!found) return { ok: false, error: 'Não encontrei as colunas "Código de barras" (ou EAN) e "Valor aproximado" (ou "Preço promocional") na planilha. Confira o cabeçalho.' }
  if (!rows.length) return { ok: false, error: `Achei as colunas, mas nenhuma linha válida. ${lastProblem}`.trim() }
  return { ok: true, rows, errors, sheets }
}
