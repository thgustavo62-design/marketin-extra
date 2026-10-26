import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/wordmark'
import { getSession } from '@/lib/session'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  if (await getSession()) redirect('/')
  return (
    <main className="login-page">
      <section className="login-story">
        <Wordmark tone="white" size="lg" />
        <p className="login-kicker">ESTRATÉGIA · CRIAÇÃO · RESULTADOS</p>
        <h1>Grandes ideias.<br />Próximos <span>resultados.</span></h1>
        <p>Do primeiro insight à próxima campanha. Um espaço para planejar, criar e acompanhar o marketing da sua empresa.</p>
        <div className="login-pillars"><span>01 Planeje</span><span>02 Crie</span><span>03 Evolua</span></div>
        <small>Nova7 — Marketing em movimento.</small>
      </section>
      <section className="login-card">
        <p className="login-kicker">SEU WORKSPACE</p>
        <h2>Bom ter você por aqui.</h2>
        <p className="login-sub">Entre para continuar de onde parou.</p>
        <LoginForm />
        <p className="login-footnote">Estratégia e execução no mesmo lugar.</p>
      </section>
    </main>
  )
}
