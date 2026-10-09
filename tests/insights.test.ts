import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compact, dailySeries, formatVariation, periodRange, ratio, ratioSeries, shortDate, sum, tickIndexes, variation } from '../src/lib/insights/calc.ts'

test('período termina ontem e compara com o período anterior de mesmo tamanho', () => {
  const r = periodRange(28, '2026-10-09')
  assert.equal(r.to, '2026-10-08')
  assert.equal(r.from, '2026-09-11') // igual à tela do Meta: 11 de set a 8 de out
  assert.equal(r.prevTo, '2026-09-10')
  assert.equal(r.prevFrom, '2026-08-14')
  const r7 = periodRange(7, '2026-10-09')
  assert.equal(r7.from, '2026-10-02')
  assert.equal(r7.prevFrom, '2026-09-25')
})

test('série diária soma contas no mesmo dia e preenche dias sem dado com zero', () => {
  const rows = [{ date: '2026-10-01', v: 3 }, { date: '2026-10-01', v: 2 }, { date: '2026-10-03', v: 4 }]
  assert.deepEqual(dailySeries(rows, 'v', '2026-10-01', '2026-10-03'), [
    { date: '2026-10-01', value: 5 }, { date: '2026-10-02', value: 0 }, { date: '2026-10-03', value: 4 },
  ])
  assert.equal(sum(rows, 'v'), 9)
  assert.equal(sum([{ v: null }, { v: 'x' }, { v: 2 }] as never[], 'v'), 2)
})

test('variação: sem base de comparação não inventa percentual', () => {
  assert.equal(variation(50, 100), -50)
  assert.equal(variation(150, 100), 50)
  assert.equal(variation(10, 0), null)
  assert.equal(variation(0, 0), null)
  assert.equal(formatVariation(-44.2), '−44,2%')
  assert.equal(formatVariation(5), '+5,0%')
  assert.equal(formatVariation(null), '—')
})

test('números compactos como no Meta Business Suite', () => {
  assert.equal(compact(120400), '120,4 mil')
  assert.equal(compact(10600), '10,6 mil')
  assert.equal(compact(10000), '10 mil')
  assert.equal(compact(534), '534')
  assert.equal(compact(5052), '5.052')
  assert.equal(compact(1_250_000), '1,3 mi')
  assert.equal(compact(0), '0')
  assert.equal(compact(null), '—')
})

test('razões e séries de razão sem divisão por zero', () => {
  assert.equal(ratio(10, 0), 0)
  assert.equal(ratio(10, 1000, 1000), 10)
  const rows = [{ date: '2026-10-01', spend: 10, impressions: 1000 }, { date: '2026-10-02', spend: 5, impressions: 0 }]
  assert.deepEqual(ratioSeries(rows, 'spend', 'impressions', '2026-10-01', '2026-10-02', 1000).map((p) => p.value), [10, 0])
})

test('rótulos do eixo e datas curtas', () => {
  assert.deepEqual(tickIndexes(28, 5), [0, 7, 14, 20, 27])
  assert.deepEqual(tickIndexes(3, 5), [0, 1, 2])
  assert.equal(shortDate('2026-09-11'), '11 de set')
  assert.equal(shortDate('2026-10-08'), '8 de out')
})
