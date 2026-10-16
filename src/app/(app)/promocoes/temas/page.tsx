import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { listThemes } from '@/lib/promo/store'
import { PromoTabs } from '../promo-tabs'
import { NewTheme } from './new-theme'

export default async function Temas() {
  const user = await requireUser()
  const themes = await listThemes()
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Temas das promoções</h1>
        <p><Link href="/promocoes">← Promoções</Link> · O tema é a &quot;cara&quot; da peça: cabeçalho, rodapé e fundo (suas artes) para story, feed e A4, mais cores, textos e quantos produtos por peça.</p>
      </header>
      {canWrite(user.role) && <NewTheme />}
      {themes.length === 0 ? <p className="empty">Nenhum tema ainda. Crie o primeiro: sem artes enviadas, o sistema usa um fundo azul padrão.</p> : (
        <div className="cards">
          {themes.map((t) => (
            <Link key={t.id} href={`/promocoes/temas/${t.id}`} className="card" style={{ color: 'inherit' }}>
              <h3>{t.name}</h3>
              <p className="muted">{t.assets} arte(s) enviada(s)</p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
