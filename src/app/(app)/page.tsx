import { requireUser } from '@/lib/auth'
import { pool } from '@/lib/db'

export default async function Overview() {
  const user = await requireUser()
  const { rows: brands } = await pool.query(
    `select b.id, b.name, count(br.id)::int as branches
       from brands b left join branches br on br.brand_id = b.id
      group by b.id order by b.name`,
  )
  return (
    <>
      <header className="page-head">
        <h1>Olá, {user.username}</h1>
        <p>Visão geral dos seus espaços de trabalho.</p>
      </header>

      <section aria-labelledby="redes">
        <h2 id="redes" className="eyebrow">Redes</h2>
        <div className="cards">
          {brands.map((b) => (
            <article key={b.id} className="card">
              <h3>{b.name}</h3>
              <p className="muted">Espaço de trabalho</p>
              <p className="muted">
                {b.branches === 0 ? 'Nenhuma unidade cadastrada ainda.' : `${b.branches} unidade(s)`}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="status">
        <h2 id="status" className="eyebrow">Situação da plataforma</h2>
        <ul className="status">
          <li><b>Ativo</b> Login, sessão, sair e troca de senha</li>
          <li><b className="off">Não iniciado</b> Calendário, conteúdos e campanhas</li>
          <li><b className="off">Não iniciado</b> IA, pesquisa recorrente e Instagram</li>
        </ul>
      </section>
    </>
  )
}
