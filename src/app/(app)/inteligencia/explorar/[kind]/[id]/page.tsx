import Link from 'next/link'
import { notFound } from 'next/navigation'
import { rowAllowed } from '@/lib/access'
import { requireUser } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { OBJ_LABEL, getObjectView, isObjKind, type ObjKind } from '@/lib/intelligence/objects'

const TABLE: Record<ObjKind, 'campaigns' | 'posts' | 'external_publications'> = { campanha: 'campaigns', conteudo: 'posts', publicacao: 'external_publications' }

export default async function Explorar({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireUser()
  const { kind, id } = await params
  if (!isObjKind(kind) || !isUuid(id)) notFound()
  // Mesmo controle de filial de todo o sistema: sem acesso, é como se não existisse.
  if (!(await rowAllowed(user, TABLE[kind], id))) notFound()
  const v = await getObjectView(kind, id)
  if (!v) notFound()

  return (
    <>
      <header className="page-head">
        <p className="muted"><Link href="/inteligencia?aba=explorar" className="inline-link">← Explorar</Link> · {OBJ_LABEL[v.kind]} · {v.brandName}</p>
        <h1>{v.title}</h1>
        <p>{v.subtitle}</p>
        <p>{v.badges.map((b) => <span key={b} className="pill soft">{b}</span>)}</p>
      </header>

      <section className="kpis" aria-label="Resumo">
        {v.stats.map((s) => <div key={s.label} className="kpi" data-stat={s.label}><small>{s.label}</small><strong className="stat-value">{s.value}</strong></div>)}
      </section>

      <section aria-labelledby="rels">
        <h2 id="rels" className="eyebrow">Objetos ligados</h2>
        <div className="cards">
          {v.relations.map((r) => (
            <article key={r.label} className="card" data-relation={r.label}>
              <h3>{r.label} <span className="count">{r.total}</span></h3>
              {r.items.length === 0 ? <p className="muted">Nenhum.</p> : (
                <ul className="rel-list">
                  {r.items.map((i, k) => (
                    <li key={k}>{i.href.startsWith('http') ? <a href={i.href} target="_blank" rel="noopener noreferrer" className="inline-link">{i.title}</a> : <Link href={i.href} className="inline-link">{i.title}</Link>}<br /><small className="muted">{i.meta}</small></li>
                  ))}
                </ul>
              )}
              {r.total > r.items.length && <p className="muted">Mostrando {r.items.length} de {r.total}.</p>}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="tl">
        <h2 id="tl" className="eyebrow">Linha do tempo</h2>
        {v.timeline.length === 0 ? <p className="empty">Sem eventos registrados.</p> : (
          <ol className="events timeline">
            {v.timeline.map((t, i) => <li key={i}><small className="muted">{t.at}</small> · {t.href ? <Link href={t.href} className="inline-link">{t.text}</Link> : t.text}</li>)}
          </ol>
        )}
      </section>
    </>
  )
}
