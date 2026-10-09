import Link from 'next/link'
import { FormatBadge, StageBadge } from '@/components/badges'
import { requireUser } from '@/lib/auth'
import { getBrands, listPosts } from '@/lib/data'
import { FORMATS, PILLARS, STAGES, formatBR } from '@/lib/domain'

type SP = { rede?: string; q?: string; etapa?: string; formato?: string }

export default async function Conteudos({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser()
  const sp = await searchParams
  const brands = await getBrands()
  const stage = sp.etapa && sp.etapa in STAGES ? sp.etapa : undefined
  const format = sp.formato && sp.formato in FORMATS ? sp.formato : undefined
  const posts = await listPosts({ brand: sp.rede, q: sp.q?.trim() || undefined, stage, format })

  const exportQs = new URLSearchParams()
  if (sp.rede) exportQs.set('rede', sp.rede)
  if (sp.q) exportQs.set('q', sp.q)
  if (stage) exportQs.set('etapa', stage)
  if (format) exportQs.set('formato', format)

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Conteúdos</h1>
          <p>{posts.length} {posts.length === 1 ? 'conteúdo' : 'conteúdos'} com os filtros atuais.</p>
        </div>
        <Link href="/conteudos/novo" className="btn primary-link">Novo conteúdo</Link>
      </header>

      <form className="filters" method="get">
        <select name="rede" defaultValue={sp.rede ?? ''} aria-label="Rede">
          <option value="">Todas as redes</option>
          {brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
        </select>
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
              <tr><th>Data</th><th>Título</th><th>Rede / unidade</th><th>Formato</th><th>Pilar</th><th>Etapa</th></tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>{formatBR(p.post_date)}{p.post_time ? ` ${p.post_time}` : ''}</td>
                  <td><Link href={`/conteudos/${p.id}`}>{p.title}</Link></td>
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
    </>
  )
}
