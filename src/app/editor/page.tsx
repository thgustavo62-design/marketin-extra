import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { listCampaigns, listDesigns } from '@/lib/promo/store'

export default async function Editor() {
  await requireUser()
  const [campaigns, designs] = await Promise.all([listCampaigns(), listDesigns()])
  return (
    <>
      <header className="page-head">
        <h1>Console de edição</h1>
        <p>Escolha a promoção ou o design para editar em tela cheia. <Link href="/promocoes">Voltar ao sistema</Link></p>
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
      {designs.length > 0 && (
        <>
          <h2 style={{ marginTop: 22 }}>Meus designs</h2>
          <div className="cards">
            {designs.map((d) => (
              <Link key={d.id} href={`/editor/${d.id}`} className="card" style={{ color: 'inherit' }}>
                <h3>{d.name}</h3>
                <p className="muted"><span className="badge">{d.format}</span> {d.pages} peça(s) · {d.status === 'aprovada' ? 'Aprovado' : 'Em edição'}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
