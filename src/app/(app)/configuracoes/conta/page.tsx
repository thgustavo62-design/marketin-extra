import { AlertTriangle } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { requireUser } from '@/lib/auth'
import { roleLabel } from '@/lib/perms'
import { changePasswordAction, updateDisplayNameAction } from './actions'

export default async function ContaPage({ searchParams }: { searchParams: Promise<{ trocar?: string }> }) {
  const user = await requireUser({ allowMustChange: true })
  const sp = await searchParams
  return (
    <>
      <header className="page-head">
        <h1>Minha conta</h1>
        <p>@{user.username} · perfil {roleLabel(user.role)}</p>
      </header>

      {(user.mustChange || sp.trocar) && user.mustChange && (
        <div className="notice" role="alert"><AlertTriangle size={18} /><span><b>Defina uma senha nova para continuar.</b> A senha atual é provisória. Depois da troca você entra no sistema.</span></div>
      )}

      <section className="card narrow" aria-labelledby="trocar">
        <h2 id="trocar" className="eyebrow">Trocar senha</h2>
        <ActionForm action={changePasswordAction} submit="Alterar senha" pending="Salvando…">
          <label htmlFor="current">Senha atual</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required />
          <label htmlFor="next">Nova senha (mínimo 10 caracteres, com letras e números)</label>
          <input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
          <label htmlFor="confirm">Confirmar nova senha</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </ActionForm>
      </section>

      {!user.mustChange && (
        <section className="card narrow" aria-labelledby="nome" style={{ marginTop: 20 }}>
          <h2 id="nome" className="eyebrow">Nome de exibição</h2>
          <ActionForm action={updateDisplayNameAction} submit="Salvar nome" pending="Salvando…">
            <label htmlFor="display_name">Como seu nome aparece no menu</label>
            <input id="display_name" name="display_name" type="text" maxLength={60} defaultValue={user.displayName} required />
          </ActionForm>
        </section>
      )}
    </>
  )
}
