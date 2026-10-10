// Metas mensais por filial. Só indicadores que podem ser somados ou lidos de verdade: alcance NÃO entra como meta de soma
// (alcance de várias peças/dias não é o alcance único da conta) e "novos seguidores" fica de fora (a API só cobre 30 dias).

export type MetricSource = 'internal' | 'instagram' | 'ads'
export type Direction = 'atLeast' | 'atMost'
export type MetricDef = { key: string; label: string; unit: 'count' | 'brl'; source: MetricSource; direction: Direction; note: string }

export const TARGET_METRICS = {
  posts_planned: { key: 'posts_planned', label: 'Conteúdos planejados', unit: 'count', source: 'internal', direction: 'atLeast', note: 'Conteúdos do mês no calendário, exceto cancelados.' },
  posts_published: { key: 'posts_published', label: 'Conteúdos publicados', unit: 'count', source: 'internal', direction: 'atLeast', note: 'Conteúdos do mês na etapa Publicado.' },
  ig_views: { key: 'ig_views', label: 'Visualizações no Instagram', unit: 'count', source: 'instagram', direction: 'atLeast', note: 'Soma diária de visualizações da conta (Windsor).' },
  ig_interactions: { key: 'ig_interactions', label: 'Interações no Instagram', unit: 'count', source: 'instagram', direction: 'atLeast', note: 'Soma diária de interações da conta (Windsor).' },
  ig_followers: { key: 'ig_followers', label: 'Seguidores no Instagram', unit: 'count', source: 'instagram', direction: 'atLeast', note: 'Total de seguidores no fim do período (só o mês atual ou o último coletado).' },
  ads_spend: { key: 'ads_spend', label: 'Investimento em anúncios', unit: 'brl', source: 'ads', direction: 'atMost', note: 'Gasto no mês, em reais (Meta Ads via Windsor). A meta é um teto.' },
  ads_conversations: { key: 'ads_conversations', label: 'Conversas iniciadas (anúncios)', unit: 'count', source: 'ads', direction: 'atLeast', note: 'Conversas iniciadas atribuídas a anúncios (janela de 7 dias).' },
  ads_cost_per_conversation: { key: 'ads_cost_per_conversation', label: 'Custo por conversa', unit: 'brl', source: 'ads', direction: 'atMost', note: 'Investimento ÷ conversas iniciadas; N/D sem conversas. A meta é um teto.' },
} as const satisfies Record<string, MetricDef>

export type MetricKey = keyof typeof TARGET_METRICS
export const isMetricKey = (v: unknown): v is MetricKey => typeof v === 'string' && Object.hasOwn(TARGET_METRICS, v)

// ---------- mês ----------
export const isYearMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

export function monthRange(ym: string): { from: string; to: string; days: number } {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(days).padStart(2, '0')}`, days }
}

export function previousMonth(ym: string): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7))
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export type MonthState = 'past' | 'current' | 'future'
export function monthState(ym: string, today: string): { state: MonthState; elapsed: number; days: number } {
  const r = monthRange(ym)
  if (today > r.to) return { state: 'past', elapsed: r.days, days: r.days }
  if (today < r.from) return { state: 'future', elapsed: 0, days: r.days }
  return { state: 'current', elapsed: Number(today.slice(8)), days: r.days }
}

/** Fim da janela de leitura: não pede dados do futuro. */
export const readTo = (ym: string, today: string): string => { const r = monthRange(ym); return today < r.to ? (today < r.from ? r.from : today) : r.to }

// ---------- progresso ----------
export type ProgressStatus = 'nd' | 'atingida' | 'em_andamento' | 'abaixo' | 'dentro' | 'acima'
export type Progress = { status: ProgressStatus; pct: number | null; label: string }

/**
 * Compara realizado e meta sem afirmar causa.
 * - "pelo menos": atingida (≥100%), em andamento (mês aberto) ou abaixo (mês encerrado).
 * - "no máximo" (teto): dentro ou acima.
 * Realizado ausente é N/D, nunca 0%.
 */
export function progress(def: MetricDef, realized: number | null, target: number, state: MonthState): Progress {
  if (realized === null) return { status: 'nd', pct: null, label: 'N/D' }
  if (def.direction === 'atMost') {
    const pct = target > 0 ? (realized / target) * 100 : null
    return realized <= target ? { status: 'dentro', pct, label: 'Dentro do teto' } : { status: 'acima', pct, label: 'Acima do teto' }
  }
  const pct = target > 0 ? (realized / target) * 100 : null
  if (pct !== null && pct >= 100) return { status: 'atingida', pct, label: 'Atingida' }
  return state === 'past' ? { status: 'abaixo', pct, label: 'Abaixo da meta' } : { status: 'em_andamento', pct, label: 'Em andamento' }
}

export const costPerConversation = (spend: number | null, conversations: number | null): number | null =>
  spend === null || conversations === null || conversations <= 0 ? null : spend / conversations

/** Variação contra o mês anterior em %, sem sugerir causa. N/D se o anterior for ausente ou zero. */
export const changeVs = (cur: number | null, prev: number | null): number | null => (cur === null || prev === null || prev === 0 ? null : ((cur - prev) / prev) * 100)

export function formatValue(def: MetricDef, v: number | null): string {
  if (v === null) return 'N/D'
  return def.unit === 'brl' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
