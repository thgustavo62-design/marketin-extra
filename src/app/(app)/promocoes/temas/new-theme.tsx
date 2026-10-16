'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createThemeAction } from '../actions'

export function NewTheme() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, start] = useTransition()
  return (
    <section className="card" style={{ marginBottom: 14 }} aria-label="Novo tema">
      <form className="stack-form" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await createThemeAction(name); if (r.ok && r.id) router.push(`/promocoes/temas/${r.id}`); else setErr(r.error ?? 'Não foi possível criar.') }) }}>
        <label htmlFor="nt-name">Nome do novo tema</label>
        <input id="nt-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Atacadão do Bebê" required />
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="form-actions"><button type="submit" className="primary" style={{ width: 'auto' }} disabled={busy}>Criar tema</button></div>
      </form>
    </section>
  )
}
