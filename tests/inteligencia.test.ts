import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bottleneck, compareGroups, confidenceOf, coverage, daypartOf, decisionIsCurrent, fingerprintOf, fmtHours, freshnessScore, impactOfRatio, mulberry32,
  permutationRangeTest, qualityScore, quantile, sampleScore, scoreBand, sortFindings, summarizeDurations, weekdayName, type Finding, type QualityItem,
} from '../src/lib/domain/intelligence.ts'

const rep = (v: number, n: number, jitter = 0) => Array.from({ length: n }, (_, i) => v + ((i % 5) - 2) * jitter)

test('gerador pseudoaleatório é determinístico', () => {
  const a = mulberry32(7), b = mulberry32(7)
  assert.deepEqual([a(), a(), a()], [b(), b(), b()])
  assert.notEqual(mulberry32(8)(), mulberry32(7)())
})

test('teste de permutação: diferença clara dá p pequeno; grupos iguais dão p grande; resultado reproduzível', () => {
  const clear = permutationRangeTest([{ key: 'A', values: rep(10, 12, 0.5) }, { key: 'B', values: rep(5, 12, 0.5) }])
  assert.ok(clear.p < 0.01, `p=${clear.p}`)
  const same = permutationRangeTest([{ key: 'A', values: rep(7, 12, 1) }, { key: 'B', values: rep(7, 12, 1) }])
  assert.ok(same.p > 0.5, `p=${same.p}`)
  assert.deepEqual(permutationRangeTest([{ key: 'A', values: rep(10, 12, 0.5) }, { key: 'B', values: rep(5, 12, 0.5) }]), clear)
})

test('teste com vários grupos corrige a escolha do extremo (ruído puro não parece significativo)', () => {
  const rnd = mulberry32(99)
  const noise = ['A', 'B', 'C', 'D', 'E'].map((k) => ({ key: k, values: Array.from({ length: 6 }, () => rnd() * 10) }))
  assert.ok(permutationRangeTest(noise).p > 0.05)
})

test('grupos pequenos ou únicos não geram p enganoso', () => {
  assert.equal(permutationRangeTest([{ key: 'A', values: [1, 2, 3] }]).p, 1)
  assert.equal(permutationRangeTest([{ key: 'A', values: [1] }, { key: 'B', values: [2] }]).p, 1)
})

test('níveis de confiança dependem do p-valor E do tamanho da amostra', () => {
  assert.equal(confidenceOf(0.01, 10), 'alta')
  assert.equal(confidenceOf(0.01, 6), 'media')
  assert.equal(confidenceOf(0.01, 3), 'baixa')
  assert.equal(confidenceOf(0.07, 6), 'media')
  assert.equal(confidenceOf(0.15, 4), 'baixa')
  assert.equal(confidenceOf(0.5, 50), 'inconclusiva')
  assert.equal(confidenceOf(0.01, 2), 'inconclusiva')
})

test('impacto pela razão entre as medianas', () => {
  assert.equal(impactOfRatio(2), 'alto')
  assert.equal(impactOfRatio(1.3), 'medio')
  assert.equal(impactOfRatio(1.05), 'baixo')
  assert.equal(impactOfRatio(null), 'medio')
})

test('comparar grupos: vencedor claro com evidência, amostra e ação', () => {
  const f = compareGroups({
    key: 'formato', title: 'Formato', dimension: 'formato', metric: 'engajamento', period: 'últimos 90 dias', format: (n) => n.toFixed(1).replace('.', ',') + '%',
    groups: [{ key: 'Reels', values: rep(10, 12, 0.5) }, { key: 'Feed', values: rep(5, 12, 0.5) }, { key: 'Carrossel', values: [4, 5] }],
    actionFor: (best) => ({ label: `Priorizar ${best}`, href: '/planejamento/gerar' }),
  })!
  assert.equal(f.confidence, 'alta')
  assert.equal(f.impact, 'alto')
  assert.match(f.statement, /Reels teve a maior mediana de engajamento \(9,8%, n=12\) e Feed a menor \(4,8%, n=12\)/)
  assert.ok(f.evidence.some((e) => /Carrossel: amostra pequena \(n=2\)/.test(e)))
  assert.ok(f.evidence.some((e) => /p = 0,/.test(e)))
  assert.deepEqual(f.action, { label: 'Priorizar Reels', href: '/planejamento/gerar' })
})

test('comparar grupos: sem diferença real = inconclusivo, sem recomendar escolha', () => {
  const f = compareGroups({ key: 'x', title: 'x', dimension: 'dia da semana', metric: 'engajamento', period: 'p', groups: [{ key: 'Seg', values: rep(7, 10, 1) }, { key: 'Ter', values: rep(7, 10, 1) }] })!
  assert.equal(f.confidence, 'inconclusiva')
  assert.match(f.statement, /pode ser acaso/)
  assert.match(f.action!.label, /Coletar mais publicações/)
})

test('comparar grupos: amostra insuficiente é dito com clareza; sem nenhum dado, não inventa achado', () => {
  const f = compareGroups({ key: 'x', title: 'x', dimension: 'formato', metric: 'm', period: 'p', groups: [{ key: 'Reels', values: [1, 2] }, { key: 'Feed', values: [3] }], minPerGroup: 3 })!
  assert.equal(f.confidence, 'inconclusiva')
  assert.match(f.statement, /Ainda não há amostra mínima/)
  assert.equal(compareGroups({ key: 'x', title: 'x', dimension: 'f', metric: 'm', period: 'p', groups: [] }), null)
})

test('tendência fraca não vira recomendação de mudar a estratégia', () => {
  const f = compareGroups({ key: 'x', title: 'x', dimension: 'formato', metric: 'm', period: 'p', minPerGroup: 3, groups: [{ key: 'A', values: [10, 11, 12] }, { key: 'B', values: [5, 6, 7] }], actionFor: () => ({ label: 'Mudar', href: '/x' }) })!
  assert.ok(['baixa', 'inconclusiva'].includes(f.confidence))
  assert.match(f.action!.label, /Coletar mais/)
})

test('assinatura do achado muda quando a análise muda', () => {
  const a = fingerprintOf({ key: 'k', statement: 'A', confidence: 'alta' }), b = fingerprintOf({ key: 'k', statement: 'B', confidence: 'alta' })
  assert.notEqual(a, b)
  assert.equal(a, fingerprintOf({ key: 'k', statement: 'A', confidence: 'alta' }))
  assert.equal(decisionIsCurrent(a, a), true)
  assert.equal(decisionIsCurrent(a, b), false)
  assert.equal(decisionIsCurrent(a, null), false)
})

test('ordenação: confiança primeiro, depois impacto', () => {
  const mk = (key: string, confidence: Finding['confidence'], impact: Finding['impact']): Finding => ({ key, area: 'resultados', title: key, statement: key, evidence: [], confidence, impact, action: null, method: '', limits: [], period: '' })
  assert.deepEqual(sortFindings([mk('c', 'inconclusiva', 'alto'), mk('b', 'media', 'baixo'), mk('a', 'alta', 'baixo'), mk('d', 'media', 'alto')]).map((f) => f.key), ['a', 'd', 'b', 'c'])
})

test('dia da semana e período do dia (horário de Brasília)', () => {
  assert.equal(weekdayName('2026-10-09'), 'Sexta')
  assert.equal(weekdayName('2026-10-11'), 'Domingo')
  assert.equal(daypartOf(3), 'Madrugada (0–5h)')
  assert.equal(daypartOf(6), 'Manhã (6–11h)')
  assert.equal(daypartOf(12), 'Tarde (12–17h)')
  assert.equal(daypartOf(23), 'Noite (18–23h)')
})

test('quantis e duração por etapa: só passagens concluídas entram; as em curso são contadas à parte', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3)
  assert.equal(quantile([10, 20], 0.5), 15)
  const d = summarizeDurations([
    { stage: 'revisao', hours: 10, ongoing: false }, { stage: 'revisao', hours: 30, ongoing: false }, { stage: 'revisao', hours: 50, ongoing: false }, { stage: 'revisao', hours: 999, ongoing: true },
    { stage: 'producao', hours: -5, ongoing: false }, { stage: 'aprovacao', hours: NaN, ongoing: false },
  ])
  assert.equal(d.length, 1)
  assert.deepEqual([d[0].stage, d[0].n, d[0].medianHours, d[0].ongoing], ['revisao', 3, 30, 1])
})

test('gargalo: precisa de 5+ passagens e mediana de 24 h ou mais', () => {
  const mk = (stage: string, med: number, n: number) => ({ stage, n, medianHours: med, p90Hours: med * 2, ongoing: 0 })
  assert.equal(bottleneck([mk('revisao', 10, 20), mk('producao', 30, 3)], (s) => s), null)
  const b = bottleneck([mk('revisao', 50, 9), mk('producao', 30, 20), mk('aprovacao', 5, 40)], (s) => s.toUpperCase())!
  assert.equal(b.stage.stage, 'revisao')
  assert.equal(b.finding.confidence, 'media')
  assert.match(b.finding.statement, /"REVISAO" é onde o conteúdo mais espera: mediana de 2,1 dias/)
  assert.equal(b.finding.action!.href, '/producao?etapa=revisao')
})

test('formatação de horas', () => {
  assert.equal(fmtHours(0.5), '30 min')
  assert.equal(fmtHours(5.5), '5,5 h')
  assert.equal(fmtHours(30), '30 h')
  assert.equal(fmtHours(72), '3,0 dias')
  assert.equal(fmtHours(NaN), 'N/D')
})

test('nota de qualidade: ponderada, itens não aplicáveis ficam de fora, ordem pelo maior prejuízo', () => {
  const it = (key: string, weight: number, score: number | null): QualityItem => ({ key, label: key, weight, score, detail: '', impact: '', fix: null })
  const r = qualityScore([it('a', 3, 1), it('b', 2, 0), it('c', 5, null), it('d', 1, 0.5)])
  assert.equal(r.score, Math.round(((3 * 1 + 2 * 0 + 1 * 0.5) / 6) * 100))
  assert.deepEqual(r.items.map((x) => x.key), ['b', 'd', 'a', 'c'])
  assert.equal(qualityScore([it('x', 1, null)]).score, null)
  assert.equal(qualityScore([]).score, null)
})

test('pontuações auxiliares', () => {
  assert.equal(coverage(3, 4), 0.75)
  assert.equal(coverage(0, 0), null)
  assert.equal(coverage(9, 4), 1)
  assert.equal(sampleScore(15), 0.5)
  assert.equal(sampleScore(100), 1)
  assert.equal(freshnessScore(null), 0)
  assert.equal(freshnessScore(2), 1)
  assert.equal(freshnessScore(14), 0)
  assert.ok(Math.abs(freshnessScore(8.5) - 0.5) < 1e-9)
  assert.equal(scoreBand(85).tone, 'ok')
  assert.equal(scoreBand(60).tone, 'warn')
  assert.equal(scoreBand(20).tone, 'bad')
  assert.equal(scoreBand(null).tone, 'none')
})
