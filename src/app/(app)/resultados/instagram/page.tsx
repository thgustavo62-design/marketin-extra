import Link from 'next/link'
import { Suspense } from 'react'
import { AlertTriangle } from 'lucide-react'
import { WindsorNotice } from '@/components/windsor-notice'
import { requireUser } from '@/lib/auth'
import { getIntegrationAccounts } from '@/lib/data'
import { addDays, actionRate, formatRate, todayISO } from '@/lib/domain'
import { PERIOD_DAYS, isPeriodDays, periodRange, compact } from '@/lib/insights/calc'
import { partitionByScope } from '@/lib/integrations'
import { getScope, scopeLabel, type Scope } from '@/lib/scope'
import { int, windsorQuery } from '@/lib/windsor'

type Media = {
  account_name?: string; media_id?: string; media_type?: string; media_product_type?: string; timestamp?: string
  media_permalink?: string; media_caption?: string; media_reach?: number; media_saved?: number; media_shares?: number
  media_like_count?: number; media_comments_count?: number
}
type Aud = { account_name?: string; [k: string]: unknown }

const ids = (s: Scope) => ({ brandId: s.brand?.id, branchId: s.branch?.id })
const Dark = ({ children }: { children: React.ReactNode }) => <p className="empty dark-empty">{children}</p>

async function Posts({ d, scope }: { d: number; scope: Scope }) {
  const range = periodRange(d, todayISO())
  const [res, maps] = await Promise.all([
    windsorQuery<Media>('instagram', ['account_name', 'media_id', 'media_type', 'media_product_type', 'timestamp', 'media_permalink', 'media_caption', 'media_reach', 'media_saved', 'media_shares', 'media_like_count', 'media_comments_count'], { from: addDays(range.from, 0), to: range.to }),
    getIntegrationAccounts(),
  ])
  if (res.status !== 'ok') return <WindsorNotice result={res} />
  const part = partitionByScope(res.rows, 'instagram', maps.map((m) => ({ account_name: m.account_name, kind: m.kind, brand_id: m.brand_id, branch_id: m.branch_id })), scope.brands, ids(scope))
  const posts = [...new Map(part.rows.filter((r) => r.media_id).map((r) => [r.media_id!, r])).values()].sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
  const sum = (f: (m: Media) => number | undefined) => posts.reduce((s, m) => s + (Number(f(m)) || 0), 0)
  const reach = sum((m) => m.media_reach), saves = sum((m) => m.media_saved), shares = sum((m) => m.media_shares)
  return (
    <>
      {part.unmapped.length > 0 && (
        <div className="notice"><AlertTriangle size={18} /><span>Conta(s) sem filial identificada: <b>{part.unmapped.join(', ')}</b>. <Link href="/configuracoes/integracoes" style={{ textDecoration: 'underline' }}>Ver integrações</Link></span></div>
      )}
      <div className="dark-kpis">
        <div className="dark-kpi"><small>Publicações</small><strong>{int(posts.length)}</strong></div>
        <div className="dark-kpi"><small>Alcance das publicações</small><strong>{compact(reach)}</strong></div>
        <div className="dark-kpi k-green"><small>Salvamentos</small><strong>{int(saves)}</strong></div>
        <div className="dark-kpi k-green"><small>Compartilhamentos</small><strong>{int(shares)}</strong></div>
        <div className="dark-kpi k-orange"><small>Ações úteis</small><strong>{formatRate(actionRate(reach, saves, shares))}</strong></div>
      </div>
      {posts.length === 0 ? (
        <Dark>Nenhuma publicação neste recorte e período.</Dark>
      ) : (
        <div className="dark-table">
          <table>
            <thead><tr><th>Data</th><th>Publicação</th><th>Tipo</th><th className="num">Alcance</th><th className="num">Salv.</th><th className="num">Comp.</th><th className="num">Curtidas</th><th className="num">Coment.</th><th className="num">Ações úteis</th></tr></thead>
            <tbody>
              {posts.map((m) => (
                <tr key={m.media_id}>
                  <td>{m.timestamp ? new Date(m.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</td>
                  <td>
                    {m.media_permalink ? <a href={m.media_permalink} target="_blank" rel="noopener noreferrer" style={{ color: '#7fc4ff' }}>{(m.media_caption ?? 'Ver publicação').replace(/\s+/g, ' ').slice(0, 70)}</a> : (m.media_caption ?? '—').slice(0, 70)}
                    <br /><small style={{ color: '#8aa3bc' }}>{m.account_name}</small>
                  </td>
                  <td>{m.media_product_type ?? m.media_type ?? '—'}</td>
                  <td className="num">{int(m.media_reach ?? null)}</td><td className="num">{int(m.media_saved ?? null)}</td><td className="num">{int(m.media_shares ?? null)}</td>
                  <td className="num">{int(m.media_like_count ?? null)}</td><td className="num">{int(m.media_comments_count ?? null)}</td>
                  <td className="num"><b>{formatRate(actionRate(m.media_reach ?? null, m.media_saved ?? null, m.media_shares ?? null))}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const GENDER: Record<string, string> = { F: 'Mulheres', M: 'Homens', U: 'Não informado' }
const regionName = (() => { try { return new Intl.DisplayNames('pt-BR', { type: 'region' }) } catch { return null } })()

function Bars({ title, items }: { title: string; items: { label: string; n: number }[] }) {
  const total = items.reduce((s, i) => s + i.n, 0)
  return (
    <article className="card dcard">
      <h3>{title}</h3>
      {total === 0 ? <p className="muted">Sem dados.</p> : (
        <ul className="hbars">
          {items.map((i) => (
            <li key={i.label}>
              <span>{i.label}</span>
              <i style={{ width: `${Math.max(2, (i.n / total) * 100)}%` }} />
              <b>{((i.n / total) * 100).toFixed(1).replace('.', ',')}%</b>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

async function Audience({ scope }: { scope: Scope }) {
  const [g, a, c, maps] = await Promise.all([
    windsorQuery<Aud>('instagram', ['account_name', 'audience_gender_name', 'audience_gender_size'], 'last_30d'),
    windsorQuery<Aud>('instagram', ['account_name', 'audience_age_name', 'audience_age_size'], 'last_30d'),
    windsorQuery<Aud>('instagram', ['account_name', 'audience_country_name', 'audience_country_size'], 'last_30d'),
    getIntegrationAccounts(),
  ])
  for (const r of [g, a, c]) if (r.status !== 'ok') return <WindsorNotice result={r} />
  const mapList = maps.map((m) => ({ account_name: m.account_name, kind: m.kind, brand_id: m.brand_id, branch_id: m.branch_id }))
  const agg = (r: { rows: Aud[] }, name: string, size: string, label: (k: string) => string) => {
    const part = partitionByScope(r.rows, 'instagram', mapList, scope.brands, ids(scope)).rows
    const m = new Map<string, number>()
    for (const row of part) { const k = String(row[name] ?? ''); if (k) m.set(k, (m.get(k) ?? 0) + (Number(row[size]) || 0)) }
    return [...m.entries()].map(([k, n]) => ({ key: k, label: label(k), n }))
  }
  const gender = agg(g as { rows: Aud[] }, 'audience_gender_name', 'audience_gender_size', (k) => GENDER[k] ?? k).sort((x, y) => y.n - x.n)
  const age = agg(a as { rows: Aud[] }, 'audience_age_name', 'audience_age_size', (k) => k).sort((x, y) => x.key.localeCompare(y.key, 'pt-BR', { numeric: true }))
  const country = agg(c as { rows: Aud[] }, 'audience_country_name', 'audience_country_size', (k) => regionName?.of(k) ?? k).sort((x, y) => y.n - x.n).slice(0, 6)
  return (
    <div className="cards">
      <Bars title="Gênero" items={gender} />
      <Bars title="Faixa etária" items={age} />
      <Bars title="Países" items={country} />
    </div>
  )
}

export default async function InstagramResultados({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const n = Number(sp.d)
  const d = isPeriodDays(n) ? n : 28
  const scope = await getScope()
  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Instagram</h1>
          <p>{scopeLabel(scope)} · publicações e público, lidos do Windsor (Meta). Ações úteis = (salvamentos + compartilhamentos) ÷ alcance.</p>
        </div>
        <nav className="tabs" aria-label="Período">
          {PERIOD_DAYS.map((x) => <Link key={x} href={`/resultados/instagram?d=${x}`} className={`tab${x === d ? ' active' : ''}`}>{x} dias</Link>)}
        </nav>
      </header>

      <div className="dark-surface">
        <h2 className="dark-h">Publicações</h2>
        <Suspense fallback={<div className="mcard skeleton dark-skel" />}><Posts d={d} scope={scope} /></Suspense>
      </div>

      <div className="dark-surface" style={{ marginTop: 18 }}>
        <h2 className="dark-h">Público <small>seguidores, últimos 30 dias</small></h2>
        <Suspense fallback={<div className="mcard skeleton dark-skel" />}><Audience scope={scope} /></Suspense>
      </div>
    </>
  )
}
