import { requireUser } from '@/lib/auth'
import { PasswordForm } from './password-form'

export default async function ContaPage() {
  const user = await requireUser()
  return (
    <>
      <header className="page-head">
        <h1>Conta e senha</h1>
        <p>
          Usuário <b>{user.username}</b> · perfil {user.role}
        </p>
      </header>
      <section className="card narrow" aria-labelledby="trocar">
        <h2 id="trocar" className="eyebrow">Trocar senha</h2>
        <PasswordForm />
      </section>
    </>
  )
}
