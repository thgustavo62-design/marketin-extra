'use client'

import { startTransition, useActionState } from 'react'
import type { FormState } from '@/lib/form'

type Action = (prev: FormState, fd: FormData) => Promise<FormState>

// Formulário genérico: mostra erro/sucesso e mantém o que foi digitado quando falha
// (usa onSubmit em vez de action= para o React não limpar os campos).
export function ActionForm({
  action,
  children,
  submit = 'Salvar',
  pending: pendingLabel = 'Salvando…',
  className = 'stack-form',
  secondary,
}: {
  action: Action
  children: React.ReactNode
  submit?: React.ReactNode
  pending?: React.ReactNode
  className?: string
  secondary?: React.ReactNode
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {})
  return (
    <form
      className={className}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => run(fd))
      }}
    >
      {children}
      <p className="form-error" role="alert" aria-live="polite">{state.error}</p>
      {state.ok && <p className="form-ok" role="status">{state.ok}</p>}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={pending}>{pending ? pendingLabel : submit}</button>
        {secondary}
      </div>
    </form>
  )
}
