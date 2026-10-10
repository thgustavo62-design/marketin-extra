import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dowOf, generationKey, occurrencesBetween, planChecklist, planPosts, reconfirmBlockedReason, validateRecurrence, describeRecurrence,
  type Recurrence,
} from '../src/lib/domain/recurrence.ts'

const base: Recurrence = { frequency: 'weekly', start_dow: 5, anchor_date: null, day_of_month: null, specific_dates: [], duration_days: 3, valid_from: null, valid_to: null }
const starts = (r: Recurrence, a: string, b: string) => occurrencesBetween(r, a, b).map((o) => o.start)

test('dia da semana (2026-10-09 é sexta)', () => {
  assert.equal(dowOf('2026-10-09'), 5)
  assert.equal(dowOf('2026-10-11'), 0)
})

test('semanal: toda sexta, com duração de 3 dias (fim de semana)', () => {
  const o = occurrencesBetween(base, '2026-10-09', '2026-10-31')
  assert.deepEqual(o.map((x) => x.start), ['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'])
  assert.deepEqual(o[0], { start: '2026-10-09', end: '2026-10-11' })
})

test('semanal: o intervalo começa no meio da semana', () => {
  assert.deepEqual(starts(base, '2026-10-12', '2026-10-25'), ['2026-10-16', '2026-10-23'])
})

test('a duração cruza virada de mês e de ano', () => {
  assert.equal(occurrencesBetween({ ...base, start_dow: 4, duration_days: 5 }, '2026-12-31', '2026-12-31')[0].end, '2027-01-04')
})

test('quinzenal conta a partir da primeira data, em qualquer intervalo', () => {
  const r: Recurrence = { ...base, frequency: 'biweekly', anchor_date: '2026-10-02', duration_days: 1 }
  assert.deepEqual(starts(r, '2026-10-01', '2026-11-30'), ['2026-10-02', '2026-10-16', '2026-10-30', '2026-11-13', '2026-11-27'])
  assert.deepEqual(starts(r, '2026-11-01', '2026-11-30'), ['2026-11-13', '2026-11-27'])
  assert.deepEqual(starts(r, '2026-09-01', '2026-10-01'), [])
})

test('mensal: dia 31 vira o último dia dos meses menores (inclui fevereiro bissexto)', () => {
  const r: Recurrence = { ...base, frequency: 'monthly', day_of_month: 31, duration_days: 1 }
  assert.deepEqual(starts(r, '2027-01-01', '2027-04-30'), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  assert.deepEqual(starts(r, '2028-02-01', '2028-02-29'), ['2028-02-29'])
})

test('mensal: atravessa a virada do ano', () => {
  const r: Recurrence = { ...base, frequency: 'monthly', day_of_month: 5, duration_days: 1 }
  assert.deepEqual(starts(r, '2026-11-10', '2027-02-10'), ['2026-12-05', '2027-01-05', '2027-02-05'])
})

test('mensal: dia já passado no mês inicial não entra', () => {
  const r: Recurrence = { ...base, frequency: 'monthly', day_of_month: 5, duration_days: 1 }
  assert.deepEqual(starts(r, '2026-10-06', '2026-10-31'), [])
})

test('datas específicas: ordenadas, sem repetição, só dentro do intervalo', () => {
  const r: Recurrence = { ...base, frequency: 'dates', specific_dates: ['2026-12-24', '2026-10-12', '2026-12-24', '2027-05-01'], duration_days: 1 }
  assert.deepEqual(starts(r, '2026-10-01', '2026-12-31'), ['2026-10-12', '2026-12-24'])
})

test('vigência recorta as ocorrências', () => {
  const r = { ...base, valid_from: '2026-10-15', valid_to: '2026-10-24' }
  assert.deepEqual(starts(r, '2026-10-01', '2026-10-31'), ['2026-10-16', '2026-10-23'])
})

test('mesma regra e mesmo intervalo dão sempre o mesmo resultado', () => {
  assert.deepEqual(occurrencesBetween(base, '2026-10-01', '2026-12-31'), occurrencesBetween(base, '2026-10-01', '2026-12-31'))
})

test('regra inválida não gera nada e explica o motivo', () => {
  assert.match(validateRecurrence({ ...base, start_dow: null }) ?? '', /dia da semana/)
  assert.match(validateRecurrence({ ...base, frequency: 'monthly', day_of_month: 32 }) ?? '', /1 a 31/)
  assert.match(validateRecurrence({ ...base, frequency: 'biweekly' }) ?? '', /primeira ocorrência/)
  assert.match(validateRecurrence({ ...base, frequency: 'dates' }) ?? '', /pelo menos uma data/)
  assert.match(validateRecurrence({ ...base, duration_days: 0 }) ?? '', /duração/)
  assert.match(validateRecurrence({ ...base, valid_from: '2026-10-10', valid_to: '2026-10-01' }) ?? '', /anterior/)
  assert.deepEqual(occurrencesBetween({ ...base, start_dow: 9 }, '2026-10-01', '2026-10-31'), [])
  assert.equal(validateRecurrence(base), null)
})

test('intervalos enormes são limitados (proteção)', () => {
  assert.ok(occurrencesBetween({ ...base, duration_days: 1 }, '2026-01-01', '2036-01-01').length <= 60)
})

test('chave de idempotência inclui modelo, filial, unidade e início', () => {
  assert.equal(generationKey('t', 'b', null, '2026-10-09'), 't|b|todas|2026-10-09')
  assert.notEqual(generationKey('t', 'b', 'u1', '2026-10-09'), generationKey('t', 'b', 'u2', '2026-10-09'))
  assert.notEqual(generationKey('t', 'b', null, '2026-10-09'), generationKey('t', 'b', 'u1', '2026-10-09'))
})

test('plano de entregas: quantidade, deslocamento de publicação e prazo de aprovação', () => {
  const occ = { start: '2026-10-09', end: '2026-10-11' }
  const p = planPosts('Fim de Semana da Limpeza', occ, [
    { format: 'feed', quantity: 1, publish_offset_days: 0 },
    { format: 'reels', quantity: 2, publish_offset_days: 1 },
  ], 2)
  assert.equal(p.length, 3)
  assert.deepEqual(p[0], { title: 'Fim de Semana da Limpeza — 09/10 · Feed', format: 'feed', post_date: '2026-10-09', due_at: '2026-10-07' })
  assert.equal(p[1].title, 'Fim de Semana da Limpeza — 09/10 · Reels 1/2')
  assert.equal(p[2].post_date, '2026-10-10')
  assert.equal(p[2].due_at, '2026-10-08')
})

test('checklist da ocorrência traz marcos com datas e a reconfirmação obrigatória', () => {
  const c = planChecklist({ start: '2026-10-09', end: '2026-10-11' }, { briefing_days: 7, creation_days: 5, approval_days: 2, checklist: ['Conferir estoque na loja'] })
  assert.deepEqual(c.slice(0, 3), ['Briefing pronto até 02/10', 'Peças criadas até 04/10', 'Enviar para aprovação até 07/10'])
  assert.ok(c.includes('Conferir estoque na loja'))
  assert.match(c[c.length - 1], /Reconfirmar produtos, preços, validade e estoque/)
})

test('trava de reconfirmação só vale para campanha gerada e ainda não reconfirmada', () => {
  const pend = { status: 'generated', reconfirmed_at: null }
  assert.match(reconfirmBlockedReason('aprovacao', pend) ?? '', /reconfirme/)
  assert.match(reconfirmBlockedReason('publicado', pend) ?? '', /reconfirme/)
  assert.equal(reconfirmBlockedReason('producao', pend), null)
  assert.equal(reconfirmBlockedReason('aprovacao', { status: 'generated', reconfirmed_at: '2026-10-09T10:00:00Z' }), null)
  assert.equal(reconfirmBlockedReason('aprovacao', { status: 'cancelled', reconfirmed_at: null }), null)
  assert.equal(reconfirmBlockedReason('aprovacao', null), null)
})

test('descrição legível da regra', () => {
  assert.equal(describeRecurrence(base), 'Toda sexta, dura 3 dias')
  assert.equal(describeRecurrence({ ...base, frequency: 'monthly', day_of_month: 15, duration_days: 1 }), 'Todo dia 15')
})

test('lista de datas digitada: formatos aceitos, duplicadas e inválidas', async () => {
  const { parseDateList } = await import('../src/lib/domain/recurrence.ts')
  const r = parseDateList('24/12/2026\n2026-10-12, 12/10/26; 31/02/2026; abc')
  assert.deepEqual(r.dates, ['2026-10-12', '2026-12-24'])
  assert.deepEqual(r.invalid, ['31/02/2026', 'abc'])
  assert.deepEqual(parseDateList('').dates, [])
})
