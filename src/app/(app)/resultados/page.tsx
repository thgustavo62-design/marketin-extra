import Link from 'next/link'
import { FormatBadge } from '@/components/badges'
import { requireUser } from '@/lib/auth'
import { listPosts, type Post } from '@/lib/data'
import { FORMATS, PILLARS, actionRate, formatBR, formatRate } from '@/lib/domain'
import { saveMetricsAction } from './actions'

function group(posts: Post[], key: (p: Post) => string) {
  const m = new Map<string, { n: number; reach: number; acts: number }>()
  for (const p of posts) {
    if (!p.reach) continue // sem alcance não entra na taxa
    const g = m.get(key(p)) ?? { n: 0, reach: 0, acts: 0 }
    g.n += 1
    g.reach += p.reach
    g.acts += (p.saves ?? 0) + (p.shares ?? 0)
    m.set(key(p), g)
  }
  return [...m.entries()].map(([k, g]) => ({ k, n: g.n, reach: g.reach, rate: actionRate(g.reach, g.acts, 0) }))
}

export default async function Resultados({ searchParams }: { searchParams: Promise<{ salvo?: string; erro?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const posts = (await listPosts({ onlyPublished: true })).reverse()

  const blocks = [
    { title: 'Por rede', rows: group(posts, (p) => p.brand_name) },
    { title: 'Por formato', rows: group(posts, (p) => FORMATS[p.format]) },
    { title: 'Por pilar', rows: group(posts, (p) => PILLARS[p.pillar]) },
  ]

  return (
    <>
      <header className="page-head">
        <h1>Resultados</h1>
        <p>
          Métricas preenchidas manualmente para conteúdos <b>publicados</b>. Taxa de ações úteis = (salvamentos + compartilhamentos) ÷ alcance × 100
          — indicador do painel, não a taxa oficial de engajamento do Instagram. Sem alcance, aparece “—”.
        </p>
        {sp.salvo && <p className="form-ok" role="status">Métricas salvas.</p>}
        {sp.erro && <p className="form-error" role="alert">Use apenas números inteiros (0 ou mais).</p>}
      </header>

      {posts.length === 0 ? (
        <p className="empty">Nenhum conteúdo publicado ainda. Mude a etapa de um conteúdo para “Publicado” em <Link href="/conteudos">Conteúdos</Link> para registrar resultados.</p>
      ) : (
        <>
          <section className="cards">
            {blocks.map((b) => (
              <article key={b.title} className="card">
                <h2 className="eyebrow">{b.title}</h2>
                {b.rows.length === 0 ? <p className="muted">Sem alcance registrado.</p> : (
                  <table className="mini"><tbody>
                    {b.rows.map((r) => (
                      <tr key={r.k}><td>{r.k}</td><td className="num">{formatRate(r.rate)}</td><td className="num muted">{r.n} pub.</td></tr>
                    ))}
                  </tbody></table>
                )}
              </article>
            ))}
          </section>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Conteúdo</th><th>Formato</th><th>Alcance</th><th>Salvam.</th><th>Compart.</th><th>Taxa</th><th /></tr></thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>{formatBR(p.post_date)}</td>
                    <td><Link href={`/conteudos/${p.id}`}>{p.title}</Link><br /><small className="muted">{p.brand_name}</small></td>
                    <td><FormatBadge format={p.format} /></td>
                    <td colSpan={3}>
                      <form action={saveMetricsAction} className="inline-metrics" id={`m-${p.id}`}>
                        <input type="hidden" name="id" value={p.id} />
                        <input name="reach" inputMode="numeric" defaultValue={p.reach ?? ''} aria-label="Alcance" placeholder="Alcance" />
                        <input name="saves" inputMode="numeric" defaultValue={p.saves ?? ''} aria-label="Salvamentos" placeholder="Salvam." />
                        <input name="shares" inputMode="numeric" defaultValue={p.shares ?? ''} aria-label="Compartilhamentos" placeholder="Compart." />
                        <button type="submit" className="secondary">Salvar</button>
                      </form>
                    </td>
                    <td className="num">{formatRate(actionRate(p.reach, p.saves, p.shares))}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
