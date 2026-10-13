'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { discardPreviewAction, undoPlanImportAction } from './actions'

// Desfazer uma importação (remove as pautas que ainda não andaram) ou descartar uma prévia. Sempre pede confirmação.
export function UndoButton({ id, mode, label, afterGo }: { id: string; mode: 'undo' | 'discard'; label?: string; afterGo?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function go() {
    const ask = mode === 'undo'
      ? 'Desfazer esta importação? As pautas que ainda não foram mexidas (Ideia/Briefing, sem edição, tarefa feita, comentário ou anexo) serão removidas. As demais ficam.'
      : 'Descartar esta prévia? Nada foi criado ainda.'
    if (!window.confirm(ask)) return
    setBusy(true); setMsg(null)
    if (mode === 'undo') {
      const r = await undoPlanImportAction(id)
      setBusy(false)
      if (!r.ok) { setMsg({ kind: 'error', text: r.error }); return }
      setMsg({ kind: 'ok', text: `${r.removed} pauta(s) removida(s)${r.kept ? `; ${r.kept} mantida(s) por já terem andamento` : ''}.` })
    } else {
      const r = await discardPreviewAction(id)
      setBusy(false)
      if (!r.ok) { setMsg({ kind: 'error', text: r.error }); return }
    }
    if (afterGo) router.push(afterGo); else router.refresh()
  }

  return (
    <span>
      <button type="button" className={mode === 'undo' ? 'link-danger' : 'mini-btn'} disabled={busy} onClick={go}>{busy ? 'Aguarde…' : label ?? (mode === 'undo' ? 'Desfazer importação' : 'Descartar prévia')}</button>
      {msg && <small className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}> {msg.text}</small>}
    </span>
  )
}
