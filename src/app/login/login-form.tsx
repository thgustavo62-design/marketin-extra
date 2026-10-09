'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { loginAction, type LoginState } from './actions'

export function LoginForm() {
  const [state, run, pending] = useActionState<LoginState, FormData>(loginAction, {})
  const [show, setShow] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Depois de um erro: mantém o usuário, limpa a senha e devolve o foco a ela.
  useEffect(() => {
    if (state.error && passwordRef.current) {
      passwordRef.current.value = ''
      passwordRef.current.focus()
    }
  }, [state])

  return (
    <form
      className="login-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault() // com action= o React limparia os dois campos
        const fd = new FormData(e.currentTarget)
        startTransition(() => run(fd))
      }}
    >
      <label htmlFor="username">Usuário</label>
      <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />

      <label htmlFor="password">Senha</label>
      <div className="password-field">
        <input ref={passwordRef} id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required />
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
