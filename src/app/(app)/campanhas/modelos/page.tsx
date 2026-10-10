import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { listInstanceStarts, listTemplates } from '@/lib/data'
import { addDays, describeRecurrence, occurrencesBetween, todayISO, type Recurrence } from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { TemplateCard, type Upcoming } from './template-card'

const PREVIEW_DAYS = 75

export default async function Modelos() {
  const user = await requireUser()
  const scope = await getScope()
  const today = todayISO()
  const templates = await listTemplates({ brand: scope.brand?.slug, branchId: scope.branch?.id })
  const canEdit = canWrite(user.role)

  const cards = await Promise.all(templates.map(async (t) => {
    const rule: Recurrence = {
      frequency: t.frequency, start_dow: t.start_dow, anchor_date: t.anchor_date, day_of_month: t.day_of_month,
      specific_dates: t.specific_dates, duration_days: t.duration_days, valid_from: t.valid_from, valid_to: t.valid_to,
    }
    const to = addDays(today, PREVIEW_DAYS)
    const [occs, known] = await Promise.all([Promise.resolve(occurrencesBetween(rule, today, to)), listInstanceStarts(t.id, today, to)])
    const upcoming: Upcoming[] = occs.slice(0, 4).map((o) => ({
      start: o.start, end: o.end,
      state: known.get(o.start) ?? (o.start <= addDays(today, t.lead_days) ? 'ready' : 'later'),
      generateFrom: addDays(o.start, -t.lead_days),
    }))
    return { t, summary: describeRecurrence(rule), upcoming }
  }))

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Campanhas recorrentes</h1>
          <p>
            {scopeLabel(scope)} · {templates.length} {templates.length === 1 ? 'modelo' : 'modelos'}. Dias, horários e periodicidade são configurados por filial.
            A geração é manual: ao clicar em “Gerar”, o sistema cria a campanha e os cartões das próximas ocorrências, sem duplicar o que já existe, e <b>nunca</b> copia preço, oferta ou validade da campanha anterior.
          </p>
        </div>
        {canEdit && <Link href="/campanhas/modelos/novo" className="btn primary">Novo modelo</Link>}
      </header>
      {cards.length === 0 ? (
        <p className="empty">Nenhum modelo neste recorte. Crie um (ex.: “Fim de Semana da Limpeza”) definindo quando acontece e quais peças entram.</p>
      ) : (
        <div className="cards">
          {cards.map(({ t, summary, upcoming }) => <TemplateCard key={t.id} t={{
            id: t.id, name: t.name, brand_name: t.brand_name, branch_name: t.branch_name, active: t.active, objective: t.objective, lead_days: t.lead_days,
            deliverables: t.deliverables, pending_reconfirm: t.pending_reconfirm,
          }} summary={summary} upcoming={upcoming} canEdit={canEdit} />)}
        </div>
      )}
    </>
  )
}
