// Motor de inteligência: regras PURAS e testadas. Nada aqui lê banco nem rede.
// Princípios: toda conclusão leva amostra, período, método e limites; sem amostra suficiente a resposta é "inconclusiva";
// comparação entre grupos usa teste de permutação (corrige a escolha do melhor e do pior); nada é causal.
import { fmtNum, median } from './publication-metrics.ts'

export type Confidence = 'alta' | 'media' | 'baixa' | 'inconclusiva'
export type Impact = 'alto' | 'medio' | 'baixo'
export type Area = 'resultados' | 'processo' | 'dados'

export const CONFIDENCE_LABEL: Record<Confidence, string> = { alta: 'Confiança alta', media: 'Confiança média', baixa: 'Tendência fraca', inconclusiva: 'Inconclusivo' }
export const IMPACT_LABEL: Record<Impact, string> = { alto: 'Impacto alto', medio: 'Impacto médio', baixo: 'Impacto baixo' }

export type Finding = {
  key: string
  area: Area
  title: string
  statement: string
  evidence: string[]
  confidence: Confidence
  impact: Impact
  action: { label: string; href: string } | null
  method: string
  limits: string[]
  period: string
}

// ---------- estatística ----------
/** Gerador pseudoaleatório determinístico: o mesmo dado sempre dá o mesmo resultado. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type GroupSample = { key: string; values: number[] }

const rangeOfMedians = (groups: number[][]): number => {
  const m = groups.map((g) => median(g)!).filter((x) => x !== null)
  return Math.max(...m) - Math.min(...m)
}

/**
 * Teste de permutação sobre a AMPLITUDE das medianas (maior − menor mediana entre os grupos).
 * Embaralha os rótulos mantendo o tamanho de cada grupo. p = chance de ver uma amplitude igual ou maior só por acaso.
 * Como a estatística já é "melhor − pior", ela corrige o viés de escolher os extremos depois de olhar os dados.
 */
export function permutationRangeTest(groups: GroupSample[], iterations = 2000, seed = 20261011): { observed: number; p: number } {
  const usable = groups.filter((g) => g.values.length >= 2)
  if (usable.length < 2) return { observed: 0, p: 1 }
  const sizes = usable.map((g) => g.values.length)
  const pooled = usable.flatMap((g) => g.values)
  const observed = rangeOfMedians(usable.map((g) => g.values))
  const rnd = mulberry32(seed)
  let count = 0
  const work = [...pooled]
  for (let it = 0; it < iterations; it++) {
    for (let i = work.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [work[i], work[j]] = [work[j], work[i]] }
    let off = 0
    const parts = sizes.map((n) => { const part = work.slice(off, off + n); off += n; return part })
    if (rangeOfMedians(parts) >= observed - 1e-12) count++
  }
  return { observed, p: (count + 1) / (iterations + 1) }
}

/** Confiança a partir do p-valor e do menor grupo comparado. */
export function confidenceOf(p: number, minN: number): Confidence {
  if (p < 0.05 && minN >= 8) return 'alta'
  if (p < 0.1 && minN >= 5) return 'media'
  if (p < 0.2 && minN >= 3) return 'baixa'
  return 'inconclusiva'
}

export function impactOfRatio(ratio: number | null): Impact {
  if (ratio === null) return 'medio'
  return ratio >= 1.5 ? 'alto' : ratio >= 1.2 ? 'medio' : 'baixo'
}

/** Assinatura curta e estável de um achado (para saber se a análise mudou depois de uma decisão). */
export function fingerprintOf(f: Pick<Finding, 'key' | 'statement' | 'confidence'>): string {
  let h = 5381
  const s = `${f.key}|${f.confidence}|${f.statement}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

const RANK: Record<Confidence, number> = { alta: 0, media: 1, baixa: 2, inconclusiva: 3 }
const IMP: Record<Impact, number> = { alto: 0, medio: 1, baixo: 2 }
export function sortFindings(list: Finding[]): Finding[] {
  return [...list].sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || IMP[a.impact] - IMP[b.impact] || a.key.localeCompare(b.key))
}

// ---------- comparação entre grupos ----------
export type CompareOpts = {
  key: string
  area?: Area
  title: string
  dimension: string
  metric: string
  groups: GroupSample[]
  minPerGroup?: number
  period: string
  limits?: string[]
  format?: (n: number) => string
  /** o que fazer quando há um vencedor confiável */
  actionFor?: (best: string) => { label: string; href: string } | null
  collectHref?: string
  method?: string
}

export function compareGroups(o: CompareOpts): Finding | null {
  const minN = o.minPerGroup ?? 3
  const fmt = o.format ?? ((n) => fmtNum(n, 2))
  const all = o.groups.filter((g) => g.values.length > 0)
  if (all.length === 0) return null
  const usable = all.filter((g) => g.values.length >= minN)
  const small = all.filter((g) => g.values.length < minN)
  const method = o.method ?? 'Mediana por grupo; teste de permutação sobre a diferença entre a maior e a menor mediana (já corrige a escolha do melhor e do pior).'
  const base = { key: o.key, area: o.area ?? 'resultados', title: o.title, method, period: o.period, limits: o.limits ?? [] } as const
  const smallLines = small.map((g) => `${g.key}: amostra pequena (n=${g.values.length}), fora da comparação`)
  const collect = { label: 'Coletar mais publicações antes de decidir', href: o.collectHref ?? '/resultados/vinculos' }

  if (usable.length < 2) {
    return {
      ...base, confidence: 'inconclusiva', impact: 'baixo', action: collect,
      statement: `Ainda não há amostra mínima (n ≥ ${minN} por grupo) para comparar ${o.dimension}.`,
      evidence: [...usable.map((g) => `${g.key}: mediana ${fmt(median(g.values)!)} (n=${g.values.length})`), ...smallLines],
    }
  }
  const stats = usable.map((g) => ({ key: g.key, n: g.values.length, med: median(g.values)! })).sort((a, b) => b.med - a.med)
  const best = stats[0], worst = stats[stats.length - 1]
  const { p } = permutationRangeTest(usable)
  const conf = confidenceOf(p, Math.min(...stats.map((s) => s.n)))
  const ratio = worst.med > 0 ? best.med / worst.med : null
  const evidence = [
    ...stats.map((s) => `${s.key}: mediana ${fmt(s.med)} (n=${s.n})`), ...smallLines,
    `Teste de permutação: p = ${p.toFixed(3).replace('.', ',')} (quanto menor, menos provável que a diferença seja acaso).`,
  ]
  if (conf === 'inconclusiva') {
    return {
      ...base, confidence: conf, impact: 'baixo', action: collect, evidence,
      statement: `Entre os grupos de ${o.dimension}, a diferença de ${o.metric} pode ser acaso (p = ${p.toFixed(2).replace('.', ',')}): não há base para dizer qual é melhor.`,
    }
  }
  return {
    ...base, confidence: conf, impact: impactOfRatio(ratio), evidence,
    statement: `Em ${o.dimension}, ${best.key} teve a maior mediana de ${o.metric} (${fmt(best.med)}, n=${best.n}) e ${worst.key} a menor (${fmt(worst.med)}, n=${worst.n})${ratio ? ` — cerca de ${ratio.toFixed(1).replace('.', ',')}× de diferença` : ''}.`,
    action: conf === 'baixa' ? collect : (o.actionFor?.(best.key) ?? null),
  }
}

// ---------- calendário ----------
export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
export const weekdayName = (iso: string): string => WEEKDAY_NAMES[new Date(iso + 'T00:00:00Z').getUTCDay()]

export function daypartOf(hour: number): string {
  if (hour < 6) return 'Madrugada (0–5h)'
  if (hour < 12) return 'Manhã (6–11h)'
  if (hour < 18) return 'Tarde (12–17h)'
  return 'Noite (18–23h)'
}

// ---------- processo (mineração dos eventos de etapa) ----------
export type DurationRow = { stage: string; hours: number; ongoing: boolean }
export type StageDuration = { stage: string; n: number; medianHours: number; p90Hours: number; ongoing: number }

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Tempo em cada etapa: só passagens concluídas entram na mediana; as que ainda estão lá são contadas à parte. */
export function summarizeDurations(rows: DurationRow[]): StageDuration[] {
  const by = new Map<string, { done: number[]; ongoing: number }>()
  for (const r of rows) {
    const g = by.get(r.stage) ?? { done: [], ongoing: 0 }
    if (r.ongoing) g.ongoing++
    else if (Number.isFinite(r.hours) && r.hours >= 0) g.done.push(r.hours)
    by.set(r.stage, g)
  }
  return [...by.entries()].filter(([, g]) => g.done.length > 0).map(([stage, g]) => {
    const s = [...g.done].sort((a, b) => a - b)
    return { stage, n: s.length, medianHours: quantile(s, 0.5), p90Hours: quantile(s, 0.9), ongoing: g.ongoing }
  })
}

export function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return 'N/D'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0).replace('.', ',')} h`
  return `${(h / 24).toFixed(1).replace('.', ',')} dias`
}

/** Etapa onde o conteúdo mais espera (só com 5+ passagens concluídas e mediana de pelo menos 24 h). */
export function bottleneck(d: StageDuration[], stageLabel: (s: string) => string): { stage: StageDuration; finding: Omit<Finding, 'key' | 'area' | 'title' | 'period' | 'method' | 'limits'> } | null {
  const ok = d.filter((x) => x.n >= 5 && x.medianHours >= 24).sort((a, b) => b.medianHours - a.medianHours)
  if (ok.length === 0) return null
  const top = ok[0]
  const conf: Confidence = top.n >= 15 ? 'alta' : top.n >= 8 ? 'media' : 'baixa'
  return {
    stage: top,
    finding: {
      statement: `A etapa "${stageLabel(top.stage)}" é onde o conteúdo mais espera: mediana de ${fmtHours(top.medianHours)} (n=${top.n}; 90% ficam até ${fmtHours(top.p90Hours)}).`,
      evidence: d.sort((a, b) => b.medianHours - a.medianHours).map((x) => `${stageLabel(x.stage)}: mediana ${fmtHours(x.medianHours)} (n=${x.n}${x.ongoing ? `, ${x.ongoing} ainda nela` : ''})`),
      confidence: conf, impact: top.medianHours >= 72 ? 'alto' : 'medio', action: { label: 'Ver os cartões nesta etapa', href: `/producao?etapa=${top.stage}` },
    },
  }
}

// ---------- qualidade dos dados ----------
export type QualityItem = {
  key: string
  label: string
  weight: number
  /** 0 a 1; null = não se aplica (fica fora da nota) */
  score: number | null
  detail: string
  impact: string
  fix: { label: string; href: string } | null
}
export type QualityResult = { score: number | null; items: (QualityItem & { deficit: number })[] }

export function qualityScore(items: QualityItem[]): QualityResult {
  const applicable = items.filter((i) => i.score !== null)
  const total = applicable.reduce((s, i) => s + i.weight, 0)
  const score = total === 0 ? null : Math.round((applicable.reduce((s, i) => s + i.weight * (i.score as number), 0) / total) * 100)
  const withDeficit = items.map((i) => ({ ...i, deficit: i.score === null ? 0 : i.weight * (1 - i.score) }))
  return { score, items: withDeficit.sort((a, b) => b.deficit - a.deficit) }
}

export const coverage = (part: number, total: number): number | null => (total <= 0 ? null : Math.min(1, part / total))
export const sampleScore = (n: number, target = 30): number => Math.min(1, Math.max(0, n / target))
/** Frescor da coleta: 1 até 3 dias; cai linearmente até 0 aos 14 dias; nunca coletado = 0. */
export const freshnessScore = (days: number | null): number => (days === null ? 0 : days <= 3 ? 1 : days >= 14 ? 0 : 1 - (days - 3) / 11)

export const scoreBand = (score: number | null): { label: string; tone: 'ok' | 'warn' | 'bad' | 'none' } =>
  score === null ? { label: 'Sem dados', tone: 'none' } : score >= 80 ? { label: 'Boa', tone: 'ok' } : score >= 55 ? { label: 'Razoável', tone: 'warn' } : { label: 'Frágil', tone: 'bad' }

// ---------- decisões ----------
export const DECISION_STATUS = { aceita: 'Vou aplicar', dispensada: 'Dispensada', concluida: 'Concluída' } as const
export type DecisionStatus = keyof typeof DECISION_STATUS
export const isDecisionStatus = (v: unknown): v is DecisionStatus => typeof v === 'string' && Object.hasOwn(DECISION_STATUS, v)

/** A decisão foi tomada sobre a mesma análise de hoje? */
export const decisionIsCurrent = (decisionFingerprint: string, currentFingerprint: string | null): boolean => currentFingerprint !== null && decisionFingerprint === currentFingerprint
