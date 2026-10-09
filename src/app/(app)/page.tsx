import Link from 'next/link'
import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2, Megaphone, Plus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { FormatBadge, StageBadge } from '@/components/badges'
import { MonthSelect } from '@/components/month-select'
import { requireUser } from '@/lib/auth'
import { getCampaigns, listKnowledge, listPosts } from '@/lib/data'
import { FORMATS, MONTH_NAMES, STAGES, STAGE_ORDER, addDays, formatBR, isExpired, parseMonth, shiftMonth, todayISO, type Format } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'

const mondayOf = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  return addDays(iso, -((d.getUTCDay() + 6) % 7))
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string; 'sem-permissao'?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const today = todayISO()
  const { year, month } = parseMonth(sp.m, today)
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const prevYm = shiftMonth(year, month, -1)

  const [posts, allCampaigns, allKnowledge] = await Promise.all([
    listPosts({ brand: scope.brand?.slug, branchId: scope.branch?.id }),
    getCampaigns(),
    listKnowledge(),
  ])
  const campaigns = scope.brand ? allCampaigns.filter((c) => c.brand_id === scope.brand!.id) : allCampaigns
  const knowledge = scope.brand ? allKnowledge.filter((k) => k.brand_id === scope.brand!.id) : allKnowledge

  const monthPosts = posts.filter((p) => p.post_date.startsWith(ym))
  const prevCount = posts.filter((p) => p.post_date.startsWith(prevYm)).length
  const variation = prevCount > 0 ? ((monthPosts.length - prevCount) / prevCount) * 100 : null
  const byFormat = (f: Format) => monthPosts.filter((p) => p.format === f).length
  const byStage = (s: string) => monthPosts.filter((p) => p.stage === s).length
  const published = byStage('publicado')

  // Rede › filial
  const brandsShown = scope.brand ? scope.brands.filter((b) => b.id === scope.brand!.id) : scope.brands
  const rollup = brandsShown.map((b) => {
    const mine = monthPosts.filter((p) => p.brand_id === b.id)
    const branches = scope.branches.filter((x) => x.brand_id === b.id && x.active)
    return {
      brand: b,
      total: mine.length,
      shared: mine.filter((p) => !p.branch_id).length,
      branches: branches.map((x) => ({ id: x.id, name: x.name, total: mine.filter((p) => p.branch_id === x.id).length })),
    }
  })

  // Conteúdos por semana (8 semanas a partir da atual)
  const week0 = mondayOf(today)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = addDays(week0, i * 7)
    const to = addDays(from, 6)
    return { from, n: posts.filter((p) => p.post_date >= from && p.post_date <= to).length }
  })
  const maxWeek = Math.max(1, ...weeks.map((w) => w.n))

  // Pendências
  const overdue = posts.filter((p) => p.post_date < today && p.stage !== 'publicado')
  const ending = campaigns.filter((c) => c.ends_on >= today && c.ends_on <= addDays(today, 7))
  const active = campaigns.filter((c) => c.starts_on <= today && c.ends_on >= today)
  const staleInfo = knowledge.filter((k) => isExpired(k.valid_until, today) || !k.confirmed)
  const gaps: string[] = []
  for (const b of brandsShown) {
    for (let w = 0; w < 3; w++) {
      const from = addDays(today, w * 7)
      const to = addDays(from, 6)
      if (!posts.some((p) => p.brand_id === b.id && p.post_date >= from && p.post_date <= to)) {
        gaps.push(`${b.name}: sem conteúdo de ${formatBR(from)} a ${formatBR(to)}`)
      }
    }
  }
  const alerts = [
    ...overdue.map((p) => ({ key: p.id, href: `/planejamento/conteudos/${p.id}`, text: `Atrasado desde ${formatBR(p.post_date)}: ${p.title} (${p.brand_name})` })),
    ...ending.map((c) => ({ key: c.id, href: `/campanhas?editar=${c.id}`, text: `Campanha termina em ${formatBR(c.ends_on)}: ${c.name} (${c.brand_name})` })),
    ...staleInfo.map((k) => ({ key: k.id, href: `/gestao/base?editar=${k.id}`, text: `${isExpired(k.valid_until, today) ? 'Informação vencida' : 'Informação não confirmada'}: ${k.title} (${k.brand_name})` })),
    ...gaps.map((g) => ({ key: g, href: '/planejamento/gerar', text: g })),
  ]
  const upcoming = posts.filter((p) => p.post_date >= today && p.stage !== 'publicado').slice(0, 8)
  const writable = canWrite(user.role)

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral do planejamento — {MONTH_NAMES[month - 1]} de {year} · {scopeLabel(scope)}</p>
        </div>
        <MonthSelect value={ym} />
      </header>

      {sp['sem-permissao'] && <div className="notice" role="alert"><AlertTriangle size={18} /> Seu perfil não tem permissão para essa área.</div>}

      <div className="panel">
        <div className="panel-banner">
          <div className="tile"><CalendarDays size={20} /></div>
          <div>
            <h2>Planejamento do mês</h2>
            <small>{MONTH_NAMES[month - 1]} de {year}</small>
          </div>
          <div className="right">
            {variation !== null && (
              <span className={`pill-light${variation >= 0 ? ' up' : ''}`}>
                {variation >= 0 ? <TrendingUp size={12} style={{ verticalAlign: '-2px' }} /> : <TrendingDown size={12} style={{ verticalAlign: '-2px' }} />} vs. mês anterior {variation >= 0 ? '+' : ''}{variation.toFixed(1).replace('.', ',')}%
              </span>
            )}
          </div>
        </div>
        <div className="panel-body">
          <div className="panel-col">
            <h3>Composição do planejamento</h3>
            <div className="metric-box">
              <h4>Conteúdos do mês</h4>
              {(Object.keys(FORMATS) as Format[]).map((f) => <div key={f} className="mrow"><span>{FORMATS[f]}</span><b>{byFormat(f)}</b></div>)}
              <div className="mrow total"><span>Total</span><b className="v-blue">{monthPosts.length}</b></div>
            </div>
            <div className="metric-box">
              <h4>Andamento por etapa</h4>
              {STAGE_ORDER.map((s) => <div key={s} className="mrow"><span>{STAGES[s]}</span><b>{byStage(s)}</b></div>)}
              <div className="mrow total"><span>Publicados</span><b className="v-green">{monthPosts.length ? Math.round((published / monthPosts.length) * 100) : 0}%</b></div>
            </div>
          </div>
          <div className="panel-col">
            <h3>Por rede e filial</h3>
            {rollup.map((r) => (
              <div key={r.brand.id} className="metric-box">
                <h4>{r.brand.name}</h4>
                {r.branches.length === 0 && <div className="mrow"><span>Nenhuma filial cadastrada</span><b>—</b></div>}
                {r.branches.map((b) => <div key={b.id} className="mrow"><span>{b.name}</span><b>{b.total}</b></div>)}
                <div className="mrow"><span>Todas as filiais</span><b>{r.shared}</b></div>
                <div className="mrow total"><span>Total</span><b className="v-blue">{r.total}</b></div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel-col" style={{ borderTop: '1px solid var(--line)' }}>
          <h3>Conteúdos por semana — próximas 8 semanas</h3>
          <div className="bars" role="img" aria-label="Conteúdos planejados por semana">
            {weeks.map((w) => (
              <div key={w.from} className="bar">
                <b>{w.n}</b>
                <i className={w.n === 0 ? 'zero' : ''} style={{ height: `${Math.max(3, (w.n / maxWeek) * 100)}%` }} />
                <span>{w.from.slice(8)}/{w.from.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="kpis" aria-label="Indicadores">
        <div className="kpi"><small>Atrasados</small><strong className={overdue.length ? 'v-red' : ''}>{overdue.length}</strong><em>não publicados com data passada</em><span className="ico"><AlertTriangle size={18} /></span></div>
        <div className="kpi"><small>Campanhas vigentes</small><strong className="v-blue">{active.length}</strong><em>{ending.length} terminam em 7 dias</em><span className="ico blue"><Megaphone size={18} /></span></div>
        <div className="kpi"><small>Pendências da base</small><strong className={staleInfo.length ? 'v-amber' : ''}>{staleInfo.length}</strong><em>vencidas ou não confirmadas</em><span className="ico amber"><BookOpen size={18} /></span></div>
        <div className="kpi"><small>Publicados no mês</small><strong className="v-green">{published}</strong><em>de {monthPosts.length} planejados</em><span className="ico green"><CheckCircle2 size={18} /></span></div>
      </section>

      {writable && (
        <section className="head-tools" aria-label="Atalhos" style={{ marginBottom: 26 }}>
          <Link href="/planejamento/conteudos/novo" className="btn primary-link"><Plus size={16} /> Novo conteúdo</Link>
          <Link href="/campanhas#form" className="btn"><Megaphone size={16} /> Nova campanha</Link>
          <Link href="/planejamento/gerar" className="btn"><Sparkles size={16} /> Gerar semana</Link>
        </section>
      )}

      <section aria-labelledby="prox">
        <h2 id="prox" className="eyebrow">Próximos conteúdos</h2>
        {upcoming.length === 0 ? (
          <p className="empty">Nada planejado daqui para frente. Crie um conteúdo ou use “Gerar semana”.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {upcoming.map((p) => (
                  <tr key={p.id}>
                    <td>{formatBR(p.post_date)}</td>
                    <td><Link href={`/planejamento/conteudos/${p.id}`}>{p.title}</Link><br /><small className="muted">{p.brand_name} · {p.branch_name ?? 'Todas as filiais'}</small></td>
                    <td><FormatBadge format={p.format} /></td>
                    <td><StageBadge stage={p.stage} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="pend">
        <h2 id="pend" className="eyebrow">Pendências {alerts.length > 0 && <span className="count">{alerts.length}</span>}</h2>
        {alerts.length === 0 ? (
          <p className="empty">Nenhuma pendência.</p>
        ) : (
          <ul className="alerts">
            {alerts.slice(0, 12).map((a) => <li key={a.key}><Link href={a.href}>{a.text}</Link></li>)}
          </ul>
        )}
      </section>
    </>
  )
}
