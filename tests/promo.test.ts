import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_THEME, detectPromoColumns, normalizeTheme, pageLayout, paginate, parsePrice, parsePromoRows, placeCells, priceParts } from '../src/lib/domain/promo.ts'

test('preço: aceita número, texto brasileiro e com R$; recusa lixo e negativo', () => {
  assert.equal(parsePrice(59.99), 59.99)
  assert.equal(parsePrice('59,99'), 59.99)
  assert.equal(parsePrice('R$ 1.234,56'), 1234.56)
  assert.equal(parsePrice('12.5'), 12.5)
  assert.equal(parsePrice('1.234.567'), null) // milhar demais: passa do limite de 100 mil
  assert.equal(parsePrice('1.234'), 1234) // ponto com 3 dígitos depois = milhar
  assert.equal(parsePrice('abc'), null)
  assert.equal(parsePrice(-1), null)
  assert.equal(parsePrice(''), null)
  assert.equal(parsePrice(null), null)
  assert.equal(parsePrice(10.004), 10)
})

test('preço dividido em reais e centavos (a arte mostra os centavos menores)', () => {
  assert.deepEqual(priceParts(59.9), { reais: '59', centavos: '90' })
  assert.deepEqual(priceParts(7), { reais: '7', centavos: '00' })
  assert.deepEqual(priceParts(0.99), { reais: '0', centavos: '99' })
  assert.deepEqual(priceParts(1234.5), { reais: '1234', centavos: '50' })
})

test('colunas da planilha de promoção por nome do cabeçalho', () => {
  assert.deepEqual(detectPromoColumns(['Código de Barras', 'Preço Promocional']), { ean: 0, price: 1, name: null })
  assert.deepEqual(detectPromoColumns(['EAN', 'Produto', 'Valor Promoção']), { ean: 0, price: 2, name: 1 })
  assert.deepEqual(detectPromoColumns(['Barras', 'Descrição', 'Preço de Venda', 'Preço de Promoção']), { ean: 0, price: 3, name: 1 })
  assert.deepEqual(detectPromoColumns(['gtin', 'preço']), { ean: 0, price: 1, name: null })
  // o preço da promoção é a coluna "Valor aproximado", mesmo havendo outras colunas de preço
  assert.deepEqual(detectPromoColumns(['Código de Barras', 'Descrição', 'Preço de Venda', 'Valor Aproximado']), { ean: 0, price: 3, name: 1 })
  assert.deepEqual(detectPromoColumns(['EAN', 'Valor Aprox.', 'Preço Promocional']), { ean: 0, price: 1, name: null })
  assert.equal(detectPromoColumns(['a', 'b']).ean, null)
})

test('linhas da planilha: valida EAN e preço, avisa de repetidos e ignora linhas vazias', () => {
  const cols = { ean: 0, price: 1, name: 2 }
  const r = parsePromoRows([
    ['7897473205741', '59,99', 'Aptanutri'],
    ['7897473205742', '10', ''], // dígito errado
    ['', '', ''], // vazia
    ['7897473205741', '1', ''], // repetido
    ['7891000100103', 'xx', ''], // preço inválido
    [7891000100103, 18.99, ''],
  ], cols)
  assert.deepEqual(r.rows.map((x) => [x.ean, x.price]), [['7897473205741', 59.99], ['7891000100103', 18.99]])
  assert.equal(r.rows[0].name, 'Aptanutri')
  assert.equal(r.rows[1].name, null)
  assert.deepEqual(r.errors.map((e) => e.line), [3, 5, 6])
})

test('tema: cor inválida e grade absurda voltam ao padrão', () => {
  const t = normalizeTheme({ colors: { badge: '#112233', name: 'vermelho' }, grid: { story: { cols: 3, rows: 4 }, feed: { cols: 99, rows: 1 } }, tagText: 'Oba!', footerLines: ['a', '', 'b', 'c', 'd'] })
  assert.equal(t.colors.badge, '#112233')
  assert.equal(t.colors.name, DEFAULT_THEME.colors.name)
  assert.deepEqual(t.grid.story, { cols: 3, rows: 4 })
  assert.deepEqual(t.grid.feed, DEFAULT_THEME.grid.feed)
  assert.equal(t.tagText, 'Oba!')
  assert.deepEqual(t.footerLines, ['a', 'b', 'c'])
  assert.deepEqual(normalizeTheme(null), DEFAULT_THEME)
})

test('páginas: divide os itens pelo tamanho da grade', () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(paginate([], 6), [])
})

test('posição: grade cabe no painel, sem sobrepor, e a última linha incompleta é centralizada', () => {
  const L = pageLayout('story', { cols: 2, rows: 3 }, true, 360, 170)
  assert.equal(L.cells.length, 6)
  assert.ok(L.panel && L.panel.y >= 360 && L.panel.y + L.panel.h <= 1920 - 170)
  for (const c of L.cells) assert.ok(c.x >= L.panel!.x && c.x + c.w <= L.panel!.x + L.panel!.w && c.y >= L.panel!.y && c.y + c.h <= L.panel!.y + L.panel!.h)
  const p = placeCells(L.cells, 5, 2) // 5 itens em 2 colunas: o último fica no meio
  assert.equal(p.length, 5)
  assert.equal(p[4].x, L.cells[4].x + Math.round(L.cells[0].w / 2))
  assert.equal(p[3].x, L.cells[3].x) // linhas cheias não mexem
  // poucos produtos: só as linhas necessárias, centralizadas, sem esticar a célula
  const few = pageLayout('a4', { cols: 4, rows: 4 }, false, 420, 0, 8)
  assert.equal(few.cells.length, 8) // 2 linhas × 4 colunas
  assert.ok(few.cells[0].h <= Math.round(few.cells[0].w * 1.5) + 1)
  assert.ok(few.cells[0].y > 420) // abaixo do cabeçalho, bloco centralizado
  const a4 = pageLayout('a4', { cols: 4, rows: 4 }, false, 420, 0)
  assert.equal(a4.cells.length, 16)
  assert.equal(a4.panel, null)
})

test('painel: margem e "por baixo do cabeçalho" vêm do tema; margem 0 = painel de ponta a ponta sem folgas', () => {
  const t = normalizeTheme({ panelMargin: { story: 3.3, feed: 99, a4: 0 }, panelTuck: true })
  assert.equal(t.panelMargin.story, 3.3)
  assert.equal(t.panelMargin.feed, DEFAULT_THEME.panelMargin.feed) // fora de 0–12: volta ao padrão
  assert.equal(t.panelMargin.a4, 0)
  assert.equal(t.panelTuck, true)
  assert.equal(normalizeTheme({}).panelTuck, false)
  const flush = pageLayout('a4', { cols: 4, rows: 4 }, true, 440, 0, 16, 0)
  assert.equal(flush.panel!.x, 0)
  assert.equal(flush.panel!.w, 1414)
  assert.equal(flush.panel!.y, 440) // sem folga abaixo do cabeçalho
  assert.equal(flush.panel!.y + flush.panel!.h, 2000) // até o fim da folha
  const tucked = pageLayout('feed', { cols: 3, rows: 2 }, true, 385, 162, 6, 3.3, true)
  const normal = pageLayout('feed', { cols: 3, rows: 2 }, true, 385, 162, 6, 3.3, false)
  assert.ok(tucked.panel!.y < normal.panel!.y && tucked.panel!.y + tucked.panel!.h === normal.panel!.y + normal.panel!.h) // sobe por baixo do cabeçalho, mesmo fim
  assert.deepEqual(tucked.cells, normal.cells) // os produtos ficam no mesmo lugar
})
