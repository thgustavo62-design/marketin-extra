'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ALERT_TYPES, SEVERITIES, type AlertStatusFilter } from '@/lib/domain'
import type { AlertRow } from '@/lib/data'
import { dismissAlertAction, markAllReadAction, markReadAction, reevaluateAction, reopenAlertAction } from './actions'

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

export function AlertList({ rows, status }: { rows: AlertRow[]; status: AlertStatusFilter }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key); setErr(null)
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setErr((r as { error: string }).error); return }
    router.refresh()
  }

  return (
    <>
      <div className="form-actions">
        <button type="button" className="secondary" disabled={busy !== null} onClick={() => run('re', reevaluateAction)}>Reavaliar agora</button>
        {status === 'ativos' && rows.length > 0 && <button type="button" className="secondary" disabled={busy !== null} onClick={() => run('all', markAllReadAction)}>Marcar todos como lidos</button>}
      </div>
      {err && <p className="form-error" role="alert">{err}</p>}
      {rows.length === 0 ? (
        <p className="empty">{status === 'ativos' ? 'Nenhum alerta ativo. Tudo em dia neste recorte.' : 'Nada por aqui.'}</p>
      ) : (
        <ul className="alert-list">
          {rows.map((a) => (
            <li key={a.id} data-severity={a.severity} data-type={a.type}>
              <div>
                <span className={`pill ${a.severity === 'critical' ? 'off' : a.severity === 'warning' ? 'soft' : 'on'}`}>{SEVERITIES[a.severity]}</span>{' '}
                <small className="muted">{ALERT_TYPES[a.type]} · {a.brand_name}{a.branch_name ? ` · ${a.branch_name}` : ''} · {a.resolved_at ? `resolvido em ${when(a.resolved_at)}` : `desde ${when(a.created_at)}`}</small>
                <h3><Link href={a.href}>{a.title}</Link></h3>
                {a.detail && <p>{a.detail}</p>}
              </div>
              <div className="alert-actions">
                <Link href={a.href} className="btn">Abrir</Link>
                {!a.resolved_at && !a.dismissed_at && !a.read_at && <button type="button" className="mini-btn" disabled={busy !== null} onClick={() => run(a.id, () => markReadAction(a.id))}>Marcar como lido</button>}
                {!a.resolved_at && !a.dismissed_at && <button type="button" className="mini-btn" disabled={busy !== null} onClick={() => run(a.id, () => dismissAlertAction(a.id))}>Dispensar</button>}
                {!a.resolved_at && (a.dismissed_at || a.read_at) && <button type="button" className="mini-btn" disabled={busy !== null} onClick={() => run(a.id, () => reopenAlertAction(a.id))}>Reabrir</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
