import { NextResponse } from 'next/server'
import { listPublications } from '@/lib/data'
import { addDays, engagementRate, formatBR, interactions, todayISO, toCsv } from '@/lib/domain'
import { getScope } from '@/lib/scope'
import { getSession } from '@/lib/session'

// CSV das publicações coletadas — exatamente o mesmo recorte de filial/unidade e a mesma janela da tela.
// Célula vazia = N/D (a rede não informou); nunca zero.
export async function GET() {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const scope = await getScope()
  const rows = await listPublications({ brand: scope.brand?.slug, branchId: scope.branch?.id, from: addDays(todayISO(), -90) })
  const header = ['Data (Brasília)', 'Filial', 'Conta', 'Formato', 'Link', 'Alcance', 'Visualizações', 'Curtidas', 'Comentários', 'Salvamentos', 'Compartilhamentos',
    'Interações (curtidas+comentários+salvamentos+compartilhamentos)', 'Engajamento % (interações ÷ alcance × 100)', 'Coletado em', 'Qualidade do dado', 'Conteúdo vinculado', 'Como foi vinculado']
  const data = rows.map((p) => {
    const m = p.metrics
    return [
      p.published_on ? formatBR(p.published_on) : '', p.brand_name, p.account_name, p.format, p.permalink ?? '',
      m?.reach ?? '', m?.views ?? '', m?.likes ?? '', m?.comments ?? '', m?.saves ?? '', m?.shares ?? '',
      m ? (interactions(m) ?? '') : '', m ? (engagementRate(m)?.toFixed(2).replace('.', ',') ?? '') : '',
      p.collected_on ? formatBR(p.collected_on) : '', p.data_quality === 'partial' ? 'parcial' : p.data_quality === 'complete' ? 'completo' : '',
      p.content_title ?? '', p.link_method ?? '',
    ]
  })
  return new NextResponse(toCsv(header, data), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="publicacoes-${todayISO()}.csv"` },
  })
}
