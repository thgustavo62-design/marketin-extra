'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDesignAction } from '../promocoes/actions'

export function NewDesign({ formats }: { formats: { id: string; label: string; hint: string }[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [format, setFormat] = useState('story')
  const [err, setErr] = useState('')
  const [busy, start] = useTransition()
  return (
    <details className="card new-request" open>
      <summary>Novo design</summary>
      <form className="stack-form" onSubmit={(e) => { e.preventDefault(); setErr(''); start(async () => { const r = await createDesignAction(name, format); if (r.ok && r.id) router.push(`/criacao/${r.id}`); else setErr(r.error ?? 'Não foi possível criar.') }) }}>
        <div className="grid-2">
          <div><label htmlFor="nd-name">Nome</label><input id="nd-name" type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Story do Minas Club" /></div>
          <div>
            <label htmlFor="nd-format">Formato</label>
            <select id="nd-format" value={format} onChange={(e) => setFormat(e.target.value)}>{formats.map((f) => <option key={f.id} value={f.id}>{f.label} — {f.hint}</option>)}</select>
          </div>
        </div>
        <div className="form-actions"><button type="submit" className="primary" style={{ width: 'auto' }} disabled={busy || name.trim().length < 2}>{busy ? 'Criando…' : 'Criar design'}</button></div>
        {err && <p className="form-error" role="alert">{err}</p>}
      </form>
    </details>
  )
}
