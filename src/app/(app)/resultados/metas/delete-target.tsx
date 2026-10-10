'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteTargetAction } from './actions'

export function DeleteTarget({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <>
      <button type="button" className="link-danger" disabled={busy} onClick={async () => {
        if (!window.confirm('Excluir esta meta?')) return
        setBusy(true); setErr(null)
        const r = await deleteTargetAction(id)
        setBusy(false)
        if (!r.ok) setErr(r.error); else router.refresh()
      }}>Excluir</button>
      {err && <span className="form-error" role="alert"> {err}</span>}
    </>
  )
}
