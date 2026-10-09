// Regras puras de aprovação: quem decide e o que exige aprovação.
import type { Stage } from './labels.ts'

export type Decision = 'approved' | 'rejected' | 'changes_requested'

// Etapas que só valem para conteúdo aprovado (quando a filial exige aprovação).
const APPROVAL_GATED: Stage[] = ['aprovado', 'agendado', 'publicado']
export const needsValidApproval = (to: Stage, approvalRequired: boolean): boolean => approvalRequired && APPROVAL_GATED.includes(to)

// Quem pode decidir: o revisor indicado ou um administrador. Se não houver revisor, só administrador.
// Quem enviou não aprova o próprio envio, a não ser que seja administrador (equipe pequena).
export function canDecide(opts: { userId: string; role: string; reviewerId: string | null; submittedBy: string | null }): string | null {
  const admin = opts.role === 'admin'
  const isReviewer = opts.reviewerId !== null && opts.reviewerId === opts.userId
  if (!admin && !isReviewer) return 'Só o revisor indicado ou um administrador pode decidir.'
  if (!admin && opts.submittedBy === opts.userId) return 'Quem enviou para aprovação não pode aprovar o próprio envio.'
  return null
}

export function decisionNeedsReason(d: Decision): boolean {
  return d !== 'approved'
}

export const DECISION_LABELS: Record<Decision, string> = { approved: 'Aprovado', rejected: 'Reprovado', changes_requested: 'Ajustes solicitados' }
