import { NextResponse } from 'next/server'
import { rowAllowed } from '@/lib/access'
import { getReport } from '@/lib/data'
import { isUuid } from '@/lib/form'
import { reportToCsv } from '@/lib/reports/csv'
import { getSession } from '@/lib/session'

// CSV de um relatório já gerado, com o mesmo controle de acesso por filial do PDF e da tela.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const { id } = await ctx.params
  if (!isUuid(id) || !(await rowAllowed(user, 'reports', id))) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
  const r = await getReport(id)
  if (!r) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
  return new NextResponse(reportToCsv(r.snapshot), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="relatorio-${r.type}-${r.period_start}_${r.period_end}.csv"`, 'Cache-Control': 'no-store' },
  })
}
