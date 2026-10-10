'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { collectAction } from './actions'

export function CollectButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function go() {
    setBusy(true); setMsg(null)
    const r = await collectAction()
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error }); return }
    const parts = [`${r.publications} ${r.publications === 1 ? 'publicação lida' : 'publicações lidas'} (${r.newPublications} nova${r.newPublications === 1 ? '' : 's'})`, `${r.accounts} ${r.accounts === 1 ? 'total de conta guardado' : 'totais de conta guardados'}`]
    if (r.skippedBrands.length) parts.push(`pulado por coleta recente: ${r.skippedBrands.join(', ')}`)
    if (r.unmapped.length) parts.push(`conta sem filial ignorada: ${r.unmapped.join(', ')}`)
    setMsg({ kind: 'ok', text: [parts.join(' · '), ...r.notes].join(' ') })
    router.refresh()
  }

  return (
    <div>
      <button type="button" className="primary" disabled={busy} onClick={go}><RefreshCw size={14} /> {busy ? 'Coletando… (pode levar até 1 minuto)' : 'Coletar métricas agora'}</button>
      {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  )
}
