import { NextResponse } from 'next/server'
import { toCsv } from '@/lib/domain'
import { isPeriodDays, dailySeries } from '@/lib/insights/calc'
import { MESSAGES_FIELD, loadAdsInsights, loadInstagramInsights } from '@/lib/insights/server'
import { getScope } from '@/lib/scope'
import { getSession } from '@/lib/session'

// CSV diário dos Insights (mesmo recorte de filial/unidade da tela).
export async function GET(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const u = new URL(req.url).searchParams
  const n = Number(u.get('d'))
  const d = isPeriodDays(n) ? n : 28
  const tipo = u.get('tipo') === 'anuncios' ? 'anuncios' : 'instagram'
  const scope = await getScope()
  const ids = { brandId: scope.brand?.id, branchId: scope.branch?.id, brands: scope.brands }

  const r = tipo === 'instagram' ? await loadInstagramInsights(d, ids) : await loadAdsInsights(d, ids)
  if (!r.ok) return NextResponse.json({ error: 'Windsor indisponível ou sem dados confiáveis.', status: r.result.status }, { status: 502 })

  const cols = tipo === 'instagram'
    ? [['Visualizações', 'views'], ['Visualizações de seguidores', 'views_followers'], ['Visualizações de não seguidores', 'views_non_followers'], ['Alcance', 'reach'], ['Interações', 'total_interactions'],
       ['Contas engajadas', 'accounts_engaged'], ['Curtidas', 'likes'], ['Comentários', 'comments'], ['Compartilhamentos', 'shares'], ['Salvamentos', 'saves'], ['Novos seguidores', 'follower_count'], ['Cliques no link do perfil', 'profile_links_taps']]
    : [['Investimento (R$)', 'spend'], ['Impressões', 'impressions'], ['Cliques no link', 'link_clicks'], ['Conversas iniciadas', MESSAGES_FIELD]]
  const series = cols.map(([, f]) => dailySeries(r.cur, f, r.range.from, r.range.to))
  const rows = series[0].map((p, i) => [p.date.split('-').reverse().join('/'), ...series.map((s) => s[i].value)])
  return new NextResponse(toCsv(['Data', ...cols.map(([h]) => h)], rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="insights-${tipo}-${r.range.from}_${r.range.to}.csv"`,
    },
  })
}
