import { requireAdmin } from '@/lib/auth'
import { pool } from '@/lib/db'
import { ApprovalToggle } from './toggle'

export default async function Fluxo() {
  await requireAdmin()
  const brands = (await pool.query(`select id, name, approval_required from brands order by name`)).rows as { id: string; name: string; approval_required: boolean }[]
  return (
    <>
      <header className="page-head">
        <h1>Fluxo de aprovação</h1>
        <p>
          Com a exigência ligada, o conteúdo só chega a “Aprovado”, “Agendado” e “Publicado” depois de uma aprovação registrada para a versão atual.
          Se o texto ou os anexos mudarem depois, a aprovação perde a validade e o cartão volta para revisão. Conteúdo de medicamentos continua exigindo a revisão farmacêutica, com ou sem esta opção.
        </p>
      </header>
      <section className="card">
        {brands.map((b) => <ApprovalToggle key={b.id} brandId={b.id} name={b.name} initial={b.approval_required} />)}
      </section>
    </>
  )
}
