import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { listCampaigns, listThemes } from '@/lib/promo/store'
import { NewPromo } from './new-promo'

export default async function Promocoes() {
  const user = await requireUser()
  const [campaigns, themes] = await Promise.all([listCampaigns(), listThemes()])
  const write = canWrite(user.role)
  return (
    <>
      <header className="page-head">
        <h1>Promoções</h1>
        <p>Planilha com código de barras e preço → peças prontas de story, feed e A4, com o nome do ERP e a foto do banco de imagens. <Link href="/promocoes/temas">Temas (artes)</Link></p>
      </header>
      {write && <NewPromo themes={themes.map((t) => ({ id: t.id, name: t.name }))} />}
      <h2 style={{ marginTop: 22 }}>Promoções criadas</h2>
      {campaigns.length === 0 ? <p className="empty">Nenhuma promoção ainda. Envie a primeira planilha acima.</p> : (
        <div className="cards">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/promocoes/${c.id}`} className="card" style={{ color: 'inherit' }}>
              <h3>{c.name}</h3>
              <p className="muted">{c.items} produto(s) · {c.theme_name ?? 'sem tema'} · {c.created_at.slice(0, 10).split('-').reverse().join('/')}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
