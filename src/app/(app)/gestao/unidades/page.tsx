import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { requireUser } from '@/lib/auth'
import { getBranches, getBrands } from '@/lib/data'
import { getScope } from '@/lib/scope'
import { saveBranchAction, toggleBranchAction } from './actions'

export default async function Unidades({ searchParams }: { searchParams: Promise<{ editar?: string; salvo?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const [allBrands, branches] = await Promise.all([getBrands(), getBranches()])
  const brands = scope.brand ? allBrands.filter((b) => b.id === scope.brand!.id) : allBrands
  const editing = branches.find((b) => b.id === sp.editar)

  return (
    <>
      <header className="page-head">
        <h1>Unidades</h1>
        <p>Endereço, WhatsApp e horário são por loja: não assuma que sejam iguais entre unidades.</p>
        {sp.salvo && <p className="form-ok" role="status">Salvo.</p>}
      </header>

      {brands.map((b) => {
        const mine = branches.filter((x) => x.brand_id === b.id)
        return (
          <section key={b.id} aria-labelledby={`u-${b.slug}`}>
            <h2 id={`u-${b.slug}`} className="eyebrow">{b.name}</h2>
            {mine.length === 0 ? (
              <p className="empty">Nenhuma unidade cadastrada. Os conteúdos ficam em “Todas as unidades”.</p>
            ) : (
              <div className="cards">
                {mine.map((u) => (
                  <article key={u.id} className={`card${u.active ? '' : ' muted-card'}`}>
                    <h3>{u.name} {!u.active && <span className="pill off">Desativada</span>}</h3>
                    <p className="muted">{[u.city, u.address].filter(Boolean).join(' · ') || 'Sem endereço'}</p>
                    {u.phone && <p>WhatsApp/telefone: {u.phone}</p>}
                    {u.hours && <p className="pre">{u.hours}</p>}
                    <div className="card-actions">
                      <Link href={`/gestao/unidades?editar=${u.id}#form`}>Editar</Link>
                      <form action={toggleBranchAction}><input type="hidden" name="id" value={u.id} /><button type="submit" className="link">{u.active ? 'Desativar' : 'Reativar'}</button></form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <section id="form" aria-labelledby="nova" className="card narrow-lg">
        <h2 id="nova" className="eyebrow">{editing ? `Editar: ${editing.name}` : 'Nova unidade'}</h2>
        <ActionForm action={saveBranchAction} submit={editing ? 'Salvar alterações' : 'Adicionar unidade'} secondary={editing && <Link href="/gestao/unidades" className="btn">Cancelar</Link>}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label htmlFor="brand_id">Filial</label>
          <select id="brand_id" name="brand_id" defaultValue={editing?.brand_id ?? scope.brand?.id}>
            {allBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <label htmlFor="name">Nome da unidade</label>
          <input id="name" name="name" type="text" defaultValue={editing?.name} required />
          <div className="grid-2">
            <div><label htmlFor="city">Cidade</label><input id="city" name="city" type="text" defaultValue={editing?.city ?? ''} /></div>
            <div><label htmlFor="phone">WhatsApp / telefone</label><input id="phone" name="phone" type="text" defaultValue={editing?.phone ?? ''} /></div>
          </div>
          <label htmlFor="address">Endereço</label>
          <input id="address" name="address" type="text" defaultValue={editing?.address ?? ''} />
          <label htmlFor="hours">Horário de funcionamento</label>
          <textarea id="hours" name="hours" rows={3} defaultValue={editing?.hours ?? ''} />
        </ActionForm>
      </section>
    </>
  )
}
