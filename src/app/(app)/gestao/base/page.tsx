import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { ConfirmButton } from '@/components/confirm-button'
import { requireUser } from '@/lib/auth'
import { getBrands, listKnowledge } from '@/lib/data'
import { getScope } from '@/lib/scope'
import { KNOWLEDGE_KINDS, formatBR, isExpired, todayISO } from '@/lib/domain'
import { confirmKnowledgeAction, deleteKnowledgeAction, saveKnowledgeAction } from './actions'

export default async function Base({ searchParams }: { searchParams: Promise<{ editar?: string; salvo?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const [allBrands, items] = await Promise.all([getBrands(), listKnowledge()])
  const brands = scope.brand ? allBrands.filter((b) => b.id === scope.brand!.id) : allBrands
  const today = todayISO()
  const editing = items.find((k) => k.id === sp.editar)

  return (
    <>
      <header className="page-head">
        <h1>Base de informações</h1>
        <p>O que é usado para escrever os conteúdos de cada filial. Informação vencida ou não confirmada vira pendência e não é tratada como fato atual.</p>
        {sp.salvo && <p className="form-ok" role="status">Salvo.</p>}
      </header>

      {brands.map((b) => {
        const mine = items.filter((k) => k.brand_id === b.id)
        return (
          <section key={b.id} aria-labelledby={`b-${b.slug}`}>
            <h2 id={`b-${b.slug}`} className="eyebrow">{b.name}</h2>
            {mine.length === 0 ? (
              <p className="empty">Nada cadastrado para {b.name}. Comece por posicionamento, tom de voz e contatos.</p>
            ) : (
              <div className="cards">
                {mine.map((k) => {
                  const expired = isExpired(k.valid_until, today)
                  const pending = expired ? 'Vencida — reconfirmar' : !k.confirmed ? 'Não confirmada' : null
                  return (
                    <article key={k.id} className={`card${pending ? ' pending' : ''}`}>
                      <span className="pill soft">{KNOWLEDGE_KINDS[k.kind]}</span>
                      {pending && <span className="pill warn">{pending}</span>}
                      <h3>{k.title}</h3>
                      <p className="pre">{k.content}</p>
                      <p className="muted">
                        {k.source && <>Fonte: {k.source} · </>}{k.owner && <>Responsável: {k.owner} · </>}
                        {k.valid_until ? <>Válida até {formatBR(k.valid_until)}</> : <>Sem validade definida</>}
                      </p>
                      <div className="card-actions">
                        <Link href={`/gestao/base?editar=${k.id}#form`}>Editar</Link>
                        {!k.confirmed && !expired && (
                          <form action={confirmKnowledgeAction}><input type="hidden" name="id" value={k.id} /><button type="submit" className="link">Confirmar</button></form>
                        )}
                        <form action={deleteKnowledgeAction}><input type="hidden" name="id" value={k.id} /><ConfirmButton className="link-danger" message="Excluir esta informação?">Excluir</ConfirmButton></form>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      <section id="form" aria-labelledby="novo" className="card narrow-lg">
        <h2 id="novo" className="eyebrow">{editing ? `Editar: ${editing.title}` : 'Nova informação'}</h2>
        <ActionForm action={saveKnowledgeAction} submit={editing ? 'Salvar alterações' : 'Adicionar'} secondary={editing && <Link href="/gestao/base" className="btn">Cancelar</Link>}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid-2">
            <div>
              <label htmlFor="brand_id">Filial</label>
              <select id="brand_id" name="brand_id" defaultValue={editing?.brand_id ?? scope.brand?.id}>
                {allBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="kind">Tipo</label>
              <select id="kind" name="kind" defaultValue={editing?.kind}>
                {Object.entries(KNOWLEDGE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="title">Título</label>
          <input id="title" name="title" type="text" defaultValue={editing?.title} required />
          <label htmlFor="content">Conteúdo</label>
          <textarea id="content" name="content" rows={5} defaultValue={editing?.content} />
          <div className="grid-2">
            <div><label htmlFor="source">Fonte</label><input id="source" name="source" type="text" defaultValue={editing?.source} /></div>
            <div><label htmlFor="owner">Responsável</label><input id="owner" name="owner" type="text" defaultValue={editing?.owner} /></div>
          </div>
          <label htmlFor="valid_until">Válida até (opcional)</label>
          <input id="valid_until" name="valid_until" type="date" defaultValue={editing?.valid_until ?? ''} />
          <label className="check"><input type="checkbox" name="confirmed" defaultChecked={editing?.confirmed} /> Informação confirmada</label>
        </ActionForm>
      </section>
    </>
  )
}
