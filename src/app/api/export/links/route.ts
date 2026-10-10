import { NextResponse } from 'next/server'
import { listLinks } from '@/lib/data'
import { formatBR, toCsv, todayISO } from '@/lib/domain'
import { getScope } from '@/lib/scope'
import { getSession } from '@/lib/session'

// CSV dos links no mesmo recorte de filial/unidade da tela (sem arquivados).
export async function GET() {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const scope = await getScope()
  const rows = await listLinks({ brand: scope.brand?.slug, branchId: scope.branch?.id })
  const header = ['Nome', 'Filial', 'Unidade', 'Campanha', 'Situação', 'Origem', 'Meio', 'Campanha (utm)', 'Termo', 'Conteúdo', 'Destino', 'Link final', 'Criado em', 'Aprovado por', 'Aprovado em']
  const data = rows.map((l) => [l.label, l.brand_name, l.branch_name ?? 'Todas as unidades', l.campaign_name ?? '', l.status, l.utm_source, l.utm_medium, l.utm_campaign, l.utm_term ?? '', l.utm_content ?? '', l.destination_url, l.final_url, formatBR(l.created_at.slice(0, 10)), l.approved_by_name ?? '', l.approved_at ? formatBR(l.approved_at.slice(0, 10)) : ''])
  return new NextResponse(toCsv(header, data), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="links-${todayISO()}.csv"` } })
}
