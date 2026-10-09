'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { ROLES, type Role } from '@/lib/perms'
import { setRoleAction } from './actions'

// Papel editável direto na linha (como na tela do Grupo Extra). Se o servidor recusar, volta ao valor anterior e explica.
export function RoleSelect({ id, role, disabled }: { id: string; role: string; disabled?: boolean }) {
  const [value, setValue] = useOptimistic(role)
  const [error, setError] = useState<string | null>(null)

  const change = (next: string) => {
    setError(null)
    startTransition(async () => {
      setValue(next)
      const fd = new FormData()
      fd.set('id', id)
      fd.set('role', next)
      const r = await setRoleAction({}, fd)
      if (r.error) setError(r.error)
    })
  }

  return (
    <div className="role-select">
      <select value={value} disabled={disabled} onChange={(e) => change(e.target.value)} aria-label="Papel">
        {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
      </select>
      {error && <small className="form-error" role="alert">{error}</small>}
    </div>
  )
}
