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
        <p className="login-kicker">PROMOÇÕES INTELIGENTES</p>
        <h1>Criar mais.<br /><span>Complicar menos.</span></h1>
        <p>Transforme produtos, dados e campanhas em comunicação promocional inteligente. Suas marcas, unidades e equipes, com identidade e consistência.</p>
        <div className="login-pillars"><span>01 Conexão</span><span>02 Inteligência</span><span>03 Resultado</span></div>
        <small>Encartiva — Marcas que movimentam.</small>
      </section>
      <section className="login-card">
        <p className="login-kicker">SEU WORKSPACE</p>
        <h2>Bom ter você por aqui.</h2>
        <p className="login-sub">Entre para continuar de onde parou.</p>
        <LoginForm />
        <p className="login-footnote">Sua marca, sempre consistente.</p>
      </section>
    </main>
  )
}
