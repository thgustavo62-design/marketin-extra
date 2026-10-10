'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteInspirationAction, toggleReferenceAction } from './actions'

function useRun() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return {
    busy, err,
    run: async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(true); setErr(null)
      const r = await fn()
      setBusy(false)
      if (!r.ok) setErr((r as { error: string }).error); else router.refresh()
    },
  }
}

export function ReferenceToggle({ id, active }: { id: string; active: boolean }) {
  const { busy, err, run } = useRun()
  return <><button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => toggleReferenceAction(id, !active))}>{active ? 'Desativar' : 'Reativar'}</button>{err && <span className="form-error" role="alert"> {err}</span>}</>
}

export function DeleteInspiration({ id }: { id: string }) {
  const { busy, err, run } = useRun()
  return (
    <>
      <button type="button" className="link-danger" disabled={busy} onClick={() => { if (window.confirm('Excluir esta inspiração?')) void run(() => deleteInspirationAction(id)) }}>Excluir</button>
      {err && <span className="form-error" role="alert"> {err}</span>}
    </>
  )
}
