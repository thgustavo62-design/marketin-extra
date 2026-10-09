import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getBrands, listPosts } from '@/lib/data'
import { FORMATS, MONTH_NAMES, STAGES, WEEKDAYS, monthGrid, parseMonth, shiftMonth, todayISO } from '@/lib/domain'

type SP = { m?: string; rede?: string; q?: string; etapa?: string }

export default async function Calendario({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser()
  const sp = await searchParams
  const today = todayISO()
  const { year, month } = parseMonth(sp.m, today)
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const weeks = monthGrid(year, month)
  const from = weeks[0][0].iso
  const to = weeks[weeks.length - 1][6].iso
  const brands = await getBrands()
  const stage = sp.etapa && sp.etapa in STAGES ? sp.etapa : undefined
  const posts = await listPosts({ brand: sp.rede, q: sp.q?.trim() || undefined, stage, from, to })

  const byDay = new Map<string, typeof posts>()
  for (const p of posts) byDay.set(p.post_date, [...(byDay.get(p.post_date) ?? []), p])

  const keep = (m: string) => {
    const u = new URLSearchParams()
    u.set('m', m)
    if (sp.rede) u.set('rede', sp.rede)
    if (sp.q) u.set('q', sp.q)
    if (stage) u.set('etapa', stage)
    return `/calendario?${u}`
  }
  const exportQs = new URLSearchParams({ from: `${ym}-01`, to: weeks.flat().filter((c) => c.inMonth).at(-1)!.iso })
  if (sp.rede) exportQs.set('rede', sp.rede)
  if (sp.q) exportQs.set('q', sp.q)
  if (stage) exportQs.set('etapa', stage)
  const newQs = (iso: string) => `/conteudos/novo?data=${iso}${sp.rede ? `&rede=${sp.rede}` : ''}`

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Calendário editorial</h1>
          <p>Datas de planejamento. Não representam agendamento na Meta.</p>
        </div>
        <Link href={newQs(today)} className="btn primary-link">Novo conteúdo</Link>
      </header>

      <form className="filters" method="get">
        <input type="hidden" name="m" value={ym} />
        <select name="rede" defaultValue={sp.rede ?? ''} aria-label="Rede">
          <option value="">Todas as redes</option>
          {brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
        </select>
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
                <Link href={newQs(c.iso)} className="add" aria-label={`Novo conteúdo em ${c.iso}`}>+</Link>
              </div>
              {items.map((p) => (
                <Link key={p.id} href={`/conteudos/${p.id}`} className={`chip fmt-${p.format} stage-${p.stage}`} title={`${p.brand_name} · ${FORMATS[p.format]} · ${STAGES[p.stage]}`}>
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
