import assert from 'node:assert/strict'
import { test } from 'node:test'
import { categoryLabel, isLibraryCategory, libraryName, looksLikeSvg, svgIsSafe } from '../src/lib/domain/promo-library.ts'

const u8 = (s: string) => new TextEncoder().encode(s)

test('biblioteca: categoria válida e nome vindo do arquivo', () => {
  assert.ok(isLibraryCategory('icone') && !isLibraryCategory('video') && !isLibraryCategory(null))
  assert.equal(categoryLabel('selo'), 'Selos e adesivos')
  assert.equal(categoryLabel('xyz'), 'Outros')
  assert.equal(libraryName('selo_oferta  vermelho.PNG'), 'selo oferta vermelho')
  assert.equal(libraryName('.png'), 'Imagem')
  assert.equal(libraryName('a'.repeat(200) + '.png').length, 80)
})

test('biblioteca: reconhece SVG e só aceita o autossuficiente', () => {
  assert.ok(looksLikeSvg(u8('<svg xmlns="http://www.w3.org/2000/svg" width="10"><rect/></svg>')))
  assert.ok(looksLikeSvg(u8('<?xml version="1.0"?>\n<!-- x -->\n<svg viewBox="0 0 1 1"></svg>')))
  assert.ok(!looksLikeSvg(u8('<html><svg></svg></html>')))
  assert.ok(!looksLikeSvg(u8('texto')))
  assert.ok(svgIsSafe(u8('<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#a"/><image href="data:image/png;base64,AAAA"/></svg>')))
  assert.ok(!svgIsSafe(u8('<svg><image href="file:///etc/passwd"/></svg>')))
  assert.ok(!svgIsSafe(u8('<svg><image xlink:href="http://evil.example/x.png"/></svg>')))
  assert.ok(!svgIsSafe(u8('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>')))
  assert.ok(!svgIsSafe(u8('<svg><script>alert(1)</script></svg>')))
  assert.ok(!svgIsSafe(u8('<svg><rect style="fill:url(http://evil.example/a)"/></svg>')))
})

test('fontes do editor: catálogo coerente (ids únicos, arquivos, pilha CSS com reserva)', async () => {
  const { PROMO_FONTS, isPromoFont, fontStack, fontDef } = await import('../src/lib/domain/promo-fonts.ts')
  assert.equal(new Set(PROMO_FONTS.map((f) => f.id)).size, PROMO_FONTS.length)
  assert.ok(PROMO_FONTS.length >= 12 && PROMO_FONTS.every((f) => (f.family ? f.faces.length > 0 && f.faces.every((x) => x.url.startsWith('/fonts/')) : f.faces.length === 0)))
  assert.ok(isPromoFont('oswald') && !isPromoFont('x') && !isPromoFont(3))
  assert.match(fontStack('bebas'), /^"PromoBebas", /)
  assert.match(fontStack('serif'), /^Georgia/)
  assert.equal(fontDef('inexistente').id, 'text')
})
