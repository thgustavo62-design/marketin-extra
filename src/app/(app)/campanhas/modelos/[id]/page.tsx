import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getStaleData, getTemplate, listAssignableUsers, listInstances } from '@/lib/data'
import { describeRecurrence, formatBR, todayISO } from '@/lib/domain'
import { isUuid } from '@/lib/form'
import { brandAllowed, canWrite } from '@/lib/perms'
import { getScope } from '@/lib/scope'
import { Instances } from '../instances'
import { TemplateForm } from '../template-form'

export default async function ModeloDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const sp = await searchParams
  if (!isUuid(id)) notFound()
  const t = await getTemplate(id)
  if (!t || !brandAllowed(user, t.brand_id)) notFound()
  const scope = await getScope()
  const canEdit = canWrite(user.role)
  const today = todayISO()
  const [instances, stale, team] = await Promise.all([listInstances(id), getStaleData(t.brand_id, today), listAssignableUsers(t.brand_id)])
  const hasStale = stale.knowledge.length > 0 || stale.offers.length > 0

  return (
    <>
      <header className="page-head">
        <h1>{t.name}</h1>
        <p>
          {t.brand_name} · {t.branch_name ?? 'todas as unidades'} · {describeRecurrence({
            frequency: t.frequency, start_dow: t.start_dow, anchor_date: t.anchor_date, day_of_month: t.day_of_month, specific_dates: t.specific_dates,
            duration_days: t.duration_days, valid_from: t.valid_from, valid_to: t.valid_to,
          })}{!t.active && ' · pausado'}
        </p>
        {sp.salvo && <p className="form-ok" role="status">Modelo salvo. As campanhas já geradas não mudam; as próximas seguem a regra nova.</p>}
        <p><Link href="/campanhas/modelos" className="inline-link">← Todos os modelos</Link></p>
      </header>

      {hasStale && (
        <section className="notice" aria-label="Dados vencidos">
          <div>
            <b>Há dados vencidos nesta filial.</b> Não use nada disto em campanha nova sem confirmar de novo:
            <ul>
              {stale.knowledge.map((k) => <li key={k.id}>Base de informações: {k.title} (venceu em {formatBR(k.valid_until)}) — <Link className="inline-link" href="/gestao/base">revisar</Link></li>)}
              {stale.offers.map((o) => <li key={o.id}>Oferta em solicitação: {o.title} (venceu em {formatBR(o.offer_valid_until)}) — <Link className="inline-link" href="/producao/solicitacoes">revisar</Link></li>)}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="inst">
        <h2 id="inst" className="eyebrow">Ocorrências geradas</h2>
        <Instances instances={instances} canEdit={canEdit} />
      </section>

      {canEdit ? (
        <section className="card narrow-lg" aria-labelledby="editar">
          <h2 id="editar" className="eyebrow">Editar modelo</h2>
          <TemplateForm
            template={t}
            brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
            branches={scope.branches.filter((b) => b.active).map((b) => ({ id: b.id, brand_id: b.brand_id, name: b.name }))}
            people={{ [t.brand_id]: team }}
          />
        </section>
      ) : (
        <p className="muted">Seu perfil só visualiza. Peça a um editor para alterar o modelo.</p>
      )}
    </>
  )
}
