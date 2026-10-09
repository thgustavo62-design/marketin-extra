'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { setApprovalRequiredAction } from './actions'

export function ApprovalToggle({ brandId, name, initial }: { brandId: string; name: string; initial: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function change(next: boolean) {
    setBusy(true); setErr(null); setOn(next)
    const r = await setApprovalRequiredAction(brandId, next)
    setBusy(false)
    if (!r.ok) { setOn(!next); setErr(r.error); return }
    router.refresh()
  }

  return (
    <div className="policy-row">
      <label className="check inline">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => change(e.target.checked)} aria-label={`Exigir aprovação em ${name}`} />
        <b>{name}</b> — exigir aprovação registrada antes de aprovar, agendar ou publicar
      </label>
      {err && <p className="form-error" role="alert">{err}</p>}
    </div>
  )
}
