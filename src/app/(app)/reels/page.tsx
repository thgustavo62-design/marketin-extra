import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getBrands, listPosts } from '@/lib/data'
import { STAGES, STAGE_ORDER, formatBR } from '@/lib/domain'

export default async function ReelsStudio({ searchParams }: { searchParams: Promise<{ rede?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const brands = await getBrands()
  const posts = await listPosts({ brand: sp.rede, format: 'reels' })
  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Estúdio de Reels</h1>
          <p>Reels por etapa. Abra um item para editar gancho, cenas, fala, texto na tela e chamada para ação.</p>
        </div>
        <Link href="/conteudos/novo" className="btn primary-link">Novo conteúdo</Link>
      </header>
      <form className="filters" method="get">
        <select name="rede" defaultValue={sp.rede ?? ''} aria-label="Rede">
          <option value="">Todas as redes</option>
          {brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
        </select>
        <button type="submit" className="secondary">Filtrar</button>
      </form>
      <div className="board">
        {STAGE_ORDER.map((s) => {
          const col = posts.filter((p) => p.stage === s)
          return (
            <section key={s} className="board-col" aria-label={STAGES[s]}>
              <h2 className="eyebrow">{STAGES[s]} <span>{col.length}</span></h2>
              {col.length === 0 && <p className="muted">Vazio</p>}
              {col.map((p) => {
                const filled = p.reels.scenes.filter((x) => x.scene || x.speech).length
                return (
                  <Link key={p.id} href={`/conteudos/${p.id}`} className="board-card">
                    <b>{p.title}</b>
                    <small>{p.brand_name} · {formatBR(p.post_date)}</small>
                    <small className="muted">{p.reels.hook ? 'Gancho definido' : 'Sem gancho'} · {filled}/{p.reels.scenes.length} cenas</small>
                  </Link>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}
