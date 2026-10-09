import Link from 'next/link'
import { Suspense } from 'react'
import { AlertTriangle } from 'lucide-react'
import { WindsorNotice } from '@/components/windsor-notice'
import { requireUser } from '@/lib/auth'
import { PERIOD_DAYS, compact, isPeriodDays, ratio, sum } from '@/lib/insights/calc'
import { MESSAGES_FIELD, loadAdsInsights } from '@/lib/insights/server'
import { getScope, scopeLabel, type Scope } from '@/lib/scope'
import { brl, int, pct } from '@/lib/windsor'

type Row = Record<string, unknown>

function group(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, Row[]>()
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r])
  return [...m.entries()].map(([k, rs]) => {
    const spend = sum(rs, 'spend'), impressions = sum(rs, 'impressions'), clicks = sum(rs, 'link_clicks'), conv = sum(rs, MESSAGES_FIELD)
    return { k, spend, impressions, clicks, conv, ctr: impressions ? (clicks / impressions) * 100 : null, cpc: clicks ? spend / clicks : null, cpm: impressions ? ratio(spend, impressions, 1000) : null, cpl: conv ? spend / conv : null }
  }).sort((a, b) => b.spend - a.spend)
}

async function Data({ d, view, scope }: { d: number; view: 'campanha' | 'conta'; scope: Scope }) {
  const r = await loadAdsInsights(d, { brandId: scope.brand?.id, branchId: scope.branch?.id, brands: scope.brands })
  if (!r.ok) return <WindsorNotice result={r.result} />
  const rows = r.cur as Row[]
  const t = group(rows, () => 'total')[0]
  const list = view === 'conta' ? group(rows, (x) => String(x.account_name ?? '—')) : group(rows, (x) => `${x.campaign ?? '—'}\u0000${x.account_name ?? '—'}`)
  return (
    <>
      {r.unmapped.length > 0 && (
        <div className="notice"><AlertTriangle size={18} /><span>Conta(s) sem filial identificada: <b>{r.unmapped.join(', ')}</b>. <Link href="/configuracoes/integracoes" style={{ textDecoration: 'underline' }}>Ver integrações</Link></span></div>
      )}
      <div className="dark-kpis">
        <div className="dark-kpi k-orange"><small>Investimento</small><strong>{brl(t?.spend ?? 0)}</strong></div>
        <div className="dark-kpi k-green"><small>Conversas iniciadas</small><strong>{int(t?.conv ?? 0)}</strong></div>
        <div className="dark-kpi k-blue"><small>Cliques no link</small><strong>{int(t?.clicks ?? 0)}</strong></div>
        <div className="dark-kpi"><small>Impressões</small><strong>{compact(t?.impressions ?? 0)}</strong></div>
        <div className="dark-kpi k-blue"><small>CTR (link)</small><strong>{pct(t?.ctr ?? null)}</strong></div>
        <div className="dark-kpi k-orange"><small>Custo por conversa</small><strong>{t?.cpl ? brl(t.cpl) : '—'}</strong></div>
      </div>
      {list.length === 0 ? (
        <p className="empty dark-empty">Sem dados de anúncios neste recorte e período.</p>
      ) : (
        <div className="dark-table">
          <table>
            <thead>
              <tr>
                <th>{view === 'conta' ? 'Conta' : 'Campanha'}</th>{view === 'campanha' && <th>Conta</th>}
                <th className="num">Investimento</th><th className="num">Conversas</th><th className="num">Custo/conv.</th><th className="num">Cliques link</th><th className="num">Impressões</th><th className="num">CTR</th><th className="num">CPC</th><th className="num">CPM</th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => {
                const [a, b] = x.k.split('\u0000')
                return (
                  <tr key={x.k}>
                    <td><b>{a}</b></td>{view === 'campanha' && <td>{b}</td>}
                    <td className="num">{brl(x.spend)}</td><td className="num">{int(x.conv)}</td><td className="num">{x.cpl ? brl(x.cpl) : '—'}</td>
                    <td className="num">{int(x.clicks)}</td><td className="num">{int(x.impressions)}</td><td className="num">{pct(x.ctr)}</td><td className="num">{brl(x.cpc)}</td><td className="num">{brl(x.cpm)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ marginTop: 12, color: '#8aa3bc' }}>Receita e ROAS não são exibidos: dependem de rastreamento de vendas que ainda não está conectado. “Conversas” usa a atribuição de 7 dias da Meta.</p>
    </>
  )
}

export default async function MetaAds({ searchParams }: { searchParams: Promise<{ d?: string; v?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const n = Number(sp.d)
  const d = isPeriodDays(n) ? n : 28
  const view = sp.v === 'conta' ? 'conta' : 'campanha'
  const scope = await getScope()
  const href = (q: { d?: number; v?: string }) => `/resultados/meta-ads?${new URLSearchParams({ d: String(q.d ?? d), v: q.v ?? view })}`
  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Meta Ads</h1>
          <p>{scopeLabel(scope)} · investimento e desempenho dos anúncios, lidos direto do Windsor.</p>
        </div>
        <nav className="tabs" aria-label="Período">
          {PERIOD_DAYS.map((x) => <Link key={x} href={href({ d: x })} className={`tab${x === d ? ' active' : ''}`}>{x} dias</Link>)}
        </nav>
      </header>

      <div className="dark-surface">
        <div className="tabs">
          <Link href={href({ v: 'campanha' })} className={`tab${view === 'campanha' ? ' active' : ''}`}>Por campanha</Link>
          <Link href={href({ v: 'conta' })} className={`tab${view === 'conta' ? ' active' : ''}`}>Por conta (filial)</Link>
        </div>
        <Suspense fallback={<div className="mcard skeleton dark-skel" />}><Data d={d} view={view} scope={scope} /></Suspense>
      </div>
    </>
  )
}
