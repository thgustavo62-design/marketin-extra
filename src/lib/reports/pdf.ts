// PDF A4 do relatório, com pdf-lib (sem arquivos de fonte em disco: funciona em serverless).
// Identidade: faixa azul-marinho "Extra Marketing" + nome da filial. Células truncadas com reticências (o HTML e o CSV trazem o texto completo).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { pdfSafe } from '../domain/index.ts'
import { LEGEND, reportTitle, snapshotToBlocks, type Block, type Col } from './blocks.ts'
import type { ReportSnapshot } from './build.ts'

const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M
const NAVY = rgb(0.0, 0.125, 0.227), ORANGE = rgb(0.89, 0.604, 0.278), INK = rgb(0.1, 0.13, 0.18), MUTED = rgb(0.4, 0.45, 0.52), LINE = rgb(0.86, 0.89, 0.92), BAND = rgb(0.93, 0.95, 0.97)
const BOTTOM = 52

function fit(font: PDFFont, text: string, size: number, width: number): string {
  const t = pdfSafe(text)
  if (font.widthOfTextAtSize(t, size) <= width) return t
  let lo = 0, hi = t.length
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (font.widthOfTextAtSize(t.slice(0, mid) + '...', size) <= width) lo = mid; else hi = mid - 1 }
  return t.slice(0, Math.max(0, lo)).trimEnd() + '...'
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w
    if (font.widthOfTextAtSize(next, size) <= width) cur = next
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

export async function reportToPdf(s: ReportSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
  doc.setTitle(pdfSafe(reportTitle(s))); doc.setAuthor('Extra Marketing'); doc.setCreator('Extra Marketing'); doc.setCreationDate(new Date(s.meta.generatedAt))

  let page: PDFPage = doc.addPage([W, H]), y = H - M
  const newPage = () => { page = doc.addPage([W, H]); y = H - M }
  const need = (h: number) => { if (y - h < BOTTOM) newPage() }
  // faixa de identidade da primeira página
  page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: NAVY })
  page.drawRectangle({ x: 0, y: H - 82, width: W, height: 4, color: ORANGE })
  page.drawText('EXTRA MARKETING', { x: M, y: H - 34, size: 9, font: bold, color: ORANGE })
  page.drawText(fit(bold, reportTitle(s), 15, CW), { x: M, y: H - 56, size: 15, font: bold, color: rgb(1, 1, 1) })
  y = H - 104

  const text = (t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = o.size ?? 9
    for (const line of wrap(o.bold ? bold : font, t, size, CW - ((o.x ?? M) - M))) {
      need(size + 4)
      page.drawText(line, { x: o.x ?? M, y: y - size, size, font: o.bold ? bold : font, color: o.color ?? INK })
      y -= size + 4
    }
  }

  const table = (b: Extract<Block, { kind: 'table' }>) => {
    need(40)
    text(b.title, { bold: true, size: 10.5, color: NAVY })
    y -= 2
    const total = b.columns.reduce((a, c) => a + c.width, 0)
    const widths = b.columns.map((c) => (c.width / total) * CW)
    const size = b.columns.length > 8 ? 6.6 : 7.6
    const drawRow = (cells: string[], head: boolean, zebra: boolean) => {
      need(15)
      if (head || zebra) page.drawRectangle({ x: M, y: y - 13, width: CW, height: 14, color: head ? BAND : rgb(0.97, 0.98, 0.99) })
      let x = M
      cells.forEach((c, k) => {
        const col: Col = b.columns[k], f = head ? bold : font
        const t = fit(f, c, size, widths[k] - 6)
        const tw = f.widthOfTextAtSize(t, size)
        page.drawText(t, { x: col.align === 'right' ? x + widths[k] - 3 - tw : x + 3, y: y - 9.5, size, font: f, color: head ? NAVY : INK })
        x += widths[k]
      })
      y -= 14
    }
    if (b.rows.length === 0) { text('Sem registros.', { color: MUTED, size: 8 }) } else {
      drawRow(b.columns.map((c) => c.title), true, false)
      b.rows.forEach((r, i) => {
        if (y - 15 < BOTTOM) { newPage(); drawRow(b.columns.map((c) => c.title), true, false) }
        drawRow(r, false, i % 2 === 1)
      })
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE })
    }
    if (b.note) { y -= 3; text(b.note, { size: 7.5, color: MUTED }) }
    y -= 8
  }

  for (const b of snapshotToBlocks(s)) {
    if (b.kind === 'h2') { need(30); y -= 6; text(b.text, { bold: true, size: 12.5, color: NAVY }); page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 1, color: ORANGE }); y -= 6 }
    else if (b.kind === 'kv') { for (const [k, v] of b.rows) { need(14); page.drawText(fit(bold, k, 8.5, 230), { x: M, y: y - 9, size: 8.5, font: bold, color: MUTED }); page.drawText(fit(font, v, 8.5, CW - 240), { x: M + 240, y: y - 9, size: 8.5, font, color: INK }); y -= 14 } y -= 6 }
    else if (b.kind === 'table') table(b)
    else if (b.kind === 'list') { if (b.title) text(b.title, { bold: true, size: 10.5, color: NAVY }); for (const it of b.items) text('- ' + it, { size: 8.8, x: M + 6 }); y -= 6 }
    else text(b.text, { size: 7.8, color: MUTED })
  }

  // rodapé em todas as páginas
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 38 }, end: { x: W - M, y: 38 }, thickness: 0.5, color: LINE })
    p.drawText(fit(font, `Extra Marketing · ${s.meta.brandName}${s.meta.branchName ? ' · ' + s.meta.branchName : ''} · ${s.meta.from.split('-').reverse().join('/')} a ${s.meta.to.split('-').reverse().join('/')}`, 7, CW - 90), { x: M, y: 26, size: 7, font, color: MUTED })
    p.drawText(`Página ${i + 1} de ${pages.length}`, { x: W - M - 60, y: 26, size: 7, font, color: MUTED })
    p.drawText(fit(font, LEGEND, 6.5, CW), { x: M, y: 15, size: 6.5, font, color: MUTED })
  })
  return doc.save()
}
