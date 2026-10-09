import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { WindsorNotice } from '@/components/windsor-notice'
import { requireUser } from '@/lib/auth'
import { getIntegrationAccounts } from '@/lib/data'
import { partitionByScope } from '@/lib/integrations'
import { getScope, scopeLabel } from '@/lib/scope'
import { DATE_PRESETS, brl, int, isDatePreset, pct, sumAds, windsorQuery, type AdRow } from '@/lib/windsor'

type SP = { p?: string; v?: string }

function groupBy(rows: AdRow[], key: (r: AdRow) => string) {
  const m = new Map<string, AdRow[]>()
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r])
  return [...m.entries()].map(([k, rs]) => ({ k, t: sumAds(rs) })).sort((a, b) => b.t.spend - a.t.spend)
}

export default async function MetaAds({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const preset = isDatePreset(sp.p) ? sp.p : 'last_30d'
  const view = sp.v === 'conta' ? 'conta' : 'campanha'

  const [res, maps] = await Promise.all([
    windsorQuery<AdRow>('facebook', ['account_name', 'campaign', 'spend', 'clicks', 'impressions'], preset),
    getIntegrationAccounts(),
  ])
  const part = res.status === 'ok'
    ? partitionByScope(res.rows, 'ads', maps.map((m) => ({ account_name: m.account_name, kind: m.kind, brand_id: m.brand_id, branch_id: m.branch_id })), scope.brands, { brandId: scope.brand?.id, branchId: scope.branch?.id })
    : { rows: [] as AdRow[], unmapped: [] as string[] }
  const t = sumAds(part.rows)
  const rows = view === 'conta' ? groupBy(part.rows, (r) => r.account_name ?? '—') : groupBy(part.rows, (r) => `${r.campaign ?? '—'}\u0000${r.account_name ?? '—'}`)
  const href = (q: Partial<SP>) => `/resultados/meta-ads?${new URLSearchParams({ p: preset, v: view, ...q })}`

  return (
    <>
      <header className="page-head">
        <h1>Meta Ads</h1>
        <p>{scopeLabel(scope)} · investimento e desempenho dos anúncios, lidos direto do Windsor.</p>
      </header>

      <div className="dark-surface">
        <div className="tabs">
          <Link href={href({ v: 'campanha' })} className={`tab${view === 'campanha' ? ' active' : ''}`}>Por campanha</Link>
          <Link href={href({ v: 'conta' })} className={`tab${view === 'conta' ? ' active' : ''}`}>Por conta (filial)</Link>
        </div>
        <form className="filters" method="get">
          <input type="hidden" name="v" value={view} />
          <select name="p" defaultValue={preset} aria-label="Período">
            {Object.entries(DATE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" className="btn">Aplicar</button>
        </form>

        <WindsorNotice result={res.status === 'ok' ? { status: 'ok' } : res} />
        {part.unmapped.length > 0 && (
          <div className="notice"><AlertTriangle size={18} /><span>Conta(s) sem filial identificada: <b>{part.unmapped.join(', ')}</b>. <Link href="/configuracoes/integracoes" style={{ textDecoration: 'underline' }}>Associar agora</Link></span></div>
        )}

        {res.status === 'ok' && (
          <>
            <div className="dark-kpis">
              <div className="dark-kpi k-orange"><small>Investimento</small><strong>{brl(t.spend)}</strong></div>
              <div className="dark-kpi k-blue"><small>Cliques</small><strong>{int(t.clicks)}</strong></div>
              <div className="dark-kpi"><small>Impressões</small><strong>{int(t.impressions)}</strong></div>
              <div className="dark-kpi k-blue"><small>CTR</small><strong>{pct(t.ctr)}</strong></div>
              <div className="dark-kpi k-orange"><small>CPC</small><strong>{brl(t.cpc)}</strong></div>
              <div className="dark-kpi"><small>CPM</small><strong>{brl(t.cpm)}</strong></div>
            </div>

            {rows.length === 0 ? (
              <p className="empty" style={{ background: 'transparent', color: '#8aa3bc', borderColor: '#17405f' }}>Sem dados de anúncios neste recorte e período.</p>
            ) : (
              <div className="dark-table">
                <table>
                  <thead>
                    <tr>
                      <th>{view === 'conta' ? 'Conta' : 'Campanha'}</th>{view === 'campanha' && <th>Conta</th>}
                      <th className="num">Investimento</th><th className="num">Cliques</th><th className="num">Impressões</th><th className="num">CTR</th><th className="num">CPC</th><th className="num">CPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ k, t: x }) => {
                      const [a, b] = k.split('\u0000')
                      return (
                        <tr key={k}>
                          <td><b>{a}</b></td>{view === 'campanha' && <td>{b}</td>}
                          <td className="num">{brl(x.spend)}</td><td className="num">{int(x.clicks)}</td><td className="num">{int(x.impressions)}</td>
                          <td className="num">{pct(x.ctr)}</td><td className="num">{brl(x.cpc)}</td><td className="num">{brl(x.cpm)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted" style={{ marginTop: 12, color: '#8aa3bc' }}>Conversões, receita e ROAS não são exibidos: dependem de rastreamento que ainda não está conectado. Nenhuma venda é atribuída a uma campanha sem esse rastreamento.</p>
          </>
        )}
      </div>
    </>
  )
}
