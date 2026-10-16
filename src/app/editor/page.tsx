import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { listCampaigns } from '@/lib/promo/store'

export default async function Editor() {
  await requireUser()
  const campaigns = await listCampaigns()
  return (
    <>
      <header className="page-head">
        <h1>Console de edição</h1>
        <p>Escolha a promoção para editar os encartes em tela cheia. <Link href="/promocoes">Voltar ao sistema</Link></p>
      </header>
      {campaigns.length === 0 ? <p className="empty">Nenhuma promoção ainda. Crie a primeira em Promoções, enviando a planilha.</p> : (
        <div className="cards">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/editor/${c.id}`} className="card" style={{ color: 'inherit' }}>
              <h3>{c.name}</h3>
              <p className="muted"><span className="badge" style={c.status === 'aprovada' ? { background: '#e1f5ec', color: '#1a7f4b' } : undefined}>{c.status === 'aprovada' ? 'Aprovada' : 'Em edição'}</span> {c.items} encarte(s) · {c.theme_name ?? 'sem tema'}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
