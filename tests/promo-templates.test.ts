import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_TEMPLATE_FIELDS, applyTemplateTexts, isTemplateCategory, templateCategoryLabel, templateFields } from '../src/lib/domain/promo-templates.ts'
import { emptyLayers, makeLayer } from '../src/lib/domain/promo-layers.ts'

test('modelos: categorias válidas', () => {
  assert.ok(isTemplateCategory('bebe') && !isTemplateCategory('x') && !isTemplateCategory(undefined))
  assert.equal(templateCategoryLabel('cupom'), 'Cupom e clube'); assert.equal(templateCategoryLabel('nada'), 'Outro')
})

test('modelos: campos editáveis são os textos visíveis e não vazios, em ordem de peça, no máximo 12', () => {
  const l = emptyLayers()
  l.story = [
    { ...makeLayer('text', 'story'), id: 't2', text: 'Segunda', page: 1 },
    { ...makeLayer('text', 'story'), id: 't1', text: 'Primeira', page: 0 },
    { ...makeLayer('text', 'story'), id: 'vazio', text: '  ', page: 0 },
    { ...makeLayer('text', 'story'), id: 'oculto', text: 'x', hidden: true },
    { ...makeLayer('shape', 'story'), id: 'forma' },
  ]
  assert.deepEqual(templateFields(l).map((f) => f.id), ['t1', 't2'])
  const muitos = emptyLayers()
  muitos.feed = Array.from({ length: 30 }, (_, i) => ({ ...makeLayer('text', 'feed'), id: `x${i}`, text: `t${i}` }))
  assert.equal(templateFields(muitos).length, MAX_TEMPLATE_FIELDS)
})

test('modelos: trocar os textos só mexe em texto existente e ignora vazio, lixo e tamanho exagerado', () => {
  const l = emptyLayers()
  l.story = [{ ...makeLayer('text', 'story'), id: 'a', text: 'velho' }, { ...makeLayer('text', 'story'), id: 'b', text: 'fica' }, { ...makeLayer('shape', 'story'), id: 'c' }]
  const r = applyTemplateTexts(l, { a: 'novo', b: '   ', c: 'forma não tem texto', z: 'não existe', __proto__: 'x' })
  assert.deepEqual(r.story.map((x) => x.text), ['novo', 'fica', undefined])
  assert.equal(applyTemplateTexts(l, { a: 'y'.repeat(999) }).story[0].text?.length, 300)
  assert.equal(l.story[0].text, 'velho') // não altera o original
  assert.equal(applyTemplateTexts(l, { a: 42 }).story[0].text, 'velho')
})
