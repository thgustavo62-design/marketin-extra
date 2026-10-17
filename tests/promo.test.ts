import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_THEME, applyOverrides, detectPromoColumns, normalizeItemStyle, normalizeOverrides, normalizeTheme, pageLayout, paginate, paginateSections, parsePrice, parsePromoRows, placeCells, priceParts } from '../src/lib/domain/promo.ts'

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
  const few = pageLayout('a4', { cols: 4, rows: 4 }, false, 420, 0, { count: 8 })
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
  const flush = pageLayout('a4', { cols: 4, rows: 4 }, true, 440, 0, { count: 16, marginPct: 0 })
  assert.equal(flush.panel!.x, 0)
  assert.equal(flush.panel!.w, 1414)
  assert.equal(flush.panel!.y, 440) // sem folga abaixo do cabeçalho
  assert.equal(flush.panel!.y + flush.panel!.h, 2000) // até o fim da folha
  const tucked = pageLayout('feed', { cols: 3, rows: 2 }, true, 385, 162, { count: 6, marginPct: 3.3, tuck: true })
  const normal = pageLayout('feed', { cols: 3, rows: 2 }, true, 385, 162, { count: 6, marginPct: 3.3, tuck: false })
  assert.ok(tucked.panel!.y < normal.panel!.y && tucked.panel!.y + tucked.panel!.h === normal.panel!.y + normal.panel!.h) // sobe por baixo do cabeçalho, mesmo fim
  assert.deepEqual(tucked.cells, normal.cells) // os produtos ficam no mesmo lugar
})

test('cartões por produto: área em pixels, espaço entre cartões e última linha centralizada pelo passo da coluna', () => {
  const L = pageLayout('story', { cols: 2, rows: 3 }, false, 437, 257, { area: { top: 374, bottom: 1693 }, marginPct: 7.6, gapPct: 2.2 })
  assert.equal(L.panel, null)
  assert.equal(L.cells.length, 6)
  assert.ok(L.cells[0].y >= 374 && L.cells[4].y + L.cells[4].h <= 1693 + 1) // dentro da área pedida, ignorando cabeçalho e rodapé
  const gapX = L.cells[1].x - (L.cells[0].x + L.cells[0].w)
  assert.ok(gapX >= 20 && gapX <= 28, String(gapX)) // ≈ 2,2% de 1080 ≈ 24 px entre os cartões
  const p = placeCells(L.cells, 5, 2, L.pitchX)
  assert.equal(p[4].x, L.cells[4].x + Math.round(L.pitchX / 2))
  const n = normalizeTheme({ cards: { story: '#ececec', feed: 'branco', a4: null }, gridArea: { story: { top: 374, bottom: 1693 }, feed: { top: 900, bottom: 910 } }, cardGap: 99, clouds: false })
  assert.deepEqual([n.cards.story, n.cards.feed, n.cards.a4], ['#ececec', null, null])
  assert.deepEqual(n.gridArea.story, { top: 374, bottom: 1693 })
  assert.equal(n.gridArea.feed, null) // área menor que 200 px é descartada
  assert.equal(n.cardGap, DEFAULT_THEME.cardGap)
  assert.equal(n.clouds, false)
})

test('abas da planilha: cada aba começa uma peça (quando o tema pede) e o repetido vale só na primeira aba', () => {
  const itens = [{ s: 'leite', n: 1 }, { s: 'leite', n: 2 }, { s: 'leite', n: 3 }, { s: 'fralda', n: 4 }, { s: 'perfumaria', n: 5 }, { s: 'perfumaria', n: 6 }].map((x) => ({ section: x.s, n: x.n }))
  assert.deepEqual(paginateSections(itens, 2, true).map((p) => p.map((x) => x.n)), [[1, 2], [3], [4], [5, 6]]) // aba nova = peça nova; aba grande também se divide
  assert.deepEqual(paginateSections(itens, 4, false).map((p) => p.map((x) => x.n)), [[1, 2, 3, 4], [5, 6]]) // sem quebra: em fila
  assert.deepEqual(paginateSections([], 6, true), [])
  const cols = { ean: 0, price: 1, name: null }
  const seen = new Set<string>()
  const a = parsePromoRows([['7897473205741', '10,00'], ['7891000100103', '5']], cols, 2, { seen, section: 'leite' })
  const b = parsePromoRows([['7897473205741', '99'], ['7898357410015', '7']], cols, 2, { seen, section: 'fralda' })
  assert.deepEqual(a.rows.map((r) => r.section), ['leite', 'leite'])
  assert.deepEqual(b.rows.map((r) => r.ean), ['7898357410015']) // o repetido da outra aba não entra
  assert.equal(b.errors.length, 1)
})

test('estilo do encarte: só aceita cor, alinhamento, tamanho e etiqueta válidos', () => {
  assert.deepEqual(normalizeItemStyle({ tag: '  Leve 3 Pague 2  ', badgeColor: '#AA0000', priceColor: 'vermelho', nameAlign: 'center', nameScale: 120 }), { tag: 'Leve 3 Pague 2', badgeColor: '#aa0000', nameAlign: 'center', nameScale: 120 })
  assert.deepEqual(normalizeItemStyle({ nameAlign: 'topo', nameScale: 500, tag: '' }), { tag: '' }) // "" = sem etiqueta neste encarte
  assert.deepEqual(normalizeItemStyle(null), {})
  assert.equal(normalizeItemStyle({ tag: 'x'.repeat(60) }).tag!.length, 24)
})

test('textos da promoção valem no lugar dos do tema', () => {
  const o = normalizeOverrides({ tagText: ' Oba! ', showTag: false, footerLines: ['(27) 99999-0000', '', 'Rua A, 1'], extraText: 'Rua das Flores, 123' })
  assert.deepEqual(o, { tagText: 'Oba!', showTag: false, footerLines: ['(27) 99999-0000', 'Rua A, 1'], extraText: 'Rua das Flores, 123' })
  const t = applyOverrides(DEFAULT_THEME, o)
  assert.equal(t.tagText, 'Oba!'); assert.equal(t.showTag, false); assert.deepEqual(t.footerLines, ['(27) 99999-0000', 'Rua A, 1'])
  assert.deepEqual(applyOverrides(DEFAULT_THEME, {}), DEFAULT_THEME) // sem texto próprio: fica o do tema
})

test('fundo da peça: aceita só escolha válida (pronto, cores, imagem, tema) e entra nos textos da promoção', async () => {
  const { normalizeBackground, normalizeOverrides, BACKGROUND_PRESETS } = await import('../src/lib/domain/promo.ts')
  const U = '3f2b6c1e-8a4d-4c7e-9f10-2b5d6e7a8c90'
  assert.deepEqual(normalizeBackground({ kind: 'preset', id: 'ceu' }), { kind: 'preset', id: 'ceu' })
  assert.equal(normalizeBackground({ kind: 'preset', id: 'nao-existe' }), undefined)
  assert.deepEqual(normalizeBackground({ kind: 'color', color: '#FF0000', color2: '#00FF00' }), { kind: 'color', color: '#ff0000', color2: '#00ff00' })
  assert.deepEqual(normalizeBackground({ kind: 'color', color: '#ff0000', color2: 'azul' }), { kind: 'color', color: '#ff0000' })
  assert.equal(normalizeBackground({ kind: 'color', color: 'vermelho' }), undefined)
  assert.deepEqual(normalizeBackground({ kind: 'asset', asset: U }), { kind: 'asset', asset: U })
  assert.equal(normalizeBackground({ kind: 'asset', asset: '../etc/passwd' }), undefined)
  assert.deepEqual(normalizeBackground({ kind: 'theme', themeId: U }), { kind: 'theme', themeId: U })
  assert.equal(normalizeBackground('lixo'), undefined)
  assert.deepEqual(normalizeOverrides({ background: { kind: 'preset', id: 'roxo' }, tagText: 'Oba' }), { tagText: 'Oba', background: { kind: 'preset', id: 'roxo' } })
  assert.ok(BACKGROUND_PRESETS.length >= 12 && new Set(BACKGROUND_PRESETS.map((p) => p.id)).size === BACKGROUND_PRESETS.length)
})

test('promoção: artes fixas desligadas guardam só ids válidos, sem repetir', async () => {
  const { normalizeOverrides } = await import('../src/lib/domain/promo.ts')
  assert.deepEqual(normalizeOverrides({ hideFixed: ['lab12cd34', 'lab12cd34', '??', 5, 'xy'] }).hideFixed, ['lab12cd34'])
  assert.equal(normalizeOverrides({ hideFixed: [] }).hideFixed, undefined)
})
