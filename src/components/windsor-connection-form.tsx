'use client'
import Link from 'next/link'
import { startTransition, useActionState, useRef } from 'react'
import { configureWindsor } from '@/app/(app)/configuracoes/integracoes/windsor-actions'
import type { FormState } from '@/lib/form'
export function WindsorConnectionForm({ configured, protectedStorage }: { configured: boolean; protectedStorage: boolean }) {
  const [state, run, pending] = useActionState<FormState, FormData>(configureWindsor, {})
  const input = useRef<HTMLInputElement>(null)
  return <form className="stack-form" onSubmit={e => {
    e.preventDefault()
    const operation = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ?? 'save'
    if (operation === 'disconnect' && !window.confirm('Desconectar a Windsor.ai deste workspace? Os dados já salvos serão mantidos.')) return
    const fd = new FormData(e.currentTarget)
    fd.set('operation', operation)
    if (input.current) input.current.value = ''
    startTransition(() => run(fd))
  }}>
    <label htmlFor="windsor-api-key">Chave API da Windsor.ai</label>
    <input id="windsor-api-key" ref={input} name="api_key" type="password" autoComplete="off" maxLength={512} placeholder={configured ? 'Cole uma nova chave para substituir a atual' : 'Cole sua chave da Windsor.ai'} disabled={pending || !protectedStorage} />
    <p className="muted">A chave vale para este workspace e fica protegida no servidor. As contas conectadas são associadas às empresas em Integrações.</p>
    {!protectedStorage && <p role="alert">A proteção de credenciais precisa ser habilitada no servidor antes de salvar.</p>}
    <div className="form-actions">
      <button className="primary" name="operation" value="save" disabled={pending || !protectedStorage}>Salvar chave</button>
      <button className="btn" name="operation" value="test" disabled={pending || !configured}>Testar conexão</button>
      <Link className="btn" href="/configuracoes/integracoes#contas">Associar contas às empresas</Link>
      {configured && <button className="btn" name="operation" value="disconnect" disabled={pending}>Desconectar</button>}
    </div>
    {pending && <p role="status">Processando configuração…</p>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.ok && <p className="form-ok" role="status">{state.ok}</p>}
  </form>
}
