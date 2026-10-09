'use client'

import { useActionState, useState } from 'react'
import { loginAction, type LoginState } from './actions'

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  const [show, setShow] = useState(false)

  return (
    <form action={action} className="login-form" noValidate>
      <label htmlFor="username">Usuário</label>
      <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />

      <label htmlFor="password">Senha</label>
      <div className="password-field">
        <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required />
        <button type="button" className="ghost" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      <p className="form-error" role="alert" aria-live="polite">{state.error}</p>

      <button type="submit" className="primary" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
