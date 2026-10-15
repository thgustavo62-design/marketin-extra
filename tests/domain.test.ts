import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actionRate, addDays, campaignCoversPeriod, csvEscape, formatRate, isExpired, isIsoDate,
  monthGrid, normalizeReels, parseMonth, shiftMonth, stageBlockedReason, toCsv, STAGE_ORDER, isOpenStage, isPriority, isStage, moveBlockedReason, needsPublishConfirmation,
} from '../src/lib/domain/index.ts'

test('datas ISO: validação e soma de dias', () => {
  assert.equal(isIsoDate('2026-10-09'), true)
  assert.equal(isIsoDate('2026-02-30'), false)
  assert.equal(isIsoDate('09/10/2026'), false)
  assert.equal(addDays('2026-10-30', 3), '2026-11-02')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
})

test('meses: parse, fallback e navegação', () => {
  assert.deepEqual(parseMonth('2026-12', '2026-10-09'), { year: 2026, month: 12 })
  assert.deepEqual(parseMonth('lixo', '2026-10-09'), { year: 2026, month: 10 })
  assert.deepEqual(parseMonth('2026-13', '2026-10-09'), { year: 2026, month: 10 })
  assert.equal(shiftMonth(2026, 12, 1), '2027-01')
  assert.equal(shiftMonth(2026, 1, -1), '2025-12')
})

test('grade do mês começa na segunda e fecha semanas completas', () => {
  const weeks = monthGrid(2026, 10) // 1/out/2026 é quinta
  assert.ok(weeks.every((w) => w.length === 7))
  assert.equal(weeks[0][0].iso, '2026-09-28')
  assert.equal(weeks[0][3].iso, '2026-10-01')
  assert.equal(weeks[0][3].inMonth, true)
  assert.equal(weeks[0][0].inMonth, false)
  const all = weeks.flat().filter((c) => c.inMonth)
  assert.equal(all.length, 31)
})

test('taxa de ações úteis', () => {
  assert.equal(actionRate(200, 10, 10), 10)
  assert.equal(actionRate(0, 5, 5), null)
  assert.equal(actionRate(null, 5, 5), null)
  assert.equal(actionRate(100, null, 5), 5)
  assert.equal(formatRate(null), '—')
  assert.equal(formatRate(12.34), '12,3%')
})

test('validade', () => {
  assert.equal(isExpired('2026-10-08', '2026-10-09'), true)
  assert.equal(isExpired('2026-10-09', '2026-10-09'), false)
  assert.equal(isExpired(null, '2026-10-09'), false)
  const c = { starts_on: '2026-10-01', ends_on: '2026-10-31' }
  assert.equal(campaignCoversPeriod(c, '2026-10-05', '2026-10-11'), true)
  assert.equal(campaignCoversPeriod(c, '2026-10-28', '2026-11-03'), false)
})

test('medicamentos exige revisão farmacêutica para aprovar/publicar', () => {
  assert.ok(stageBlockedReason('medicamentos', 'aprovado', false))
  assert.ok(stageBlockedReason('medicamentos', 'publicado', false))
  assert.equal(stageBlockedReason('medicamentos', 'aprovado', true), null)
  assert.equal(stageBlockedReason('medicamentos', 'ideia', false), null)
  assert.equal(stageBlockedReason('institucional', 'publicado', false), null)
})

test('CSV: escapa aspas, separador e injeção de fórmula', () => {
  assert.equal(csvEscape('a;b'), '"a;b"')
  assert.equal(csvEscape('diz "oi"'), '"diz ""oi"""')
  assert.equal(csvEscape('=SOMA(A1)'), "'=SOMA(A1)")
  assert.equal(csvEscape(null), '')
  const csv = toCsv(['a', 'b'], [['1', 'x;y']])
  assert.ok(csv.startsWith('﻿'))
  assert.ok(csv.includes('a;b\r\n1;"x;y"'))
})

test('Reels: normaliza roteiro incompleto', () => {
  const r = normalizeReels({ hook: 'oi' })
  assert.equal(r.hook, 'oi')
  assert.equal(r.scenes.length, 4)
  assert.equal(normalizeReels(null).cta, '')
})

test('fluxo de produção: 9 etapas na ordem do quadro', () => {
  assert.deepEqual(STAGE_ORDER, ['ideia', 'briefing', 'producao', 'revisao', 'aprovacao', 'aprovado', 'agendado', 'publicado', 'cancelado'])
  assert.equal(isStage('rascunho'), false) // etapa antiga não existe mais
  assert.equal(isOpenStage('revisao'), true)
  assert.equal(isOpenStage('publicado'), false)
  assert.equal(isOpenStage('cancelado'), false)
  assert.equal(isPriority('urgent'), true)
  assert.equal(isPriority('critica'), false)
})

test('medicamentos: revisão farmacêutica vale também para agendar', () => {
  for (const s of ['aprovado', 'agendado', 'publicado'] as const) assert.ok(stageBlockedReason('medicamentos', s, false), s)
  for (const s of ['ideia', 'briefing', 'producao', 'revisao', 'aprovacao', 'cancelado'] as const) assert.equal(stageBlockedReason('medicamentos', s, false), null, s)
  assert.equal(stageBlockedReason('medicamentos', 'agendado', true), null)
})

test('cartão bloqueado só recua ou cancela', () => {
  assert.ok(moveBlockedReason('producao', 'revisao', 'falta o preço'))
  assert.ok(moveBlockedReason('ideia', 'agendado', 'falta o preço'))
  assert.equal(moveBlockedReason('revisao', 'producao', 'falta o preço'), null) // recuar pode
  assert.equal(moveBlockedReason('producao', 'cancelado', 'falta o preço'), null) // cancelar pode
  assert.equal(moveBlockedReason('producao', 'revisao', null), null) // sem bloqueio, avança
})

test('publicado exige confirmação humana; agendado não', () => {
  assert.equal(needsPublishConfirmation('publicado'), true)
  assert.equal(needsPublishConfirmation('agendado'), false)
  assert.equal(needsPublishConfirmation('aprovado'), false)
})
