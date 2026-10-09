import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { countAssets, listAllTags, listAssets } from '@/lib/data'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { Library } from './library'

type SP = { tag?: string; tipo?: string; q?: string; p?: string }
const PAGE_SIZE = 24

export default async function Biblioteca({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const kind = sp.tipo === 'file' || sp.tipo === 'link' ? sp.tipo : undefined
  const q = sp.q?.trim() || undefined
  const tag = sp.tag?.trim() || undefined
  const filter = { brand: scope.brand?.slug, branchId: scope.branch?.id, kind, q, tag }
  const [total, tags] = await Promise.all([countAssets(filter), listAllTags(scope.brand?.slug)])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number(sp.p) || 1))
  const assets = await listAssets(filter, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const href = (n: number) => {
    const u = new URLSearchParams()
    if (q) u.set('q', q); if (tag) u.set('tag', tag); if (kind) u.set('tipo', kind)
    u.set('p', String(n))
    return `/producao/biblioteca?${u}`
  }

  return (
    <>
      <header className="page-head">
        <h1>Biblioteca de mídias</h1>
        <p>
          {scopeLabel(scope)} · {total} {total === 1 ? 'peça' : 'peças'}. Artes e PDFs até 4 MB ficam guardados de forma privada, só para quem tem acesso à filial; vídeos e arquivos grandes entram como link. Cada peça mantém todas as versões.
        </p>
      </header>

      <form className="filters" method="get">
        <input type="search" name="q" placeholder="Buscar pelo título ou nome do arquivo" defaultValue={q ?? ''} aria-label="Buscar" />
        <select name="tag" defaultValue={tag ?? ''} aria-label="Etiqueta">
          <option value="">Todas as etiquetas</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="tipo" defaultValue={kind ?? ''} aria-label="Tipo">
          <option value="">Arquivos e links</option>
          <option value="file">Só arquivos</option>
          <option value="link">Só links</option>
        </select>
        <button type="submit" className="secondary">Filtrar</button>
      </form>

      <Library
        assets={assets}
        canEdit={canWrite(user.role)}
        brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
        branches={scope.branches.filter((b) => b.active).map((b) => ({ id: b.id, brand_id: b.brand_id, name: b.name }))}
        defaultBrandId={scope.brand?.id}
      />

      {pages > 1 && (
        <nav className="pager" aria-label="Paginação">
          {page > 1 && <Link href={href(page - 1)} className="btn">← Anterior</Link>}
          <span className="muted">Página {page} de {pages}</span>
          {page < pages && <Link href={href(page + 1)} className="btn">Próxima →</Link>}
        </nav>
      )}
    </>
  )
}
