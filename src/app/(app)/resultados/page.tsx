import Link from 'next/link'
import { Suspense } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { MetricCard } from '@/components/metric-card'
import { WindsorNotice } from '@/components/windsor-notice'
import { requireUser } from '@/lib/auth'
import { brl } from '@/lib/windsor'
import { PERIOD_DAYS, compact, dailySeries, isPeriodDays, ratio, ratioSeries, sum, variation, shortDate } from '@/lib/insights/calc'
import { MESSAGES_FIELD, currentFollowers, loadAdsInsights, loadInstagramInsights } from '@/lib/insights/server'
import { getScope, scopeLabel, type Scope } from '@/lib/scope'

type SP = { d?: string }

const scopeIds = (s: Scope) => ({ brandId: s.brand?.id, branchId: s.branch?.id, brands: s.brands })

function Skeleton() {
  return (
    <div className="mgrid" aria-busy="true" aria-label="Carregando indicadores">
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="mcard skeleton" />)}
    </div>
  )
}

async function InstagramSection({ d, scope }: { d: number; scope: Scope }) {
  const r = await loadInstagramInsights(d, scopeIds(scope))
  if (!r.ok) return <WindsorNotice result={r.result} />
  const { range, cur, prev, unmapped, canCompare, notes } = r
  const S = (f: string) => dailySeries(cur, f, range.from, range.to)
  const T = (f: string) => sum(cur, f)
  const P = (f: string) => sum(prev, f)
  const V = (f: string) => (canCompare ? variation(T(f), P(f)) : null)
  const followers = currentFollowers(cur)
  const noData = cur.length === 0
  return (
    <>
      {unmapped.length > 0 && (
        <div className="notice"><AlertTriangle size={18} /><span>Conta(s) sem filial identificada: <b>{unmapped.join(', ')}</b>. <Link href="/configuracoes/integracoes" style={{ textDecoration: 'underline' }}>Ver integrações</Link></span></div>
      )}
      {noData ? (
        <p className="empty">Nenhuma conta de Instagram conectada para {scopeLabel(scope)} neste período.</p>
      ) : (
        <div className="mgrid">
          <MetricCard title="Visualizações" hint="Quantas vezes seu conteúdo foi visto (inclui repetições)." value={T('views')} prevValue={P('views')} variation={V('views')} series={S('views')}
            split={[{ label: 'de seguidores', value: compact(T('views_followers')) }, { label: 'de não seguidores', value: compact(T('views_non_followers')) }]} />
          <MetricCard title="Visualizadores (alcance)" hint="Contas diferentes que viram seu conteúdo. A soma dos dias pode contar a mesma pessoa mais de uma vez." value={T('reach')} prevValue={P('reach')} variation={V('reach')} series={S('reach')}
            split={[{ label: 'seguidores', value: compact(T('reach_followers')) }, { label: 'não seguidores', value: compact(T('reach_non_followers')) }]} />
          <MetricCard title="Interações com o conteúdo" hint="Curtidas, comentários, compartilhamentos e salvamentos." value={T('total_interactions')} prevValue={P('total_interactions')} variation={V('total_interactions')} series={S('total_interactions')}
            split={[{ label: 'curtidas', value: compact(T('likes')) }, { label: 'comentários', value: compact(T('comments')) }, { label: 'compart.', value: compact(T('shares')) }, { label: 'salvam.', value: compact(T('saves')) }]} />
          <MetricCard title="Cliques no link do perfil" hint="Toques nos links da bio." value={T('profile_links_taps')} prevValue={P('profile_links_taps')} variation={V('profile_links_taps')} series={S('profile_links_taps')} />
          <MetricCard title="Contas engajadas" hint="Contas que interagiram com seu conteúdo." value={T('accounts_engaged')} prevValue={P('accounts_engaged')} variation={V('accounts_engaged')} series={S('accounts_engaged')} />
          <MetricCard title="Seguidores" hint="Novos seguidores no período; o total atual aparece ao lado." value={T('follower_count')}  variation={null} series={S('follower_count')}
            split={followers === null ? undefined : [{ label: 'seguidores no total', value: followers.toLocaleString('pt-BR') }]} />
        </div>
      )}
      {notes.map((n) => <p key={n} className="muted" style={{ marginTop: 8 }}>{n}</p>)}
      <p className="muted" style={{ marginTop: 10 }}>
        Visitas ao perfil não aparecem: a API do Instagram não as entrega por dia para esta conta. Comparação sempre com os {range.days} dias anteriores ({shortDate(range.prevFrom)} a {shortDate(range.prevTo)}).
      </p>
    </>
  )
}

async function AdsSection({ d, scope }: { d: number; scope: Scope }) {
  const r = await loadAdsInsights(d, scopeIds(scope))
  if (!r.ok) return <WindsorNotice result={r.result} />
  const { range, cur, prev, canCompare } = r
  if (cur.length === 0) return <p className="empty">Nenhuma conta de anúncios conectada para {scopeLabel(scope)} neste período.</p>
  const S = (f: string) => dailySeries(cur, f, range.from, range.to)
  const T = (f: string) => sum(cur, f)
  const P = (f: string) => sum(prev, f)
  const V = (f: string) => (canCompare ? variation(T(f), P(f)) : null)
  const cpm = ratio(T('spend'), T('impressions'), 1000), cpmP = ratio(P('spend'), P('impressions'), 1000)
  const cpl = ratio(T('spend'), T(MESSAGES_FIELD)), cplP = ratio(P('spend'), P(MESSAGES_FIELD))
  const money = (n: number) => brl(n)
  return (
    <div className="mgrid">
      <MetricCard title="Investimento" hint="Quanto foi gasto em anúncios." value={T('spend')} prevValue={P('spend')} variation={V('spend')} series={S('spend')} format={money} color="#f59f3d" goodWhen="up" />
      <MetricCard title="Conversas iniciadas" hint="Conversas de mensagem (WhatsApp/Messenger) iniciadas pelos anúncios, com atribuição de 7 dias." value={T(MESSAGES_FIELD)} prevValue={P(MESSAGES_FIELD)} variation={V(MESSAGES_FIELD)} series={S(MESSAGES_FIELD)} />
      <MetricCard title="Cliques no link" value={T('link_clicks')} prevValue={P('link_clicks')} variation={V('link_clicks')} series={S('link_clicks')} />
      <MetricCard title="Impressões" value={T('impressions')} prevValue={P('impressions')} variation={V('impressions')} series={S('impressions')} />
      <MetricCard title="Custo por conversa" hint="Investimento ÷ conversas iniciadas. Menor é melhor." value={cpl} prevValue={cplP} variation={canCompare ? variation(cpl, cplP) : null} series={ratioSeries(cur, 'spend', MESSAGES_FIELD, range.from, range.to)} format={(n) => (n > 0 ? money(n) : '—')} goodWhen="down" color="#f59f3d" />
      <MetricCard title="CPM" hint="Custo por mil impressões. Menor é melhor." value={cpm} prevValue={cpmP} variation={canCompare ? variation(cpm, cpmP) : null} series={ratioSeries(cur, 'spend', 'impressions', range.from, range.to, 1000)} format={money} goodWhen="down" color="#f59f3d" />
    </div>
  )
}

export default async function Insights({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser()
  const sp = await searchParams
  const n = Number(sp.d)
  const d = isPeriodDays(n) ? n : 28
  const scope = await getScope()
  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Insights</h1>
          <p>{scopeLabel(scope)} · resultados de Instagram e anúncios (Meta), lidos do Windsor. Variação em relação ao período anterior.</p>
        </div>
        <nav className="tabs" aria-label="Período">
          {PERIOD_DAYS.map((x) => <Link key={x} href={`/resultados?d=${x}`} className={`tab${x === d ? ' active' : ''}`}>Últimos {x} dias</Link>)}
        </nav>
      </header>

      <section aria-labelledby="ig">
        <h2 id="ig" className="eyebrow">Instagram <a className="btn tiny" href={`/api/export/insights?tipo=instagram&d=${d}`}><Download size={13} /> Exportar CSV</a></h2>
        <Suspense fallback={<Skeleton />}><InstagramSection d={d} scope={scope} /></Suspense>
      </section>

      <section aria-labelledby="ads">
        <h2 id="ads" className="eyebrow">Anúncios (Meta Ads) <a className="btn tiny" href={`/api/export/insights?tipo=anuncios&d=${d}`}><Download size={13} /> Exportar CSV</a></h2>
        <Suspense fallback={<Skeleton />}><AdsSection d={d} scope={scope} /></Suspense>
      </section>
    </>
  )
}
