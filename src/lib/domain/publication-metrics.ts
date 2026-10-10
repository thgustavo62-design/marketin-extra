// Métricas por publicação. Regras do plano: ausente é N/D (null), nunca zero; alcance não é aditivo;
// nada de comparar peça recém-publicada com peça madura; toda taxa declara a fórmula.
import { addDays } from './dates.ts'
import type { Format } from './labels.ts'

/** Dias mínimos de vida para entrar em comparações/medianas. */
export const MATURITY_DAYS = 7
/** Amostra mínima para falar em "mediana"; abaixo disso só se mostra o n. */
export const MIN_SAMPLE = 3

export type PubMetrics = {
  reach: number | null; views: number | null; likes: number | null; comments: number | null
  saves: number | null; shares: number | null; reel_interactions: number | null
}

export const EMPTY_METRICS: PubMetrics = { reach: null, views: null, likes: null, comments: null, saves: null, shares: null, reel_interactions: null }

const asCount = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)

// ---------- formato da mídia ----------
export type MediaFormat = Format | 'story' | 'outro'

export function mediaFormat(productType: string | null | undefined, mediaType: string | null | undefined): MediaFormat {
  const p = (productType ?? '').toUpperCase(), t = (mediaType ?? '').toUpperCase()
  if (p === 'REELS') return 'reels'
  if (p === 'STORY') return 'story'
  if (t === 'CAROUSEL_ALBUM') return 'carrossel'
  if (p === 'FEED' || t === 'IMAGE' || t === 'VIDEO') return 'feed'
  return 'outro'
}

// ---------- leitura de uma linha do Windsor ----------
export type WindsorMediaRow = {
  account_name?: string; account_id?: string | number; media_id?: string; media_type?: string; media_product_type?: string; timestamp?: string
  media_permalink?: string; media_caption?: string; media_reach?: unknown; media_views?: unknown; media_like_count?: unknown
  media_comments_count?: unknown; media_saved?: unknown; media_shares?: unknown; media_reel_total_interactions?: unknown
}

export type ParsedMedia = {
  external_account_id: string; account_name: string; external_media_id: string
  permalink: string | null; media_type: string | null; media_product_type: string | null; caption_excerpt: string | null
  published_at: string | null; metrics: PubMetrics; quality: 'complete' | 'partial'
}

// Colunas que sempre existem numa publicação de feed; Reels têm a mais (interações do Reel).
export function parseMediaRow(r: WindsorMediaRow): ParsedMedia | null {
  const mediaId = r.media_id ? String(r.media_id) : ''
  const account = r.account_name ? String(r.account_name) : ''
  if (!mediaId || !account) return null
  const isReel = mediaFormat(r.media_product_type, r.media_type) === 'reels'
  const metrics: PubMetrics = {
    reach: asCount(r.media_reach), views: asCount(r.media_views), likes: asCount(r.media_like_count), comments: asCount(r.media_comments_count),
    saves: asCount(r.media_saved), shares: asCount(r.media_shares), reel_interactions: isReel ? asCount(r.media_reel_total_interactions) : null,
  }
  const core = [metrics.reach, metrics.views, metrics.likes, metrics.comments, metrics.saves, metrics.shares]
  const ts = typeof r.timestamp === 'string' && !Number.isNaN(Date.parse(r.timestamp)) ? new Date(r.timestamp).toISOString() : null
  const link = typeof r.media_permalink === 'string' && /^https:\/\//.test(r.media_permalink) ? r.media_permalink : null
  const cap = typeof r.media_caption === 'string' ? r.media_caption.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
  return {
    external_account_id: r.account_id !== undefined && r.account_id !== null && String(r.account_id) !== '' ? String(r.account_id) : account,
    account_name: account, external_media_id: mediaId, permalink: link, media_type: r.media_type ?? null, media_product_type: r.media_product_type ?? null,
    caption_excerpt: cap || null, published_at: ts, metrics, quality: core.every((v) => v !== null) ? 'complete' : 'partial',
  }
}

// ---------- indicadores derivados (todos com fórmula declarada) ----------
/** Interações = curtidas + comentários + salvamentos + compartilhamentos. N/D se qualquer parcela faltar. */
export function interactions(m: PubMetrics): number | null {
  const parts = [m.likes, m.comments, m.saves, m.shares]
  return parts.every((v): v is number => v !== null) ? parts.reduce((s, v) => s + v, 0) : null
}

/** Engajamento = interações ÷ alcance × 100. N/D se alcance ausente ou zero. */
export function engagementRate(m: PubMetrics): number | null {
  const i = interactions(m)
  return i === null || m.reach === null || m.reach <= 0 ? null : (i / m.reach) * 100
}

/** Quantos por mil contas alcançadas (valor ÷ alcance × 1000). N/D se alcance ausente ou zero. */
export function perThousandReach(value: number | null, reach: number | null): number | null {
  return value === null || reach === null || reach <= 0 ? null : (value / reach) * 1000
}

export const fmtNum = (n: number | null, digits = 0): string => (n === null ? 'N/D' : n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }))
export const fmtPct = (n: number | null): string => (n === null ? 'N/D' : `${n.toFixed(2).replace('.', ',')}%`)

// ---------- maturidade e medianas ----------
/** Dias entre a data de publicação (calendário de São Paulo) e a data de referência. */
export function ageDays(publishedOn: string, asOf: string): number {
  return Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(publishedOn + 'T00:00:00Z')) / 864e5)
}
export const isMature = (publishedOn: string, asOf: string): boolean => ageDays(publishedOn, asOf) >= MATURITY_DAYS

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export type Group = { key: string; n: number; median: number | null; enough: boolean }

// Mediana por grupo, só com publicações maduras e valor disponível. Sempre devolve o n.
export function groupMedians<T>(items: T[], key: (t: T) => string, value: (t: T) => number | null, mature: (t: T) => boolean): Group[] {
  const by = new Map<string, number[]>()
  for (const it of items) {
    if (!mature(it)) continue
    const v = value(it)
    if (v === null) continue
    const k = key(it)
    by.set(k, [...(by.get(k) ?? []), v])
  }
  return [...by.entries()].map(([k, vs]) => ({ key: k, n: vs.length, median: vs.length >= MIN_SAMPLE ? median(vs) : null, enough: vs.length >= MIN_SAMPLE })).sort((a, b) => a.key.localeCompare(b.key, 'pt-BR'))
}

// ---------- sugestão de vínculo (nunca automática) ----------
export type PubForMatch = { id: string; brand_id: string; published_on: string | null; format: MediaFormat }
export type PostForMatch = { id: string; brand_id: string; post_date: string; format: Format; stage: string }

/**
 * Sugere vínculo só quando é inequívoco dos dois lados: mesma filial, mesmo dia e mesmo formato, com exatamente
 * uma publicação e exatamente um conteúdo nessa combinação. Legenda parecida, horário aproximado ou curtidas nunca contam.
 * Quem decide é uma pessoa; a sugestão só poupa a busca.
 */
export function suggestMatches(pubs: PubForMatch[], posts: PostForMatch[]): { publicationId: string; postId: string }[] {
  const k = (brand: string, day: string, fmt: string) => `${brand}|${day}|${fmt}`
  const pubBy = new Map<string, PubForMatch[]>(), postBy = new Map<string, PostForMatch[]>()
  for (const p of pubs) if (p.published_on && (p.format === 'feed' || p.format === 'carrossel' || p.format === 'reels')) pubBy.set(k(p.brand_id, p.published_on, p.format), [...(pubBy.get(k(p.brand_id, p.published_on, p.format)) ?? []), p])
  for (const p of posts) if (p.stage !== 'cancelado') postBy.set(k(p.brand_id, p.post_date, p.format), [...(postBy.get(k(p.brand_id, p.post_date, p.format)) ?? []), p])
  const out: { publicationId: string; postId: string }[] = []
  for (const [key, ps] of pubBy) {
    const cs = postBy.get(key)
    if (ps.length === 1 && cs && cs.length === 1) out.push({ publicationId: ps[0].id, postId: cs[0].id })
  }
  return out
}

/** Data local de São Paulo (YYYY-MM-DD) de um instante ISO. */
export function saoPauloDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export const candidateWindow = (publishedOn: string): { from: string; to: string } => ({ from: addDays(publishedOn, -3), to: addDays(publishedOn, 3) })
