import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getSession } from '@/lib/session'

// Planilha de exemplo para a promoção: código de barras e valor aproximado (o preço que vai para a peça).
export async function GET() {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Promoção')
  ws.addRow(['Código de barras', 'Valor aproximado'])
  ws.addRow(['7891000100103', 18.99])
  ws.addRow(['7898357410015', 59.99])
  ws.getRow(1).font = { bold: true }
  ws.columns = [{ width: 22 }, { width: 20 }]
  ws.getColumn(1).numFmt = '@'
  ws.getColumn(2).numFmt = '#,##0.00'
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="modelo-promocao.xlsx"', 'Cache-Control': 'private, max-age=3600' } })
}
