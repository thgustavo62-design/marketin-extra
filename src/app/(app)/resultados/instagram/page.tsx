import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { WindsorNotice } from '@/components/windsor-notice'
import { requireUser } from '@/lib/auth'
import { getIntegrationAccounts } from '@/lib/data'
import { actionRate, formatRate } from '@/lib/domain'
import { partitionByScope } from '@/lib/integrations'
import { getScope, scopeLabel } from '@/lib/scope'
import { DATE_PRESETS, int, isDatePreset, windsorQuery } from '@/lib/windsor'

type Daily = { account_name?: string; date?: string; reach?: number; followers_count?: number }
type Media = {
  account_name?: string; media_id?: string; media_type?: string; media_product_type?: string; timestamp?: string
  media_permalink?: string; media_caption?: string; media_reach?: number; media_saved?: number; media_shares?: number
  media_like_count?: number; media_comments_count?: number
}

export default async function InstagramResultados({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const preset = isDatePreset(sp.p) ? sp.p : 'last_30d'

  const [daily, media, maps] = await Promise.all([
    windsorQuery<Daily>('instagram', ['account_name', 'date', 'reach', 'followers_count'], preset),
    windsorQuery<Media>('instagram', ['account_name', 'media_id', 'media_type', 'media_product_type', 'timestamp', 'media_permalink', 'media_caption', 'media_reach', 'media_saved', 'media_shares', 'media_like_count', 'media_comments_count'], preset),
    getIntegrationAccounts(),
  ])
  const mapList = maps.map((m) => ({ account_name: m.account_name, kind: m.kind, brand_id: m.brand_id, branch_id: m.branch_id }))
  const ids = { brandId: scope.brand?.id, branchId: scope.branch?.id }
  const dPart = daily.status === 'ok' ? partitionByScope(daily.rows, 'instagram', mapList, ids) : { rows: [] as Daily[], unmapped: [] as string[] }
  const mPart = media.status === 'ok' ? partitionByScope(media.rows, 'instagram', mapList, ids) : { rows: [] as Media[], unmapped: [] as string[] }
  const unmapped = [...new Set([...dPart.unmapped, ...mPart.unmapped])]

  // seguidores: último valor não nulo de cada conta
  const lastFollowers = new Map<string, { date: string; n: number }>()
  for (const r of dPart.rows) {
    if (r.followers_count == null || !r.account_name) continue
    const prev = lastFollowers.get(r.account_name)
    if (!prev || (r.date ?? '') >= prev.date) lastFollowers.set(r.account_name, { date: r.date ?? '', n: r.followers_count })
  }
  const followers = [...lastFollowers.values()].reduce((s, x) => s + x.n, 0)
  const reachDaily = dPart.rows.reduce((s, r) => s + (Number(r.reach) || 0), 0)

  const posts = [...new Map(mPart.rows.filter((r) => r.media_id).map((r) => [r.media_id!, r])).values()]
    .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
  const sum = (f: (m: Media) => number | undefined) => posts.reduce((s, m) => s + (Number(f(m)) || 0), 0)
  const mReach = sum((m) => m.media_reach)
  const saves = sum((m) => m.media_saved)
  const shares = sum((m) => m.media_shares)
  const rate = actionRate(mReach, saves, shares)
  const ok = daily.status === 'ok' && media.status === 'ok'
  const status = daily.status !== 'ok' ? daily : media

  return (
    <>
      <header className="page-head">
        <h1>Instagram</h1>
        <p>{scopeLabel(scope)} · métricas oficiais lidas do Windsor (Meta). A taxa de ações úteis é a do painel: (salvamentos + compartilhamentos) ÷ alcance.</p>
      </header>

      <div className="dark-surface">
        <form className="filters" method="get">
          <select name="p" defaultValue={preset} aria-label="Período">
            {Object.entries(DATE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" className="btn">Aplicar</button>
        </form>

        <WindsorNotice result={ok ? { status: 'ok' } : status} />
        {unmapped.length > 0 && (
          <div className="notice"><AlertTriangle size={18} /><span>Conta(s) sem rede/filial associada: <b>{unmapped.join(', ')}</b>. <Link href="/configuracoes/integracoes" style={{ textDecoration: 'underline' }}>Associar agora</Link></span></div>
        )}

        {ok && (
          <>
            <div className="dark-kpis">
              <div className="dark-kpi k-blue"><small>Seguidores</small><strong>{lastFollowers.size ? int(followers) : '—'}</strong></div>
              <div className="dark-kpi"><small>Alcance (conta)</small><strong>{int(reachDaily)}</strong></div>
              <div className="dark-kpi"><small>Publicações</small><strong>{int(posts.length)}</strong></div>
              <div className="dark-kpi k-green"><small>Salvamentos</small><strong>{int(saves)}</strong></div>
              <div className="dark-kpi k-green"><small>Compartilhamentos</small><strong>{int(shares)}</strong></div>
              <div className="dark-kpi k-orange"><small>Ações úteis</small><strong>{formatRate(rate)}</strong></div>
            </div>

            {posts.length === 0 ? (
              <p className="empty" style={{ background: 'transparent', color: '#8aa3bc', borderColor: '#17405f' }}>Nenhuma publicação neste recorte e período.</p>
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
        )}
      </div>
    </>
  )
}
