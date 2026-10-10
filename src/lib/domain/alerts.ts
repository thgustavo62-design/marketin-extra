// Regras puras dos alertas: tipos, limites e como decidir severidade/ritmo. Nenhum alerta sai sem dado suficiente.
import type { MetricDef, MonthState } from './targets.ts'

export const ALERT_TYPES = {
  post_overdue: 'Conteúdo atrasado',
  post_no_owner: 'Conteúdo sem responsável',
  approval_stale: 'Aprovação parada',
  campaign_unconfirmed: 'Campanha sem reconfirmação',
  final_missing: 'Arte final ausente',
  integration_stale: 'Dados do Windsor desatualizados',
  collect_failed: 'Falha na coleta',
  target_pace: 'Meta fora do ritmo',
} as const
export type AlertType = keyof typeof ALERT_TYPES
export const isAlertType = (v: unknown): v is AlertType => typeof v === 'string' && Object.hasOwn(ALERT_TYPES, v)

export const SEVERITIES = { info: 'Informativo', warning: 'Atenção', critical: 'Crítico' } as const
export type Severity = keyof typeof SEVERITIES
export const isSeverity = (v: unknown): v is Severity => typeof v === 'string' && Object.hasOwn(SEVERITIES, v)

// Limites (configuráveis no futuro; hoje valem para todas as filiais).
export const THRESHOLDS = {
  approvalStaleHours: 48,
  approvalCriticalHours: 96,
  campaignUnconfirmedDays: 3,
  finalMissingDays: 2,
  noOwnerDays: 7,
  integrationStaleDays: 7,
  overdueCriticalDays: 5,
  /** ritmo de meta: só avalia depois de tantos dias do mês, para não alarmar com pouco dado */
  paceMinElapsedDays: 10,
  /** atraso mínimo em relação ao ritmo esperado (30%) */
  paceShortfall: 0.3,
} as const

export const dedupeKey = (type: AlertType, objectId: string, variant = ''): string => `${type}:${objectId}${variant ? ':' + variant : ''}`

export function overdueSeverity(daysLate: number): Severity {
  return daysLate >= THRESHOLDS.overdueCriticalDays ? 'critical' : 'warning'
}
export function approvalSeverity(hoursWaiting: number): Severity {
  return hoursWaiting >= THRESHOLDS.approvalCriticalHours ? 'critical' : 'warning'
}

export type Pace = { kind: 'missed' | 'behind'; expected: number }

/**
 * Ritmo de uma meta "pelo menos". Só avalia com dado suficiente:
 * - mês encerrado e meta não atingida → "missed";
 * - mês em andamento, passados {paceMinElapsedDays} dias e realizado abaixo do ritmo esperado em mais de 30% → "behind".
 * Metas de teto, mês futuro, meta zero ou realizado ausente nunca geram alerta.
 */
export function paceAlert(def: Pick<MetricDef, 'direction'>, target: number, realized: number | null, state: MonthState, elapsed: number, days: number): Pace | null {
  if (def.direction !== 'atLeast' || realized === null || target <= 0 || state === 'future') return null
  if (state === 'past') return realized < target ? { kind: 'missed', expected: target } : null
  if (elapsed < THRESHOLDS.paceMinElapsedDays) return null
  const expected = (target * elapsed) / days
  return realized < expected * (1 - THRESHOLDS.paceShortfall) ? { kind: 'behind', expected } : null
}

export function paceText(label: string, p: Pace, realized: number, target: number): { title: string; detail: string } {
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return p.kind === 'missed'
    ? { title: `Meta não atingida: ${label}`, detail: `Realizado ${fmt(realized)} de ${fmt(target)} no mês encerrado.` }
    : { title: `Meta abaixo do ritmo: ${label}`, detail: `Realizado ${fmt(realized)}; pelo ritmo do mês o esperado até hoje seria ${fmt(p.expected)} (meta ${fmt(target)}).` }
}

/** Dias inteiros entre duas datas ISO (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5)

export type AlertStatusFilter = 'ativos' | 'lidos' | 'dispensados' | 'resolvidos'
export const isAlertStatus = (v: unknown): v is AlertStatusFilter => v === 'ativos' || v === 'lidos' || v === 'dispensados' || v === 'resolvidos'
