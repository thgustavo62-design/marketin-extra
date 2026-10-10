import { NextResponse } from 'next/server'
import { rowAllowed } from '@/lib/access'
import { getReport } from '@/lib/data'
import { isUuid } from '@/lib/form'
import { reportToPdf } from '@/lib/reports/pdf'
import { getSession } from '@/lib/session'

// PDF de um relatório já gerado. Quem não tem acesso à filial do relatório recebe 404 (mesmo com o endereço certo).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const { id } = await ctx.params
  if (!isUuid(id) || !(await rowAllowed(user, 'reports', id))) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
  const r = await getReport(id)
  if (!r) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
  const bytes = await reportToPdf(r.snapshot)
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="relatorio-${r.type}-${r.period_start}_${r.period_end}.pdf"`, 'Cache-Control': 'no-store' },
  })
}
