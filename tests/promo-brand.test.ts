import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_KIT_COLORS, MAX_KIT_FONTS, MAX_KIT_TEXTS, emptyKit, normalizeKit } from '../src/lib/domain/promo-brand.ts'

test('kit de marca: cores #rrggbb com nome, sem repetir, até 12', () => {
  const k = normalizeKit({ colors: [{ name: '  Vermelho   forte ', hex: '#E3171D' }, { hex: '#e3171d' }, { name: 'ruim', hex: 'vermelho' }, { hex: '#0b1f5c' }, 'lixo', null] })
  assert.deepEqual(k.colors, [{ name: 'Vermelho forte', hex: '#e3171d' }, { name: '#0b1f5c', hex: '#0b1f5c' }])
  assert.equal(normalizeKit({ colors: Array.from({ length: 30 }, (_, i) => ({ hex: `#${String(i).padStart(2, '0')}0000` })) }).colors.length, MAX_KIT_COLORS)
})

test('kit de marca: só fontes do catálogo (sem repetir) e textos com rótulo', () => {
  const k = normalizeKit({ fonts: ['bebas', 'bebas', 'Comic Sans', 'oswald', 3], texts: [{ label: 'Instagram', text: '@minasfarma' }, { text: 'Peça pelo WhatsApp (27) 99999-0000' }, { label: 'vazio', text: '   ' }, { text: 'x'.repeat(500) }] })
  assert.deepEqual(k.fonts, ['bebas', 'oswald'])
  assert.deepEqual(k.texts.map((t) => t.label), ['Instagram', 'Peça pelo WhatsApp (27) 99999-', 'x'.repeat(30)])
  assert.equal(k.texts[2].text.length, 200)
  assert.equal(normalizeKit({ fonts: Array.from({ length: 12 }, () => 'bebas'), texts: Array.from({ length: 30 }, (_, i) => ({ text: `t${i}` })) }).texts.length, MAX_KIT_TEXTS)
  assert.ok(MAX_KIT_FONTS >= 3)
})

test('kit de marca: entrada inválida vira kit vazio', () => {
  assert.deepEqual(normalizeKit(null), emptyKit()); assert.deepEqual(normalizeKit('x'), emptyKit()); assert.deepEqual(normalizeKit({ colors: 5, fonts: 'a', texts: {} }), emptyKit())
})
