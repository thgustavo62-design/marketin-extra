'use client'

import { useActionState } from 'react'
import { changePasswordAction, type PasswordState } from './actions'

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {})

  return (
    <form action={action} className="stack-form" noValidate>
      <label htmlFor="current">Senha atual</label>
      <input id="current" name="current" type="password" autoComplete="current-password" required />

      <label htmlFor="next">Nova senha</label>
      <input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />

      <label htmlFor="confirm">Confirmar nova senha</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />

      <p className="form-error" role="alert" aria-live="polite">{state.error}</p>
      {state.ok && <p className="form-ok" role="status">Senha alterada. As outras sessões foram encerradas.</p>}

      <button type="submit" className="primary" disabled={pending}>
        {pending ? 'Salvando…' : 'Alterar senha'}
      </button>
    </form>
  )
}
