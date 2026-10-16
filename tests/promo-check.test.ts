import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPromotion, summarizeCheck } from '../src/lib/domain/promo-check.ts'
import { emptyLayers, makeLayer } from '../src/lib/domain/promo-layers.ts'

const item = (id: string, over: Partial<{ name: string; price: number; ean: string | null; photo_id: string | null }> = {}) => ({ id, name: 'LEITE NINHO 800G', price: 39.9, ean: `789${id}`, photo_id: 'foto', ...over })
const codes = (l: ReturnType<typeof checkPromotion>) => l.map((i) => i.code)

test('verificar arte: peça limpa não tem aviso; preço e nome inválidos bloqueiam; foto e validade pedem revisão', () => {
  assert.deepEqual(checkPromotion({ items: [item('1')], layers: emptyLayers(), validity: 'De 10 a 12/10', pageCount: {} }), [])
  const r = checkPromotion({ items: [item('1', { price: 0 }), item('2', { name: ' ' }), item('3', { photo_id: null })], layers: emptyLayers(), validity: '', pageCount: {} })
  assert.deepEqual(summarizeCheck(r), { bloqueio: 2, revisao: 2, info: 0 })
  assert.equal(r[0].severity, 'bloqueio') // bloqueios primeiro
  assert.ok(codes(r).includes('preco-invalido') && codes(r).includes('sem-nome') && codes(r).includes('sem-foto') && codes(r).includes('sem-validade'))
  assert.ok(codes(checkPromotion({ items: [item('1', { price: 12000 })], layers: emptyLayers(), validity: 'x', pageCount: {} })).includes('preco-alto'))
  assert.ok(codes(checkPromotion({ items: [item('1'), item('1')], layers: emptyLayers(), validity: 'x', pageCount: {} })).includes('ean-repetido'))
})

test('verificar arte: elementos livres fora da peça, cortados, vazios, minúsculos e presos a peça que não existe', () => {
  const layers = emptyLayers()
  layers.story = [
    { ...makeLayer('shape', 'story'), x: 5000, y: 0 },                                  // fora
    { ...makeLayer('shape', 'story'), x: -300, y: 100, w: 400 },                        // cortado
    { ...makeLayer('text', 'story'), text: '   ' },                                     // vazio
    { ...makeLayer('text', 'story'), text: 'miúdo', size: 10 },                         // pequeno
    { ...makeLayer('shape', 'story'), page: 4 },                                        // peça inexistente
    { ...makeLayer('shape', 'story'), x: 9999, hidden: true },                          // oculto: ignorado
  ]
  const r = checkPromotion({ items: [], layers, validity: null, pageCount: { story: 2 } })
  assert.deepEqual(codes(r).sort(), ['cortado', 'fora-da-peca', 'peca-inexistente', 'texto-pequeno', 'texto-vazio'].sort())
  assert.equal(r.find((i) => i.code === 'fora-da-peca')!.severity, 'revisao')
  assert.equal(r.every((i) => i.layerId && i.format === 'story'), true)
  assert.equal(codes(checkPromotion({ items: [], layers: emptyLayers(), validity: null, pageCount: {} })).length, 0) // sem encartes não cobra validade
})

test('verificar arte: publicidade de medicamento vira revisão humana, nunca bloqueio', () => {
  const l = emptyLayers()
  l.feed = [{ ...makeLayer('text', 'feed'), text: 'Tome Dorflex hoje, comprovado cientificamente!' }]
  const r = checkPromotion({ items: [item('1', { name: 'DORFLEX 36 COMPRIMIDOS' })], layers: l, validity: 'x', pageCount: {} })
  const ads = r.filter((i) => i.code.startsWith('publicidade-'))
  assert.ok(ads.length >= 2 && ads.every((i) => i.severity === 'revisao'))
  assert.equal(summarizeCheck(r).bloqueio, 0)
})
