import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { requireUser } from '@/lib/auth'
import { getCampaigns, listInspirationTags, listInspirations, listPickerAssets, listReferences } from '@/lib/data'
import { INSPIRATION_KINDS, NETWORKS, RELEVANCE, formatBR, isInspirationKind } from '@/lib/domain'
import { pool } from '@/lib/db'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { saveInspirationAction, saveReferenceAction } from './actions'
import { DeleteInspiration, ReferenceToggle } from './row-actions'

type SP = { ref?: string; insp?: string; tipo?: string; tag?: string; q?: string; de?: string }

export default async function Referencias({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const canEdit = canWrite(user.role)
  const brand = scope.brand?.slug
  const kind = isInspirationKind(sp.tipo) ? sp.tipo : undefined
  const [refs, insps, tags, campaigns] = await Promise.all([
    listReferences({ brand, includeInactive: true }),
    listInspirations({ brand, kind, tag: sp.tag?.trim() || undefined, referenceId: sp.de, q: sp.q?.trim() || undefined }),
    listInspirationTags(brand),
    getCampaigns(),
  ])
  // Vínculos com conteúdo e arquivo só quando uma filial está escolhida no topo.
  const posts = scope.brand
    ? (await pool.query(`select id, title, post_date::text as d from posts where brand_id = $1 and stage <> 'cancelado' and post_date >= current_date - 120 order by post_date desc limit 150`, [scope.brand.id])).rows as { id: string; title: string; d: string }[]
    : []
  const assets = scope.brand ? await listPickerAssets(scope.brand.id) : []
  const editRef = refs.find((r) => r.id === sp.ref)
  const editInsp = insps.find((i) => i.id === sp.insp)
  const brands = scope.brands
  const myCampaigns = campaigns.filter((c) => brands.some((b) => b.id === c.brand_id) && (!scope.brand || c.brand_id === scope.brand.id))
  const activeRefs = refs.filter((r) => r.active || r.id === editInsp?.reference_id)

  return (
    <>
      <header className="page-head">
        <h1>Referências e inspirações</h1>
        <p>
          {scopeLabel(scope)} · cadastro <b>manual</b> de contas públicas de referência e de ideias, formatos, datas sazonais e exemplos. O sistema não coleta dados de terceiros nem usa credenciais alheias:
          anote o que você viu publicamente e a fonte. Não copie nem repostar material de terceiros sem licença.
        </p>
      </header>

      <section aria-labelledby="refs">
        <h2 id="refs" className="eyebrow">Contas de referência</h2>
        {refs.length === 0 ? <p className="empty">Nenhuma referência ainda.</p> : (
          <div className="cards">
            {refs.map((r) => (
              <article key={r.id} className={`card${r.active ? '' : ' muted-card'}`} data-ref={r.name}>
                <h3>{r.name} {!r.active && <span className="pill off">Inativa</span>}</h3>
                <p className="muted">{r.brand_name} · {NETWORKS[r.network]} · relevância {RELEVANCE[r.relevance].toLowerCase()}{r.category ? ` · ${r.category}` : ''}{r.region ? ` · ${r.region}` : ''}</p>
                {r.url && <p><a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-link">{r.url}</a></p>}
                {r.notes && <p className="pre">{r.notes}</p>}
                <div className="card-actions">
                  <Link href={`/gestao/referencias?de=${r.id}`}>{r.inspirations} inspiraç{r.inspirations === 1 ? 'ão' : 'ões'}</Link>
                  {canEdit && <Link href={`/gestao/referencias?ref=${r.id}#form-ref`}>Editar</Link>}
                  {canEdit && <ReferenceToggle id={r.id} active={r.active} />}
                </div>
              </article>
            ))}
          </div>
        )}
        {canEdit && (
          <div id="form-ref" className="card narrow-lg">
            <h3 className="eyebrow">{editRef ? `Editar: ${editRef.name}` : 'Nova referência'}</h3>
            <ActionForm action={saveReferenceAction} submit={editRef ? 'Salvar alterações' : 'Cadastrar referência'} secondary={editRef && <Link href="/gestao/referencias" className="btn">Cancelar</Link>} key={editRef?.id ?? 'new-ref'}>
              {editRef && <input type="hidden" name="id" value={editRef.id} />}
              <div className="grid-3">
                <div><label htmlFor="rf-name">Nome</label><input id="rf-name" name="name" type="text" maxLength={120} defaultValue={editRef?.name} /></div>
                <div>
                  <label htmlFor="rf-brand">Filial</label>
                  <select id="rf-brand" name="brand_id" defaultValue={editRef?.brand_id ?? scope.brand?.id} disabled={Boolean(editRef)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                  {editRef && <input type="hidden" name="brand_id" value={editRef.brand_id} />}
                </div>
                <div><label htmlFor="rf-net">Rede</label><select id="rf-net" name="network" defaultValue={editRef?.network ?? 'instagram'}>{Object.entries(NETWORKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label htmlFor="rf-rel">Relevância</label><select id="rf-rel" name="relevance" defaultValue={String(editRef?.relevance ?? 2)}>{Object.entries(RELEVANCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label htmlFor="rf-cat">Categoria</label><input id="rf-cat" name="category" type="text" maxLength={80} defaultValue={editRef?.category ?? ''} placeholder="Farmácia, perfumaria…" /></div>
                <div><label htmlFor="rf-reg">Região</label><input id="rf-reg" name="region" type="text" maxLength={80} defaultValue={editRef?.region ?? ''} /></div>
              </div>
              <label htmlFor="rf-url">Endereço público (https://…)</label>
              <input id="rf-url" name="url" type="text" inputMode="url" defaultValue={editRef?.url ?? ''} />
              <label htmlFor="rf-notes">Observações</label>
              <textarea id="rf-notes" name="notes" rows={3} maxLength={1000} defaultValue={editRef?.notes ?? ''} />
            </ActionForm>
          </div>
        )}
      </section>

      <section aria-labelledby="insp">
        <h2 id="insp" className="eyebrow">Biblioteca de inspirações</h2>
        <form className="filters" method="get">
          <input type="search" name="q" placeholder="Buscar título ou descrição" defaultValue={sp.q ?? ''} aria-label="Buscar" />
          <select name="tipo" defaultValue={kind ?? ''} aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(INSPIRATION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="tag" defaultValue={sp.tag ?? ''} aria-label="Etiqueta"><option value="">Todas as etiquetas</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select name="de" defaultValue={sp.de ?? ''} aria-label="Referência"><option value="">Todas as referências</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <button type="submit" className="secondary">Filtrar</button>
        </form>
        {insps.length === 0 ? <p className="empty">Nenhuma inspiração neste recorte.</p> : (
          <div className="cards">
            {insps.map((i) => (
              <article key={i.id} className="card" data-insp={i.title}>
                <span className="pill soft">{INSPIRATION_KINDS[i.kind]}</span>
                <h3>{i.title}</h3>
                <p className="muted">{i.brand_name}{i.reference_name ? ` · de ${i.reference_name}` : ''}{i.campaign_name ? ` · campanha ${i.campaign_name}` : ''}</p>
                {i.description && <p className="pre">{i.description}</p>}
                {i.source_url && <p><a href={i.source_url} target="_blank" rel="noopener noreferrer" className="inline-link">Fonte</a></p>}
                {i.post_id && <p><Link href={`/planejamento/conteudos/${i.post_id}`} className="inline-link">Conteúdo: {i.post_title}</Link></p>}
                {i.asset_id && <p><a href={`/api/media/${i.asset_id}`} target="_blank" rel="noopener noreferrer" className="inline-link">Arquivo: {i.asset_title}</a></p>}
                {i.tags.length > 0 && <div className="tag-row">{i.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
                <small className="muted">Anotado por {i.created_by_name ?? '—'} em {formatBR(i.created_at.slice(0, 10))}</small>
                {canEdit && <div className="card-actions"><Link href={`/gestao/referencias?insp=${i.id}#form-insp`}>Editar</Link><DeleteInspiration id={i.id} /></div>}
              </article>
            ))}
          </div>
        )}
        {canEdit && (
          <div id="form-insp" className="card narrow-lg">
            <h3 className="eyebrow">{editInsp ? `Editar: ${editInsp.title}` : 'Nova inspiração'}</h3>
            <ActionForm action={saveInspirationAction} submit={editInsp ? 'Salvar alterações' : 'Salvar inspiração'} secondary={editInsp && <Link href="/gestao/referencias" className="btn">Cancelar</Link>} key={editInsp?.id ?? 'new-insp'}>
              {editInsp && <input type="hidden" name="id" value={editInsp.id} />}
              <div className="grid-3">
                <div>
                  <label htmlFor="in-brand">Filial</label>
                  <select id="in-brand" name="brand_id" defaultValue={editInsp?.brand_id ?? scope.brand?.id} disabled={Boolean(editInsp)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                  {editInsp && <input type="hidden" name="brand_id" value={editInsp.brand_id} />}
                </div>
                <div><label htmlFor="in-kind">Tipo</label><select id="in-kind" name="kind" defaultValue={editInsp?.kind ?? 'ideia'}>{Object.entries(INSPIRATION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label htmlFor="in-ref">Referência (opcional)</label><select id="in-ref" name="reference_id" defaultValue={editInsp?.reference_id ?? ''}><option value="">Nenhuma</option>{activeRefs.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.brand_name})</option>)}</select></div>
              </div>
              <label htmlFor="in-title">Título</label>
              <input id="in-title" name="title" type="text" maxLength={140} defaultValue={editInsp?.title} />
              <label htmlFor="in-desc">O que chamou atenção (com suas palavras)</label>
              <textarea id="in-desc" name="description" rows={4} maxLength={2000} defaultValue={editInsp?.description} />
              <div className="grid-3">
                <div><label htmlFor="in-src">Fonte pública (https://…)</label><input id="in-src" name="source_url" type="text" inputMode="url" defaultValue={editInsp?.source_url ?? ''} /></div>
                <div><label htmlFor="in-tags">Etiquetas (vírgula)</label><input id="in-tags" name="tags" type="text" defaultValue={editInsp?.tags.join(', ') ?? ''} /></div>
                <div><label htmlFor="in-camp">Campanha (opcional)</label><select id="in-camp" name="campaign_id" defaultValue={editInsp?.campaign_id ?? ''}><option value="">Nenhuma</option>{myCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
              {scope.brand ? (
                <div className="grid-3">
                  <div><label htmlFor="in-post">Conteúdo / Reels (opcional)</label><select id="in-post" name="post_id" defaultValue={editInsp?.post_id ?? ''}><option value="">Nenhum</option>{posts.map((p) => <option key={p.id} value={p.id}>{formatBR(p.d)} · {p.title}</option>)}</select></div>
                  <div><label htmlFor="in-asset">Arquivo da biblioteca (opcional)</label><select id="in-asset" name="asset_id" defaultValue={editInsp?.asset_id ?? ''}><option value="">Nenhum</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select></div>
                </div>
              ) : <p className="muted">Escolha uma filial no topo para vincular a conteúdo ou a arquivo da biblioteca.</p>}
            </ActionForm>
          </div>
        )}
      </section>
    </>
  )
}
