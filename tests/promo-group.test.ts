import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupItems, groupSummary, parseSize, type GroupInput } from '../src/lib/domain/promo-group.ts'

const it = (ean: string, name: string, price: number, section: string | null = null): GroupInput => ({ ean, name, price, section })

test('tamanho: separa o tamanho e as unidades do nome da fralda ("L44P42UN" = leve 44)', () => {
  assert.deepEqual(parseSize('FRALDA PERSONAL PANTS PROTECT MEGA G L44P42UN'), { base: 'FRALDA PERSONAL PANTS PROTECT MEGA', label: 'G', units: 44 })
  assert.deepEqual(parseSize('FRALDA PERSONAL PANTS PROTECT MEGA XXG L36P34UN'), { base: 'FRALDA PERSONAL PANTS PROTECT MEGA', label: 'XXG', units: 36 })
  assert.deepEqual(parseSize('FRALDA HUGGIES TURMA DA MONICA P C/30'), { base: 'FRALDA HUGGIES TURMA DA MONICA', label: 'P', units: 30 })
  assert.equal(parseSize('SAB. PROTEX 85G C/6 UN'), null) // não é produto com tamanho
  assert.equal(parseSize('FRALDA PERSONAL HIPER 100 G'), null) // "G" depois de número = gramas, não tamanho
})

test('fraldas que só mudam o tamanho viram UM encarte com tabela de tamanho × unidades (na ordem P, M, G, XG, XXG)', () => {
  const r = groupItems([
    it('1', 'FRALDA PERSONAL PANTS PROTECT MEGA G L44P42UN', 59.99, 'fralda'),
    it('2', 'FRALDA PERSONAL PANTS PROTECT MEGA M L52P50UN', 59.99, 'fralda'),
    it('3', 'FRALDA PERSONAL PANTS PROTECT MEGA XG L40P38UN', 59.99, 'fralda'),
    it('4', 'FRALDA PERSONAL PANTS PROTECT MEGA XXG L36P34UN', 59.99, 'fralda'),
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].name, 'FRALDA PERSONAL PANTS PROTECT MEGA')
  assert.equal(r[0].price, 59.99)
  assert.deepEqual(r[0].eans, ['1', '2', '3', '4'])
  assert.equal(r[0].variants?.kind, 'sizes')
  if (r[0].variants?.kind === 'sizes') assert.deepEqual(r[0].variants.rows.map((x) => [x.label, x.units]), [['M', 52], ['G', 44], ['XG', 40], ['XXG', 36]])
})

test('preço diferente entre os tamanhos: não agrupa (encartes separados)', () => {
  const r = groupItems([it('1', 'FRALDA X PANTS G C/30', 59.99), it('2', 'FRALDA X PANTS M C/36', 64.99)])
  assert.equal(r.length, 2)
  assert.ok(r.every((x) => x.variants === null))
})

test('fragrâncias: a variação no FIM do nome (amaciante) vira um encarte só', () => {
  const r = groupItems([
    it('1', 'AMACIANTE COMFORT CONCENTRADO 1L BRISA ELEGANTE', 19.99),
    it('2', 'AMACIANTE COMFORT CONCENTRADO 1L FRESCOR INTENSO', 19.99),
    it('3', 'AMACIANTE COMFORT CONCENTRADO 1L PURO CUIDADO', 19.99),
    it('4', 'CIF COZINHA 500ML DESENGORDURANTE', 12.99),
  ])
  assert.equal(r.length, 2)
  assert.equal(r[0].name, 'AMACIANTE COMFORT CONCENTRADO 1L - VÁRIAS OPÇÕES')
  assert.deepEqual(r[0].eans, ['1', '2', '3'])
  if (r[0].variants?.kind === 'options') assert.deepEqual(r[0].variants.members.map((m) => m.variant), ['BRISA ELEGANTE', 'FRESCOR INTENSO', 'PURO CUIDADO'])
  assert.equal(r[1].variants, null) // o produto sozinho continua normal
})

test('fragrâncias: a variação no MEIO do nome (desinfetante) também agrupa, e "2 LT" vale como "2LT"', () => {
  const r = groupItems([
    it('1', 'DESINFETANTE CASAFLOR AGUA DE COCO 1L', 8.99),
    it('2', 'DESINFETANTE CASAFLOR CAJU 1L', 8.99),
    it('3', 'DESINFETANTE CASAFLOR DESIRE 1L', 8.99),
    it('4', 'AMACIANTE AMACITEL LUXO 2LT MOMENTO DE CARINHO', 9.99),
    it('5', 'AMACIANTE AMACITEL LUXO 2LT VERDE TOQUE DE ACONCHEGO', 9.99),
    it('6', 'AMACIANTE AMACITEL LUXO AZUL TOQUE DE POESIA 2 LT', 9.99),
  ])
  assert.equal(r.length, 2)
  assert.equal(r[0].name, 'DESINFETANTE CASAFLOR 1L - VÁRIAS OPÇÕES')
  assert.equal(r[1].name, 'AMACIANTE AMACITEL LUXO 2LT - VÁRIAS OPÇÕES')
  assert.deepEqual(r[1].eans, ['4', '5', '6'])
})

test('mesma descrição base com um produto "original" sem fragrância entra no grupo', () => {
  const r = groupItems([
    it('1', 'CIF CREMOSO 450ML LIMPEZA MILAGROSA LARANJA', 14.99),
    it('2', 'CIF CREMOSO 450ML LIMPEZA MILAGROSA LIMAO', 14.99),
    it('3', 'CIF CREMOSO 450ML ORIGINAL', 14.99),
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].name, 'CIF CREMOSO 450ML - VÁRIAS OPÇÕES')
})

test('não agrupa produtos de preço, quantidade, marca ou aba diferentes; nem quando só sobra uma palavra em comum', () => {
  assert.equal(groupItems([it('1', 'AMACIANTE COMFORT 1L BRISA', 19.99), it('2', 'AMACIANTE COMFORT 1L PURO', 17.99)]).length, 2) // preço
  assert.equal(groupItems([it('1', 'AMACIANTE COMFORT 1L BRISA', 19.99), it('2', 'AMACIANTE COMFORT 500ML PURO', 19.99)]).length, 2) // quantidade
  assert.equal(groupItems([it('1', 'AMACIANTE COMFORT 1L BRISA', 19.99), it('2', 'AMACIANTE DOWNY 1L PURO', 19.99)]).length, 2) // marca
  assert.equal(groupItems([it('1', 'SAB LIQ DOVE 250ML HIDRATACAO', 9.99, 'a'), it('2', 'SAB LIQ DOVE 250ML NUTRICAO', 9.99, 'b')]).length, 2) // abas diferentes
  assert.equal(groupItems([it('1', 'DES AXE 150ML', 9.99), it('2', 'DES REXONA 150ML', 9.99)]).length, 2)
})

test('política desligada = um encarte por produto, na ordem; resumo conta linhas, encartes e grupos', () => {
  const lista = [it('1', 'FRALDA A G C/10', 10), it('2', 'FRALDA A M C/12', 10), it('3', 'SAB X 85G BRISA', 3), it('4', 'SAB X 85G FLORAL', 3)]
  assert.equal(groupItems(lista, false).length, 4)
  const g = groupItems(lista)
  assert.deepEqual(groupSummary(lista.length, g), { linhas: 4, encartes: 2, gruposTamanho: 1, gruposOpcoes: 1 })
  assert.deepEqual(g.map((e) => e.ean), ['1', '3']) // o encarte leva o código do primeiro membro, na ordem da primeira aparição
})
