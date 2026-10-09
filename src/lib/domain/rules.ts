// Regras de negócio sobre validade e fluxo.
import type { Pillar, Stage } from './labels.ts'

// ---------- validade ----------
export const isExpired = (validUntil: string | null, today: string): boolean => !!validUntil && validUntil < today

export function campaignCoversPeriod(c: { starts_on: string; ends_on: string }, from: string, to: string): boolean {
  return c.starts_on <= from && c.ends_on >= to
}

// Conteúdo de medicamentos só avança com a revisão farmacêutica marcada.
export function stageBlockedReason(pillar: Pillar, stage: Stage, pharmaReview: boolean): string | null {
  if (pillar === 'medicamentos' && (stage === 'aprovado' || stage === 'publicado') && !pharmaReview) {
    return 'Conteúdo sobre medicamentos precisa da revisão farmacêutica marcada antes de ser aprovado ou publicado.'
  }
  return null
}
