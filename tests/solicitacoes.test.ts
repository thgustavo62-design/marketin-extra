import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canMoveRequest, convertBlockedReason, offerBlockedReason, FORMAT_BY_TYPE, isRequestStatus, isRequestType } from '../src/lib/domain/requests.ts'

const today = '2026-10-09'
const offer = { offer_item: 'Dipirona 500mg', offer_price: 4.9, offer_valid_until: '2026-10-20', info_confirmed_at: '2026-10-09T10:00:00Z' }
const base = { ...offer, status: 'aceita' as const, linked_post_id: null }

test('pedido sem oferta converte sem exigir preço', () => {
  assert.equal(convertBlockedReason({ ...base, offer_item: null, offer_price: null, offer_valid_until: null, info_confirmed_at: null }, today), null)
})

test('oferta exige preço, validade e confirmação', () => {
  assert.match(offerBlockedReason({ ...offer, offer_price: null }, today) ?? '', /preço/i)
  assert.match(offerBlockedReason({ ...offer, offer_valid_until: null }, today) ?? '', /até quando/i)
  assert.match(offerBlockedReason({ ...offer, info_confirmed_at: null }, today) ?? '', /Confirme/)
  assert.equal(offerBlockedReason(offer, today), null)
})

test('preço zero é um preço (não é o mesmo que vazio)', () => {
  assert.equal(offerBlockedReason({ ...offer, offer_price: 0 }, today), null)
})

test('oferta vencida não converte, mesmo confirmada', () => {
  assert.match(offerBlockedReason({ ...offer, offer_valid_until: '2026-10-08' }, today) ?? '', /venceu em 08\/10\/2026/)
  assert.equal(offerBlockedReason({ ...offer, offer_valid_until: today }, today), null)
})

test('não converte duas vezes, cancelada, concluída ou aguardando informação', () => {
  assert.match(convertBlockedReason({ ...base, linked_post_id: 'x' }, today) ?? '', /já virou/)
  assert.match(convertBlockedReason({ ...base, status: 'cancelada' }, today) ?? '', /cancelada/)
  assert.match(convertBlockedReason({ ...base, status: 'concluida' }, today) ?? '', /concluída/)
  assert.match(convertBlockedReason({ ...base, status: 'precisa_info' }, today) ?? '', /informação/)
})

test('transições de situação', () => {
  assert.equal(canMoveRequest('recebida', 'aceita'), true)
  assert.equal(canMoveRequest('recebida', 'concluida'), false)
  assert.equal(canMoveRequest('concluida', 'recebida'), false)
  assert.equal(canMoveRequest('cancelada', 'recebida'), true)
})

test('tipos e situações válidos', () => {
  assert.equal(isRequestType('reels'), true)
  assert.equal(isRequestType('toString'), false)
  assert.equal(isRequestStatus('aceita'), true)
  assert.equal(isRequestStatus('x'), false)
  assert.equal(FORMAT_BY_TYPE.video, 'reels')
})
