import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/wordmark'
import { getSession } from '@/lib/session'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  if (await getSession()) redirect('/')
  return (
    <main className="login-page">
      <section className="login-card">
        <Wordmark tone="white" size="lg" />
        <p className="login-sub">Central de conteúdo das suas redes</p>
        <LoginForm />
      </section>
    </main>
  )
}
