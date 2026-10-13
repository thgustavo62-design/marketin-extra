'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { collectAction } from '@/app/(app)/resultados/collect-action'

export function CollectButton({ label = 'Coletar métricas agora' }: { label?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function go() {
    setBusy(true); setMsg(null)
    const r = await collectAction()
    setBusy(false)
    if (!r.ok) { setMsg({ kind: 'error', text: r.error }); return }
    const parts = [`${r.publications} ${r.publications === 1 ? 'publicação lida' : 'publicações lidas'} (${r.newPublications} nova${r.newPublications === 1 ? '' : 's'})`, `${r.accounts} ${r.accounts === 1 ? 'total de conta guardado' : 'totais de conta guardados'}`]
    if (r.unmapped.length) parts.push(`conta sem filial ignorada: ${r.unmapped.join(', ')}`)
    setMsg({ kind: 'ok', text: ['Coleta concluída: ' + parts.join(' · ') + '.', ...r.notes].join(' ') })
    router.refresh()
  }

  return (
    <div className="collect-button">
      <button type="button" className="primary" disabled={busy} onClick={go}><RefreshCw size={14} className={busy ? 'spin' : undefined} /> {busy ? 'Coletando… (pode levar até 1 minuto)' : label}</button>
      {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  )
}
