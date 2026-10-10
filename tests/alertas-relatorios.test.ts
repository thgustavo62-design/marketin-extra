import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THRESHOLDS, approvalSeverity, dedupeKey, isAlertStatus, isAlertType, overdueSeverity, paceAlert, paceText } from '../src/lib/domain/alerts.ts'
import { MAX_REPORT_DAYS, buildObservations, monthOf, pdfSafe, reportKey, validatePeriod, weekOf, periodLabel } from '../src/lib/domain/reports.ts'
import { TARGET_METRICS } from '../src/lib/domain/targets.ts'

const atLeast = TARGET_METRICS.posts_published
const atMost = TARGET_METRICS.ads_spend

test('severidade: atraso e aprovação parada', () => {
  assert.equal(overdueSeverity(1), 'warning')
  assert.equal(overdueSeverity(THRESHOLDS.overdueCriticalDays), 'critical')
  assert.equal(approvalSeverity(49), 'warning')
  assert.equal(approvalSeverity(96), 'critical')
})

test('chave de deduplicação inclui tipo, registro e variante', () => {
  assert.equal(dedupeKey('post_overdue', 'abc'), 'post_overdue:abc')
  assert.equal(dedupeKey('target_pace', 'abc', 'behind'), 'target_pace:abc:behind')
  assert.equal(isAlertType('post_overdue'), true)
  assert.equal(isAlertType('toString'), false)
  assert.equal(isAlertStatus('ativos'), true)
  assert.equal(isAlertStatus('x'), false)
})

test('ritmo da meta: sem dado suficiente nunca alarma', () => {
  assert.equal(paceAlert(atLeast, 10, 0, 'current', 5, 31), null) // poucos dias do mês
  assert.equal(paceAlert(atLeast, 10, null, 'past', 31, 31), null) // realizado ausente
  assert.equal(paceAlert(atMost, 10, 99, 'past', 31, 31), null) // teto não é "ritmo"
  assert.equal(paceAlert(atLeast, 0, 0, 'past', 31, 31), null)
  assert.equal(paceAlert(atLeast, 10, 0, 'future', 0, 31), null)
})

test('ritmo da meta: mês em andamento abaixo do esperado, e mês encerrado', () => {
  // dia 15 de 30: esperado 5; realizado 2 está mais de 30% abaixo
  const behind = paceAlert(atLeast, 10, 2, 'current', 15, 30)
  assert.deepEqual(behind, { kind: 'behind', expected: 5 })
  assert.equal(paceAlert(atLeast, 10, 4, 'current', 15, 30), null) // 4 ≥ 5 × 0,7
  assert.deepEqual(paceAlert(atLeast, 10, 7, 'past', 30, 30), { kind: 'missed', expected: 10 })
  assert.equal(paceAlert(atLeast, 10, 10, 'past', 30, 30), null)
  assert.match(paceText('Conteúdos publicados', behind!, 2, 10).detail, /esperado até hoje/)
})

test('semana (segunda a domingo) e mês', () => {
  assert.deepEqual(weekOf('2026-10-09'), { from: '2026-10-05', to: '2026-10-11' }) // sexta
  assert.deepEqual(weekOf('2026-10-11'), { from: '2026-10-05', to: '2026-10-11' }) // domingo
  assert.deepEqual(weekOf('2026-10-05'), { from: '2026-10-05', to: '2026-10-11' }) // segunda
  assert.deepEqual(monthOf('2028-02-10'), { from: '2028-02-01', to: '2028-02-29' })
  assert.equal(periodLabel({ from: '2026-10-05', to: '2026-10-11' }), '05/10/2026 a 11/10/2026')
})

test('período inválido ou longo demais', () => {
  assert.match(validatePeriod({ from: '2026-10-10', to: '2026-10-01' }) ?? '', /anterior/)
  assert.match(validatePeriod({ from: 'x', to: '2026-10-01' }) ?? '', /Informe/)
  assert.match(validatePeriod({ from: '2026-01-01', to: '2026-12-31' }) ?? '', new RegExp(String(MAX_REPORT_DAYS)))
  assert.equal(validatePeriod({ from: '2026-10-01', to: '2026-10-31' }), null)
})

test('chave do relatório: mesmo pedido no mesmo dia = mesma chave; qualquer mudança = outra', () => {
  const p = { from: '2026-10-05', to: '2026-10-11' }
  const k = reportKey('operacional', 'b', null, p, {}, '2026-10-09')
  assert.equal(k, reportKey('operacional', 'b', null, p, {}, '2026-10-09'))
  assert.notEqual(k, reportKey('operacional', 'b', null, p, {}, '2026-10-10'))
  assert.notEqual(k, reportKey('resultados', 'b', null, p, {}, '2026-10-09'))
  assert.notEqual(k, reportKey('operacional', 'b', 'u', p, {}, '2026-10-09'))
  assert.notEqual(k, reportKey('operacional', 'b', null, p, { format: 'reels' }, '2026-10-09'))
})

test('observações só existem com dado que as sustente', () => {
  assert.deepEqual(buildObservations({ planned: 0, overdue: 0, published: 0, engagementByFormat: [], goalsBehind: [] }), [])
  const o = buildObservations({
    planned: 10, overdue: 3, published: 5,
    engagementByFormat: [{ key: 'Reels', n: 4, median: 9.5, enough: true }, { key: 'Feed', n: 3, median: 4, enough: true }],
    goalsBehind: [{ label: 'Conteúdos publicados', realized: 5, target: 12 }],
  })
  assert.equal(o.length, 3)
  assert.match(o[0], /3 de 10 conteúdos/)
  assert.match(o[1], /Reels \(9,50%, n=4\).*Feed \(4,00%, n=3\).*não indica causa/)
  const few = buildObservations({ planned: 2, overdue: 0, published: 2, engagementByFormat: [{ key: 'Reels', n: 2, median: null, enough: false }], goalsBehind: [] })
  assert.match(few[1], /Ainda não há publicações maduras suficientes/)
})

test('texto do PDF: mantém acentos Latin-1, troca símbolos e remove emoji', () => {
  assert.equal(pdfSafe('Ações úteis ÷ alcance × 100'), 'Ações úteis ÷ alcance × 100')
  assert.equal(pdfSafe('A — B – C … −5 ≥ 3'), 'A - B - C ... -5 >= 3')
  assert.equal(pdfSafe('Oferta 🔥 de hoje\nlinha 2'), 'Oferta  de hoje linha 2')
  assert.equal(pdfSafe('“aspas”'), '"aspas"')
})
