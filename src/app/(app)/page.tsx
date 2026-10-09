import Link from 'next/link'
import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2, Megaphone, Plus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { FormatBadge, StageBadge } from '@/components/badges'
import { MonthSelect } from '@/components/month-select'
import { requireUser } from '@/lib/auth'
import { getDashboard } from '@/lib/data'
import { FORMATS, MONTH_NAMES, STAGES, STAGE_ORDER, formatBR, parseMonth, todayISO, type Format } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string; 'sem-permissao'?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const today = todayISO()
  const { year, month } = parseMonth(sp.m, today)
  const ym = `${year}-${String(month).padStart(2, '0')}`

  const data = await getDashboard({
    brandId: scope.brand?.id, branchId: scope.branch?.id, monthStart: `${ym}-01`, today,
    brands: scope.brands, branches: scope.branches,
  })
  const { month: m, rollup, weeks, overdue, upcoming, gaps, knowledge, campaigns } = data
  const variation = m.prevTotal > 0 ? ((m.total - m.prevTotal) / m.prevTotal) * 100 : null
  const published = m.byStage.publicado
  const maxWeek = Math.max(1, ...weeks.map((w) => w.n))
  const writable = canWrite(user.role)

  const alerts = [
    ...overdue.items.map((p) => ({ key: p.id, href: `/planejamento/conteudos/${p.id}`, text: `Atrasado desde ${formatBR(p.post_date)}: ${p.title} (${p.brand_name})` })),
    ...campaigns.endingSoon.map((c) => ({ key: c.id, href: `/campanhas?editar=${c.id}`, text: `Campanha termina em ${formatBR(c.ends_on)}: ${c.name} (${c.brand_name})` })),
    ...knowledge.items.map((k) => ({ key: k.id, href: `/gestao/base?editar=${k.id}`, text: `${k.expired ? 'Informação vencida' : 'Informação não confirmada'}: ${k.title} (${k.brand_name})` })),
    ...gaps.map((g) => ({ key: g, href: '/planejamento/gerar', text: g })),
  ]

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
              {(Object.keys(FORMATS) as Format[]).map((f) => <div key={f} className="mrow"><span>{FORMATS[f]}</span><b>{m.byFormat[f]}</b></div>)}
              <div className="mrow total"><span>Total</span><b className="v-blue">{m.total}</b></div>
            </div>
            <div className="metric-box">
              <h4>Andamento por etapa</h4>
              {STAGE_ORDER.map((s) => <div key={s} className="mrow"><span>{STAGES[s]}</span><b>{m.byStage[s]}</b></div>)}
              <div className="mrow total"><span>Publicados</span><b className="v-green">{m.total ? Math.round((published / m.total) * 100) : 0}%</b></div>
            </div>
          </div>
          <div className="panel-col">
            <h3>Por filial</h3>
            {rollup.map((r) => (
              <div key={r.brand.id} className="metric-box">
                <h4>{r.brand.name}</h4>
                {r.branches.length === 0
                  ? (Object.keys(FORMATS) as Format[]).map((f) => <div key={f} className="mrow"><span>{FORMATS[f]}</span><b>{r.formats[f]}</b></div>)
                  : (
                    <>
                      {r.branches.map((b) => <div key={b.id} className="mrow"><span>{b.name}</span><b>{b.total}</b></div>)}
                      <div className="mrow"><span>Todas as unidades</span><b>{r.shared}</b></div>
                    </>
                  )}
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
        <div className="kpi"><small>Atrasados</small><strong className={overdue.total ? 'v-red' : ''}>{overdue.total}</strong><em>não publicados com data passada</em><span className="ico"><AlertTriangle size={18} /></span></div>
        <div className="kpi"><small>Campanhas vigentes</small><strong className="v-blue">{campaigns.active}</strong><em>{campaigns.endingSoon.length} terminam em 7 dias</em><span className="ico blue"><Megaphone size={18} /></span></div>
        <div className="kpi"><small>Pendências da base</small><strong className={knowledge.total ? 'v-amber' : ''}>{knowledge.total}</strong><em>vencidas ou não confirmadas</em><span className="ico amber"><BookOpen size={18} /></span></div>
        <div className="kpi"><small>Publicados no mês</small><strong className="v-green">{published}</strong><em>de {m.total} planejados</em><span className="ico green"><CheckCircle2 size={18} /></span></div>
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
                    <td><Link href={`/planejamento/conteudos/${p.id}`}>{p.title}</Link><br /><small className="muted">{p.brand_name} · {p.branch_name ?? 'Todas as unidades'}</small></td>
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
