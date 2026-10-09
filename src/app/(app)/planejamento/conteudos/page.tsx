import Link from 'next/link'
import { Plus } from 'lucide-react'
import { FormatBadge, StageBadge } from '@/components/badges'
import { requireUser } from '@/lib/auth'
import { countPosts, listPostsLite } from '@/lib/data'
import { FORMATS, PILLARS, STAGES, formatBR } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'

type SP = { q?: string; etapa?: string; formato?: string; p?: string }

const PAGE_SIZE = 50

export default async function Conteudos({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const stage = sp.etapa && sp.etapa in STAGES ? sp.etapa : undefined
  const format = sp.formato && sp.formato in FORMATS ? sp.formato : undefined
  const q = sp.q?.trim() || undefined
  const filter = { brand: scope.brand?.slug, branchId: scope.branch?.id, q, stage, format }
  const total = await countPosts(filter)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number(sp.p) || 1))
  const posts = await listPostsLite(filter, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const pageHref = (n: number) => {
    const u = new URLSearchParams()
    if (q) u.set('q', q)
    if (stage) u.set('etapa', stage)
    if (format) u.set('formato', format)
    u.set('p', String(n))
    return `/planejamento/conteudos?${u}`
  }

  const exportQs = new URLSearchParams()
  if (scope.brand) exportQs.set('rede', scope.brand.slug)
  if (scope.branch) exportQs.set('filial', scope.branch.id)
  if (q) exportQs.set('q', q)
  if (stage) exportQs.set('etapa', stage)
  if (format) exportQs.set('formato', format)

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Conteúdos</h1>
          <p>{scopeLabel(scope)} · {total} {total === 1 ? 'conteúdo' : 'conteúdos'} com os filtros atuais.</p>
        </div>
        {canWrite(user.role) && <Link href="/planejamento/conteudos/novo" className="btn primary-link"><Plus size={16} /> Novo conteúdo</Link>}
      </header>

      <form className="filters" method="get">
        <select name="formato" defaultValue={format ?? ''} aria-label="Formato">
          <option value="">Todos os formatos</option>
          {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="etapa" defaultValue={stage ?? ''} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="search" name="q" placeholder="Buscar título, legenda ou roteiro" defaultValue={sp.q ?? ''} aria-label="Buscar" />
        <button type="submit" className="secondary">Filtrar</button>
        <a className="btn" href={`/api/export/conteudos?${exportQs}`}>Exportar CSV</a>
      </form>

      {posts.length === 0 ? (
        <p className="empty">Nenhum conteúdo encontrado. Crie um em “Novo conteúdo” ou use “Gerar semana”.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Data</th><th>Título</th><th>Filial / unidade</th><th>Formato</th><th>Pilar</th><th>Etapa</th></tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>{formatBR(p.post_date)}{p.post_time ? ` ${p.post_time}` : ''}</td>
                  <td><Link href={`/planejamento/conteudos/${p.id}`}>{p.title}</Link></td>
                  <td>{p.brand_name}<br /><small className="muted">{p.branch_name ?? 'Todas as unidades'}</small></td>
                  <td><FormatBadge format={p.format} /></td>
                  <td>{PILLARS[p.pillar]}</td>
                  <td><StageBadge stage={p.stage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="Paginação">
          {page > 1 && <Link href={pageHref(page - 1)} className="btn">← Anterior</Link>}
          <span className="muted">Página {page} de {pages}</span>
          {page < pages && <Link href={pageHref(page + 1)} className="btn">Próxima →</Link>}
        </nav>
      )}
    </>
  )
}
