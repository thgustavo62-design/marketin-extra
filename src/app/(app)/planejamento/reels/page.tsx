import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { listPosts } from '@/lib/data'
import { STAGES, STAGE_ORDER, formatBR } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'

export default async function ReelsStudio() {
  const user = await requireUser()
  const scope = await getScope()
  const posts = await listPosts({ brand: scope.brand?.slug, branchId: scope.branch?.id, format: 'reels' })
  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Estúdio de Reels</h1>
          <p>{scopeLabel(scope)} · Reels por etapa. Abra um item para editar gancho, cenas, fala, texto na tela e chamada para ação.</p>
        </div>
        {canWrite(user.role) && <Link href="/planejamento/conteudos/novo" className="btn primary-link"><Plus size={16} /> Novo conteúdo</Link>}
      </header>
      <div className="board">
        {STAGE_ORDER.map((s) => {
          const col = posts.filter((p) => p.stage === s)
          return (
            <section key={s} className="board-col" aria-label={STAGES[s]}>
              <h2 className="eyebrow">{STAGES[s]} <span className="count">{col.length}</span></h2>
              {col.length === 0 && <p className="muted">Vazio</p>}
              {col.map((p) => {
                const filled = p.reels.scenes.filter((x) => x.scene || x.speech).length
                return (
                  <Link key={p.id} href={`/planejamento/conteudos/${p.id}`} className="board-card">
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
