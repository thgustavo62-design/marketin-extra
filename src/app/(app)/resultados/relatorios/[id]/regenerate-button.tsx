'use client'

import { useState } from 'react'
import { regenerateReportAction } from '../actions'

export function RegenerateButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <>
      <button type="button" className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null)
        const r = await regenerateReportAction(id) // em caso de sucesso a ação redireciona
        setBusy(false)
        if (r && !r.ok) setErr(r.error)
      }}>{busy ? 'Gerando…' : 'Gerar de novo (retrato novo)'}</button>
      {err && <span className="form-error" role="alert"> {err}</span>}
    </>
  )
}
