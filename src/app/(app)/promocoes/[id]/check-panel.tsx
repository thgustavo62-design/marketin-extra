'use client'

// "Verificar arte": lista o que merece atenção antes de aprovar ou exportar, com atalho para chegar no ponto.
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from 'lucide-react'
import { SEVERITY_LABEL, summarizeCheck, type CheckIssue, type CheckSeverity } from '@/lib/domain/promo-check'

const ICON: Record<CheckSeverity, React.ReactNode> = { bloqueio: <OctagonAlert size={15} />, revisao: <AlertTriangle size={15} />, info: <Info size={15} /> }

export function CheckPanel({ issues, onGoto, onClose }: { issues: CheckIssue[]; onGoto: (i: CheckIssue) => void; onClose: () => void }) {
  const sum = summarizeCheck(issues)
  const groups = (['bloqueio', 'revisao', 'info'] as const).map((s) => ({ s, list: issues.filter((i) => i.severity === s) })).filter((g) => g.list.length)
  return (
    <section className="canva-check card" aria-label="Verificar arte" data-blockers={sum.bloqueio}>
      <div className="canva-check-head">
        <h3>Verificar arte</h3>
        <span className="muted">{issues.length === 0 ? 'Nada a apontar.' : `${sum.bloqueio} para corrigir · ${sum.revisao} para revisar · ${sum.info} informação(ões)`}</span>
        <button type="button" className="mini-btn" onClick={onClose} aria-label="Fechar a verificação"><X size={12} /></button>
      </div>
      {issues.length === 0 ? <p className="form-ok"><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Preços, fotos, validade e elementos livres sem pendências. A revisão humana antes de publicar continua necessária.</p> : (
        groups.map((g) => (
          <div key={g.s} className={`canva-check-group ${g.s}`}>
            <h4>{ICON[g.s]} {SEVERITY_LABEL[g.s]} ({g.list.length})</h4>
            <ul>
              {g.list.slice(0, 40).map((i, k) => (
                <li key={`${i.code}-${i.itemId ?? i.layerId ?? ''}-${k}`} data-code={i.code}>
                  <span>{i.message}</span>
                  {(i.itemId || i.layerId) && <button type="button" className="mini-btn" onClick={() => onGoto(i)}>Ir para</button>}
                </li>
              ))}
              {g.list.length > 40 && <li className="muted">… e mais {g.list.length - 40}.</li>}
            </ul>
          </div>
        ))
      )}
      <p className="muted"><small>Conferência automática de dados e de posições. Não avalia o visual, não vê imagens e não substitui a revisão do responsável (inclusive a regra de publicidade de medicamentos).</small></p>
    </section>
  )
}
