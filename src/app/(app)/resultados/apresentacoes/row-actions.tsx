'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deletePresentationAction } from './actions'

export function DeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [err, setErr] = useState('')
  return (
    <>
      <button type="button" className="mini-btn danger" disabled={busy} onClick={() => { if (confirm(`Excluir "${title}"? O arquivo é apagado do sistema.`)) start(async () => { const r = await deletePresentationAction(id); if (!r.ok) setErr(r.error ?? 'Não foi possível excluir.'); router.refresh() }) }}>Excluir</button>
      {err && <span className="form-error" role="alert"> {err}</span>}
    </>
  )
}
