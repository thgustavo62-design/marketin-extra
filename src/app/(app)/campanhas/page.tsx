import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { ConfirmButton } from '@/components/confirm-button'
import { requireUser } from '@/lib/auth'
import { getBrands, getCampaigns } from '@/lib/data'
import { getScope } from '@/lib/scope'
import { formatBR, todayISO } from '@/lib/domain'
import { deleteCampaignAction, saveCampaignAction } from './actions'

export default async function Campanhas({ searchParams }: { searchParams: Promise<{ editar?: string; salvo?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const [brands, allCampaigns] = await Promise.all([getBrands(), getCampaigns()])
  const campaigns = scope.brand ? allCampaigns.filter((c) => c.brand_id === scope.brand!.id) : allCampaigns
  const today = todayISO()
  const editing = allCampaigns.find((c) => c.id === sp.editar)
  const status = (s: string, e: string) => (e < today ? ['Encerrada', 'off'] : s > today ? ['Futura', 'soft'] : ['Vigente', 'on'])

  return (
    <>
      <header className="page-head">
        <h1>Campanhas</h1>
        <p>Cadastre só condições confirmadas. Uma campanha fora da validade não gera sugestão comercial.</p>
        {sp.salvo && <p className="form-ok" role="status">Salvo.</p>}
      </header>

      <section aria-labelledby="lista">
        <h2 id="lista" className="eyebrow">Campanhas cadastradas</h2>
        {campaigns.length === 0 ? (
          <p className="empty">Nenhuma campanha ainda. Use o formulário abaixo.</p>
        ) : (
          <div className="cards">
            {campaigns.map((c) => {
              const [label, tone] = status(c.starts_on, c.ends_on)
              return (
                <article key={c.id} className="card">
                  <span className={`pill ${tone}`}>{label}</span>
                  <h3>{c.name}</h3>
                  <p className="muted">{c.brand_name} · {formatBR(c.starts_on)} a {formatBR(c.ends_on)}</p>
                  {c.objective && <p>{c.objective}</p>}
                  <div className="card-actions">
                    <Link href={`/campanhas?editar=${c.id}#form`}>Editar</Link>
                    <form action={deleteCampaignAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton className="link-danger" message="Excluir a campanha? Os conteúdos ligados a ela são mantidos.">Excluir</ConfirmButton>
                    </form>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section id="form" aria-labelledby="nova" className="card narrow-lg">
        <h2 id="nova" className="eyebrow">{editing ? `Editar: ${editing.name}` : 'Nova campanha'}</h2>
        <ActionForm action={saveCampaignAction} submit={editing ? 'Salvar alterações' : 'Criar campanha'} secondary={editing && <Link href="/campanhas" className="btn">Cancelar</Link>}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" type="text" defaultValue={editing?.name} required />
          <label htmlFor="brand_id">Rede</label>
          <select id="brand_id" name="brand_id" defaultValue={editing?.brand_id ?? scope.brand?.id}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="grid-2">
            <div><label htmlFor="starts_on">Início</label><input id="starts_on" name="starts_on" type="date" defaultValue={editing?.starts_on} required /></div>
            <div><label htmlFor="ends_on">Fim</label><input id="ends_on" name="ends_on" type="date" defaultValue={editing?.ends_on} required /></div>
          </div>
          <label htmlFor="objective">Objetivo</label>
          <input id="objective" name="objective" type="text" defaultValue={editing?.objective} />
          <label htmlFor="briefing">Briefing (produtos, preços, unidades participantes e condições — só o que está confirmado)</label>
          <textarea id="briefing" name="briefing" rows={6} defaultValue={editing?.briefing} />
          <label htmlFor="approver">Responsável pela aprovação</label>
          <input id="approver" name="approver" type="text" defaultValue={editing?.approver} />
        </ActionForm>
      </section>
    </>
  )
}
