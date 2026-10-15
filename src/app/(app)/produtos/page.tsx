import Link from 'next/link'
import { ImageOff, Plus, Upload } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { catalogStats, listGroups, searchProducts } from '@/lib/catalog/store'
import { canWrite } from '@/lib/perms'

type SP = { q?: string; f?: string; g?: string; p?: string }
const PAGE_SIZE = 48

export default async function Produtos({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const q = sp.q?.trim() || undefined
  const filter = sp.f === 'com' || sp.f === 'sem' ? sp.f : 'todos'
  const group = sp.g?.trim() || undefined
  const page = Math.max(1, Number(sp.p) || 1)
  const [stats, groups, { rows, total }] = await Promise.all([
    catalogStats(), listGroups(), searchProducts({ q, filter, group, page, pageSize: PAGE_SIZE }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const href = (n: number) => {
    const u = new URLSearchParams()
    if (q) u.set('q', q); if (filter !== 'todos') u.set('f', filter); if (group) u.set('g', group)
    u.set('p', String(n))
    return `/produtos?${u}`
  }
  const write = canWrite(user.role)
  const pct = stats.products ? Math.round((stats.withImage / stats.products) * 100) : 0

  return (
    <>
      <header className="page-head">
        <h1>Banco de imagens de produtos</h1>
        <p>Um catálogo só para a rede toda, com a descrição do ERP. {stats.products.toLocaleString('pt-BR')} produtos · {stats.withImage.toLocaleString('pt-BR')} com imagem ({pct}%).</p>
      </header>

      <div className="kpis">
        <div className="kpi"><small>Produtos</small><strong>{stats.products.toLocaleString('pt-BR')}</strong><em>no cadastro do ERP</em></div>
        <div className="kpi"><small>Com imagem</small><strong>{stats.withImage.toLocaleString('pt-BR')}</strong><em>{pct}% do catálogo · {stats.images.toLocaleString('pt-BR')} imagens</em></div>
        <Link href="/produtos/conferir" className="kpi"><small>Para conferir</small><strong>{(stats.pending + stats.review).toLocaleString('pt-BR')}</strong><em>{stats.pending} sem produto · {stats.review} ligadas por semelhança</em></Link>
      </div>

      {write && (
        <div className="form-actions" style={{ margin: '0 0 12px' }}>
          <Link href="/produtos/importar" className="btn"><Upload size={14} /> Importar produtos e imagens</Link>
          <Link href="/produtos/novo" className="btn"><Plus size={14} /> Novo produto</Link>
        </div>
      )}

      <form className="filters" method="get">
        <input type="search" name="q" placeholder="Buscar por nome, código de barras, laboratório ou princípio ativo" defaultValue={q ?? ''} aria-label="Buscar" />
        <select name="f" defaultValue={filter} aria-label="Imagem">
          <option value="todos">Com e sem imagem</option>
          <option value="com">Só com imagem</option>
          <option value="sem">Só sem imagem</option>
        </select>
        <select name="g" defaultValue={group ?? ''} aria-label="Grupo">
          <option value="">Todos os grupos</option>
          {groups.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <button type="submit" className="secondary">Filtrar</button>
      </form>

      {rows.length === 0 ? (
        <p className="empty">{stats.products === 0 ? 'O catálogo ainda está vazio. Importe a planilha de produtos do ERP para começar.' : 'Nenhum produto neste filtro.'}</p>
      ) : (
        <div className="asset-grid">
          {rows.map((p) => (
            <Link key={p.id} href={`/produtos/${p.id}`} className="asset-card" style={{ color: 'inherit' }}>
              <span className="asset-thumb">
                {p.thumb_id
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className="thumb" src={`/api/produtos/imagem/${p.thumb_id}?mini=1`} alt={p.description} loading="lazy" />
                  : <ImageOff size={28} color="#8a98a8" aria-label="Sem imagem" />}
              </span>
              <strong style={{ fontSize: 13, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{p.description}</strong>
              <small className="muted">{p.ean ?? 'sem código de barras'}{p.image_count > 1 ? ` · ${p.image_count} imagens` : ''}</small>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="Paginação">
          {page > 1 && <Link href={href(page - 1)} className="btn">← Anterior</Link>}
          <span className="muted">Página {page} de {pages} · {total.toLocaleString('pt-BR')} produtos</span>
          {page < pages && <Link href={href(page + 1)} className="btn">Próxima →</Link>}
        </nav>
      )}
    </>
  )
}
