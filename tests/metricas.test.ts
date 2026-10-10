import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ageDays, engagementRate, groupMedians, interactions, isMature, mediaFormat, median, parseMediaRow, perThousandReach, saoPauloDate, suggestMatches,
  EMPTY_METRICS, type PubMetrics,
} from '../src/lib/domain/publication-metrics.ts'
import {
  TARGET_METRICS, changeVs, costPerConversation, formatValue, isMetricKey, isYearMonth, monthRange, monthState, previousMonth, progress, readTo,
} from '../src/lib/domain/targets.ts'

const m = (o: Partial<PubMetrics>): PubMetrics => ({ ...EMPTY_METRICS, ...o })

test('formato da mídia a partir do Instagram', () => {
  assert.equal(mediaFormat('REELS', 'VIDEO'), 'reels')
  assert.equal(mediaFormat('FEED', 'CAROUSEL_ALBUM'), 'carrossel')
  assert.equal(mediaFormat('FEED', 'IMAGE'), 'feed')
  assert.equal(mediaFormat('FEED', 'VIDEO'), 'feed')
  assert.equal(mediaFormat('STORY', 'IMAGE'), 'story')
  assert.equal(mediaFormat(undefined, undefined), 'outro')
})

test('linha do Windsor: ausente vira N/D (null), zero verdadeiro continua zero', () => {
  const p = parseMediaRow({ account_name: 'Farma e Farma', account_id: 123, media_id: 'm1', media_product_type: 'FEED', media_type: 'IMAGE', media_reach: 281, media_saved: 0, media_shares: 6, media_like_count: 7, media_comments_count: 0, media_views: 827, timestamp: '2026-10-01T14:00:00+0000', media_permalink: 'https://www.instagram.com/p/x' })!
  assert.equal(p.metrics.saves, 0)
  assert.equal(p.metrics.reach, 281)
  assert.equal(p.quality, 'complete')
  assert.equal(p.external_account_id, '123')
  const q = parseMediaRow({ account_name: 'A', media_id: 'm2', media_reach: 10 })!
  assert.equal(q.metrics.saves, null)
  assert.equal(q.metrics.likes, null)
  assert.equal(q.quality, 'partial')
  assert.equal(q.external_account_id, 'A')
})

test('linha inválida é descartada e permalink não-https é ignorado', () => {
  assert.equal(parseMediaRow({ account_name: 'A' }), null)
  assert.equal(parseMediaRow({ media_id: 'x' }), null)
  assert.equal(parseMediaRow({ account_name: 'A', media_id: 'x', media_permalink: 'javascript:alert(1)' })!.permalink, null)
  assert.equal(parseMediaRow({ account_name: 'A', media_id: 'x', media_reach: -5 })!.metrics.reach, null)
  assert.equal(parseMediaRow({ account_name: 'A', media_id: 'x', media_reach: 'abc' })!.metrics.reach, null)
})

test('interações do Reel só existem para Reels', () => {
  assert.equal(parseMediaRow({ account_name: 'A', media_id: 'r', media_product_type: 'REELS', media_reel_total_interactions: 13 })!.metrics.reel_interactions, 13)
  assert.equal(parseMediaRow({ account_name: 'A', media_id: 'f', media_product_type: 'FEED', media_reel_total_interactions: 13 })!.metrics.reel_interactions, null)
})

test('interações exigem as quatro parcelas; engajamento declara a fórmula e trata alcance 0/ausente como N/D', () => {
  assert.equal(interactions(m({ likes: 7, comments: 0, saves: 2, shares: 6 })), 15)
  assert.equal(interactions(m({ likes: 7, comments: 0, saves: null, shares: 6 })), null)
  assert.equal(engagementRate(m({ reach: 150, likes: 7, comments: 0, saves: 2, shares: 6 })), 10)
  assert.equal(engagementRate(m({ reach: 0, likes: 1, comments: 0, saves: 0, shares: 0 })), null)
  assert.equal(engagementRate(m({ reach: null, likes: 1, comments: 0, saves: 0, shares: 0 })), null)
  assert.equal(perThousandReach(5, 1000), 5)
  assert.equal(perThousandReach(0, 1000), 0)
  assert.equal(perThousandReach(null, 1000), null)
  assert.equal(perThousandReach(5, 0), null)
})

test('maturidade: 7 dias ou mais', () => {
  assert.equal(ageDays('2026-10-01', '2026-10-08'), 7)
  assert.equal(isMature('2026-10-01', '2026-10-08'), true)
  assert.equal(isMature('2026-10-03', '2026-10-08'), false)
})

test('mediana (ímpar, par, vazio)', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([]), null)
})

test('medianas por grupo: ignora imaturas e valores N/D, e só afirma com amostra mínima', () => {
  const items = [
    { f: 'reels', v: 10, ok: true }, { f: 'reels', v: 30, ok: true }, { f: 'reels', v: 20, ok: true }, { f: 'reels', v: 999, ok: false },
    { f: 'feed', v: 5, ok: true }, { f: 'feed', v: null, ok: true }, { f: 'feed', v: 7, ok: true },
  ]
  const g = groupMedians(items, (i) => i.f, (i) => i.v, (i) => i.ok)
  const reels = g.find((x) => x.key === 'reels')!, feed = g.find((x) => x.key === 'feed')!
  assert.deepEqual([reels.n, reels.median, reels.enough], [3, 20, true])
  assert.deepEqual([feed.n, feed.median, feed.enough], [2, null, false])
})

test('sugestão de vínculo só quando é inequívoca dos dois lados', () => {
  const pubs = [
    { id: 'p1', brand_id: 'b', published_on: '2026-10-05', format: 'reels' as const },
    { id: 'p2', brand_id: 'b', published_on: '2026-10-06', format: 'feed' as const },
    { id: 'p3', brand_id: 'b', published_on: '2026-10-06', format: 'feed' as const },
    { id: 'p4', brand_id: 'b', published_on: '2026-10-07', format: 'story' as const },
    { id: 'p5', brand_id: 'b2', published_on: '2026-10-05', format: 'reels' as const },
  ]
  const posts = [
    { id: 'c1', brand_id: 'b', post_date: '2026-10-05', format: 'reels' as const, stage: 'publicado' },
    { id: 'c2', brand_id: 'b', post_date: '2026-10-06', format: 'feed' as const, stage: 'publicado' },
    { id: 'c3', brand_id: 'b', post_date: '2026-10-07', format: 'feed' as const, stage: 'cancelado' },
  ]
  // p1↔c1 é único; p2/p3 competem pelo mesmo conteúdo (ambíguo); story não é planejado; p5 é de outra filial
  assert.deepEqual(suggestMatches(pubs, posts), [{ publicationId: 'p1', postId: 'c1' }])
  // dois conteúdos no mesmo dia/formato também é ambíguo
  assert.deepEqual(suggestMatches([pubs[0]], [...posts, { id: 'c9', brand_id: 'b', post_date: '2026-10-05', format: 'reels' as const, stage: 'producao' }]), [])
})

test('data local de São Paulo (23h do dia 5 no Brasil já é dia 6 em UTC)', () => {
  assert.equal(saoPauloDate('2026-10-06T02:30:00.000Z'), '2026-10-05')
  assert.equal(saoPauloDate('2026-10-06T14:00:00.000Z'), '2026-10-06')
})

// ---------- metas ----------
test('meses: intervalo, anterior e estado', () => {
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29', days: 29 })
  assert.equal(monthRange('2026-12').to, '2026-12-31')
  assert.equal(previousMonth('2026-01'), '2025-12')
  assert.equal(previousMonth('2026-10'), '2026-09')
  assert.deepEqual(monthState('2026-10', '2026-10-09'), { state: 'current', elapsed: 9, days: 31 })
  assert.equal(monthState('2026-09', '2026-10-09').state, 'past')
  assert.equal(monthState('2026-11', '2026-10-09').state, 'future')
  assert.equal(readTo('2026-10', '2026-10-09'), '2026-10-09')
  assert.equal(readTo('2026-09', '2026-10-09'), '2026-09-30')
  assert.equal(isYearMonth('2026-13'), false)
  assert.equal(isYearMonth('2026-10'), true)
})

test('catálogo de metas não inclui alcance somado nem novos seguidores', () => {
  assert.equal(isMetricKey('ig_reach'), false)
  assert.equal(isMetricKey('ig_new_followers'), false)
  assert.equal(isMetricKey('toString'), false)
  assert.equal(isMetricKey('ig_views'), true)
})

test('progresso: meta de mínimo', () => {
  const d = TARGET_METRICS.ig_views
  assert.deepEqual(progress(d, 500, 1000, 'current'), { status: 'em_andamento', pct: 50, label: 'Em andamento' })
  assert.equal(progress(d, 1000, 1000, 'current').status, 'atingida')
  assert.equal(progress(d, 500, 1000, 'past').status, 'abaixo')
  assert.equal(progress(d, null, 1000, 'past').status, 'nd')
  assert.equal(progress(d, 0, 1000, 'past').pct, 0)
})

test('progresso: meta de teto (investimento, custo por conversa)', () => {
  const d = TARGET_METRICS.ads_cost_per_conversation
  assert.equal(progress(d, 4, 5, 'current').status, 'dentro')
  assert.equal(progress(d, 6, 5, 'past').status, 'acima')
  assert.equal(progress(d, null, 5, 'past').status, 'nd')
})

test('custo por conversa: N/D sem conversas', () => {
  assert.equal(costPerConversation(100, 20), 5)
  assert.equal(costPerConversation(100, 0), null)
  assert.equal(costPerConversation(100, null), null)
  assert.equal(costPerConversation(null, 10), null)
})

test('variação contra o mês anterior: N/D se faltar ou for zero', () => {
  assert.equal(changeVs(150, 100), 50)
  assert.equal(changeVs(50, 100), -50)
  assert.equal(changeVs(10, 0), null)
  assert.equal(changeVs(null, 10), null)
})

test('formatação de valores', () => {
  assert.equal(formatValue(TARGET_METRICS.ig_views, null), 'N/D')
  assert.match(formatValue(TARGET_METRICS.ads_spend, 1234.5), /R\$\s?1\.234,50/)
  assert.equal(formatValue(TARGET_METRICS.ig_views, 1234), '1.234')
})
