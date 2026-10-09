import Link from 'next/link'
import { StageBadge, FormatBadge } from '@/components/badges'
import { requireUser } from '@/lib/auth'
import { getBrands, getCampaigns, listKnowledge, listPosts } from '@/lib/data'
import { addDays, formatBR, isExpired, todayISO } from '@/lib/domain'

export default async function Overview() {
  const user = await requireUser()
  const today = todayISO()
  const [brands, posts, campaigns, knowledge] = await Promise.all([getBrands(), listPosts(), getCampaigns(), listKnowledge()])

  const count = (f: (p: (typeof posts)[number]) => boolean) => posts.filter(f).length
  const stats = [
    { label: 'Conteúdos', value: posts.length },
    { label: 'Em produção', value: count((p) => p.stage === 'producao') },
    { label: 'Em revisão', value: count((p) => p.stage === 'revisao') },
    { label: 'Publicados', value: count((p) => p.stage === 'publicado') },
  ]
  const upcoming = posts.filter((p) => p.post_date >= today && p.stage !== 'publicado').slice(0, 8)

  // Pendências
  const overdue = posts.filter((p) => p.post_date < today && p.stage !== 'publicado')
  const ending = campaigns.filter((c) => c.ends_on >= today && c.ends_on <= addDays(today, 7))
  const staleInfo = knowledge.filter((k) => isExpired(k.valid_until, today) || !k.confirmed)
  const gaps: string[] = []
  for (const b of brands) {
    for (let w = 0; w < 3; w++) {
      const from = addDays(today, w * 7)
      const to = addDays(from, 6)
      if (!posts.some((p) => p.brand_id === b.id && p.post_date >= from && p.post_date <= to)) {
        gaps.push(`${b.name}: sem conteúdo de ${formatBR(from)} a ${formatBR(to)}`)
      }
    }
  }
  const alerts = [
    ...overdue.map((p) => ({ key: p.id, href: `/conteudos/${p.id}`, text: `Atrasado desde ${formatBR(p.post_date)}: ${p.title} (${p.brand_name})` })),
    ...ending.map((c) => ({ key: c.id, href: `/campanhas?editar=${c.id}`, text: `Campanha termina em ${formatBR(c.ends_on)}: ${c.name} (${c.brand_name})` })),
    ...staleInfo.map((k) => ({ key: k.id, href: `/base?editar=${k.id}`, text: `${isExpired(k.valid_until, today) ? 'Informação vencida' : 'Informação não confirmada'}: ${k.title} (${k.brand_name})` })),
    ...gaps.map((g) => ({ key: g, href: '/gerar', text: g })),
  ]

  return (
    <>
      <header className="page-head">
        <h1>Olá, {user.username}</h1>
        <p>Visão geral do planejamento · {formatBR(today)}</p>
      </header>

      <section className="stats" aria-label="Resumo">
        {stats.map((s) => (
          <div key={s.label} className="stat"><strong>{s.value}</strong><span>{s.label}</span></div>
        ))}
      </section>

      <section aria-label="Atalhos" className="shortcuts">
        <Link href="/conteudos/novo" className="btn primary-link">Novo conteúdo</Link>
        <Link href="/campanhas#form" className="btn">Nova campanha</Link>
        <Link href="/gerar" className="btn">Gerar semana</Link>
      </section>

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
                    <td><Link href={`/conteudos/${p.id}`}>{p.title}</Link><br /><small className="muted">{p.brand_name}</small></td>
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
