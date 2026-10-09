import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { listPostsLite } from '@/lib/data'
import { FORMATS, MONTH_NAMES, STAGES, isStage, WEEKDAYS, monthGrid, parseMonth, shiftMonth, todayISO } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'

type SP = { m?: string; q?: string; etapa?: string }

export default async function Calendario({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const today = todayISO()
  const { year, month } = parseMonth(sp.m, today)
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const weeks = monthGrid(year, month)
  const from = weeks[0][0].iso
  const to = weeks[weeks.length - 1][6].iso
  const stage = isStage(sp.etapa) ? sp.etapa : undefined
  const q = sp.q?.trim() || undefined
  const posts = await listPostsLite({ brand: scope.brand?.slug, branchId: scope.branch?.id, q, stage, from, to }, { limit: 1500 })

  const byDay = new Map<string, typeof posts>()
  for (const p of posts) byDay.set(p.post_date, [...(byDay.get(p.post_date) ?? []), p])

  const keep = (m: string) => {
    const u = new URLSearchParams({ m })
    if (q) u.set('q', q)
    if (stage) u.set('etapa', stage)
    return `/planejamento/calendario?${u}`
  }
  const exportQs = new URLSearchParams({ from: `${ym}-01`, to: weeks.flat().filter((c) => c.inMonth).at(-1)!.iso })
  if (scope.brand) exportQs.set('rede', scope.brand.slug)
  if (scope.branch) exportQs.set('filial', scope.branch.id)
  if (q) exportQs.set('q', q)
  if (stage) exportQs.set('etapa', stage)
  const writable = canWrite(user.role)

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Calendário editorial</h1>
          <p>{scopeLabel(scope)} · datas de planejamento, não agendamento na Meta.</p>
        </div>
        {writable && <Link href="/planejamento/conteudos/novo" className="btn primary-link"><Plus size={16} /> Novo conteúdo</Link>}
      </header>

      <form className="filters" method="get">
        <input type="hidden" name="m" value={ym} />
        <select name="etapa" defaultValue={stage ?? ''} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="search" name="q" placeholder="Buscar título, legenda ou roteiro" defaultValue={sp.q ?? ''} aria-label="Buscar" />
        <button type="submit" className="secondary">Filtrar</button>
        <a className="btn" href={`/api/export/conteudos?${exportQs}`}>Exportar CSV</a>
      </form>

      <div className="month-nav">
        <Link href={keep(shiftMonth(year, month, -1))} aria-label="Mês anterior">←</Link>
        <h2>{MONTH_NAMES[month - 1]} de {year}</h2>
        <Link href={keep(shiftMonth(year, month, 1))} aria-label="Próximo mês">→</Link>
        <Link href={keep(today.slice(0, 7))} className="today-link">Hoje</Link>
      </div>

      <div className="calendar" role="grid" aria-label={`Calendário de ${MONTH_NAMES[month - 1]} de ${year}`}>
        {WEEKDAYS.map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
        {weeks.flat().map((c) => {
          const items = byDay.get(c.iso) ?? []
          return (
            <div key={c.iso} role="gridcell" className={`cal-cell${c.inMonth ? '' : ' out'}${c.iso === today ? ' today' : ''}`}>
              <div className="cal-day">
                <span>{c.day}</span>
                {writable && <Link href={`/planejamento/conteudos/novo?data=${c.iso}`} className="add" aria-label={`Novo conteúdo em ${c.iso}`}>+</Link>}
              </div>
              {items.map((p) => (
                <Link key={p.id} href={`/planejamento/conteudos/${p.id}`} className={`chip fmt-${p.format} stage-${p.stage}`} title={`${p.brand_name} · ${FORMATS[p.format]} · ${STAGES[p.stage]}`}>
                  <b>{p.brand_slug === 'minas-farma' ? 'MF' : 'FF'}</b> {p.title}
                </Link>
              ))}
            </div>
          )
        })}
      </div>
      <p className="muted legend">MF = Minas Farma · FF = Farma e Farma. Cor do chip = formato; contorno tracejado = ainda não aprovado.</p>
    </>
  )
}
