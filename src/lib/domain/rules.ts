// Regras de negócio sobre validade e fluxo.
import { STAGE_ORDER, type Pillar, type Stage } from './labels.ts'

// ---------- validade ----------
export const isExpired = (validUntil: string | null, today: string): boolean => !!validUntil && validUntil < today

export function campaignCoversPeriod(c: { starts_on: string; ends_on: string }, from: string, to: string): boolean {
  return c.starts_on <= from && c.ends_on >= to
}

// ---------- fluxo de produção ----------
// Conteúdo de medicamentos só chega a aprovado/agendado/publicado com a revisão farmacêutica marcada.
const PHARMA_GATED: Stage[] = ['aprovado', 'agendado', 'publicado']

export function stageBlockedReason(pillar: Pillar, stage: Stage, pharmaReview: boolean): string | null {
  if (pillar === 'medicamentos' && PHARMA_GATED.includes(stage) && !pharmaReview) {
    return 'Conteúdo sobre medicamentos precisa da revisão farmacêutica marcada antes de ser aprovado, agendado ou publicado.'
  }
  return null
}

// "cancelado" fica fora da ordem de avanço: é sempre permitido ir para ele e voltar dele.
const rank = (s: Stage): number => (s === 'cancelado' ? -1 : STAGE_ORDER.indexOf(s))

// Cartão marcado como bloqueado não avança: só recua ou cancela até o bloqueio ser resolvido.
export function moveBlockedReason(from: Stage, to: Stage, blockedReason: string | null): string | null {
  if (blockedReason && to !== 'cancelado' && rank(to) > rank(from)) {
    return `Cartão bloqueado (${blockedReason}). Resolva o bloqueio antes de avançar.`
  }
  return null
}

// "Publicado" só vale com confirmação humana: agendar não é publicar.
export const needsPublishConfirmation = (to: Stage): boolean => to === 'publicado'
