'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CONFIDENCE_LABEL, DECISION_STATUS, IMPACT_LABEL, decisionIsCurrent, fingerprintOf, type DecisionStatus, type Finding } from '@/lib/domain'
import { clearInsightDecisionAction, decideInsightAction } from './actions'

export type DecisionView = { status: DecisionStatus; note: string | null; fingerprint: string; by: string | null; at: string }

const TONE: Record<Finding['confidence'], string> = { alta: 'on', media: 'on', baixa: 'soft', inconclusiva: 'off' }

export function FindingCard({ brandId, finding, decision, canEdit }: { brandId: string; finding: Finding; decision: DecisionView | null; canEdit: boolean }) {
  const router = useRouter()
  const fp = fingerprintOf(finding)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setErr((r as { error: string }).error); return }
    setNote(''); router.refresh()
  }
  const current = decision ? decisionIsCurrent(decision.fingerprint, fp) : false

  return (
    <article className="card finding" data-finding={finding.key} data-confidence={finding.confidence}>
      <div className="finding-badges">
        <span className={`pill ${TONE[finding.confidence]}`}>{CONFIDENCE_LABEL[finding.confidence]}</span>{' '}
        <span className="pill soft">{IMPACT_LABEL[finding.impact]}</span>{' '}
        {decision && <span className="pill on" data-decision={decision.status}>{DECISION_STATUS[decision.status]}</span>}
      </div>
      <h3>{finding.title}</h3>
      <p className="finding-statement">{finding.statement}</p>
      {decision && (
        <p className="muted" data-decision-note>
          {DECISION_STATUS[decision.status]} por {decision.by ?? '—'} em {new Date(decision.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
          {decision.note ? ` — ${decision.note}` : ''}.{!current && <b> A análise mudou desde essa decisão: reveja.</b>}
        </p>
      )}
      <details>
        <summary>Evidência, método e limites</summary>
        <ul className="finding-evidence">{finding.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <p className="muted"><b>Período:</b> {finding.period}</p>
        <p className="muted"><b>Método:</b> {finding.method}</p>
        {finding.limits.length > 0 && <ul className="finding-limits">{finding.limits.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </details>
      <div className="card-actions">
        {finding.action && <Link href={finding.action.href} className="btn">{finding.action.label}</Link>}
      </div>
      {canEdit && (
        <div className="decide">
          <input type="text" aria-label="Observação da decisão" placeholder="Observação (obrigatória para dispensar)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <div className="form-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => run(() => decideInsightAction(brandId, finding.key, 'aceita', note, fp))}>Vou aplicar</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => run(() => decideInsightAction(brandId, finding.key, 'concluida', note, fp))}>Concluída</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => run(() => decideInsightAction(brandId, finding.key, 'dispensada', note, fp))}>Dispensar</button>
            {decision && <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => clearInsightDecisionAction(brandId, finding.key))}>Limpar decisão</button>}
          </div>
          {err && <p className="form-error" role="alert">{err}</p>}
        </div>
      )}
    </article>
  )
}
