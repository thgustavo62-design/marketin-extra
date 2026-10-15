import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildIndex, detectErpColumns, isMedicine, isValidGtin, matchName, nameFromFile, nameTokens, normalizeName, parseEan, searchKey, searchTerms } from '../src/lib/domain/catalog.ts'

test('GTIN: só vale com o dígito verificador certo e tamanho de código de barras', () => {
  assert.equal(isValidGtin('7897473205741'), true)
  assert.equal(isValidGtin('7897473205742'), false) // dígito errado
  assert.equal(isValidGtin('2035'), false) // código interno do ERP
  assert.equal(isValidGtin('78974732057'), false) // 11 dígitos
  assert.equal(parseEan(7897473205741), '7897473205741') // número da planilha
  assert.equal(parseEan(' 7897473205741.0 '), '7897473205741')
  assert.equal(parseEan('abc'), null)
  assert.equal(parseEan(null), null)
})

test('normalizar nome: acento, pontuação, "C/20", unidades e abreviações viram a mesma coisa', () => {
  assert.equal(normalizeName('COND. DOVE 150ML'), normalizeName('Cond Dove 150 ml'))
  assert.equal(normalizeName('DECONGEX PLUS C/12 CPR'), normalizeName('Decongex Plus C12 Comprimidos'))
  assert.equal(normalizeName('SAB. PROTEX 85GR C6 UN'), normalizeName('SAB. PROTEX 85G C/6 UND'))
  assert.equal(normalizeName('Creme Dental Orão 70g'), normalizeName('CREME DENTAL ORAO 70 G'))
  assert.deepEqual(nameTokens('LEITE DE VACA 1L'), ['LEITE', 'VACA', '1L'])
})

test('nome vindo de arquivo: tira extensão, cópia e número; recusa código aleatório e lixo', () => {
  assert.deepEqual(nameFromFile('C:/x/corta preço/MULTIGRIP 20CAP.webp'), { name: 'MULTIGRIP 20CAP' })
  assert.deepEqual(nameFromFile('SH DOVE 400ML (1).png'), { name: 'SH DOVE 400ML' })
  assert.equal(nameFromFile('77ba1cf0-9112-4733-86ca-f96ecf7fe5c1.png').name, null)
  assert.equal(nameFromFile('asdfsfa.webp').name, null)
  assert.equal(nameFromFile('AS.webp').name, null)
  assert.deepEqual(nameFromFile('CR. TRAT SKALA 1KGasd.webp'), { name: 'CR. TRAT SKALA 1KG' })
})

const P = [
  ['1', 'MULTIGRIP 20CAP'], ['2', 'COND. SEDA 250ML TOQUE DE SEDA'], ['3', 'COND. SEDA 250ML RECONSTRUCAO'], ['4', 'COND. SEDA 400ML TOQUE DE SEDA'],
  ['5', 'SURF SABAO LIQUIDO 3L LAVANDA'], ['6', 'REPELENTE EXPOSIS 100ML INFANTIL GEL 10H'], ['7', 'REPELENTE EXPOSIS 100ML INFANTIL SPRAY'],
  ['8', 'ACNASE CLEAN SAB. 80G ESFOLIANTE'], ['9', 'SAB. PROTEX 85GR C/6 UN VITAMINA E'], ['10', 'DECONGEX PLUS C/12 CPR'], ['11', 'DECONGEX PLUS C/20 CPR'],
].map(([id, description]) => ({ id, description }))
const idx = buildIndex(P)

test('casamento: mesma descrição depois de normalizar liga sozinha (exata)', () => {
  const r = matchName(idx, 'Multigrip 20 CAP')
  assert.equal(r.decision, 'exata'); assert.equal(r.best?.id, '1')
  const o = matchName(idx, 'SURF SABAO LIQUIDO LAVANDA 3L') // ordem diferente das palavras
  assert.equal(o.best?.id, '5'); assert.ok(o.best!.score >= 0.95)
})

test('casamento: nome contido no outro e sem concorrente liga como "similar" (marcada para conferir)', () => {
  const r = matchName(idx, 'ACNASE CLEAN SAB. 80G')
  assert.equal(r.decision, 'similar'); assert.equal(r.best?.id, '8')
})

test('casamento: com duas variações possíveis (reconstrução × toque de seda) uma pessoa decide', () => {
  const r = matchName(idx, 'COND SEDA 250ML')
  assert.equal(r.decision, 'incerto')
  assert.deepEqual(r.candidates.slice(0, 2).map((c) => c.id).sort(), ['2', '3'])
})

test('casamento: quantidade diferente nunca é o mesmo produto (250ML × 400ML, C12 × C20)', () => {
  assert.notEqual(matchName(idx, 'COND SEDA 250ML TOQUE DE SEDA').best?.id, '4')
  const r = matchName(idx, 'DECONGEX PLUS C20 CPR')
  assert.equal(r.best?.id, '11')
  const w = matchName(idx, 'DECONGEX PLUS C16 CPR')
  assert.notEqual(w.decision, 'similar'); assert.notEqual(w.decision, 'exata')
})

test('casamento: nomes que se contradizem (spray × gel) não ligam sozinhos', () => {
  const r = matchName(idx, 'REPELENTE EXPOSIS 100ML INFANTIL 10H spray')
  assert.ok(r.decision !== 'similar' && r.decision !== 'exata', r.decision)
})

test('casamento: sem nada parecido devolve "nenhum"', () => {
  assert.equal(matchName(idx, 'shopping').decision, 'nenhum')
  assert.equal(matchName(idx, 'XYZ QWERTY 77G').decision, 'nenhum')
})

test('planilha do ERP: colunas por nome do cabeçalho, nas duas variações de exportação', () => {
  const minas = detectErpColumns(['Barras', 'Descrição', 'Princípio Ativo', 'Estoque', 'Totalizador Fiscal', 'Preço de Venda', 'Registro MS'])
  assert.deepEqual([minas.ean, minas.desc, minas.ingredient, minas.ms, minas.code, minas.group], [0, 1, 2, 6, null, null])
  const farma = detectErpColumns(['Código', 'Descrição', 'Barras', 'Nome Grupo', 'Preço de Venda'])
  assert.deepEqual([farma.code, farma.desc, farma.ean, farma.group], [0, 1, 2, 3])
})

test('busca: sem acento, minúsculas, todos os termos', () => {
  assert.equal(searchKey('Creme Dental ORAÇÃO', '7897473205741', null), 'creme dental oracao 7897473205741')
  assert.deepEqual(searchTerms('  Nivea  Creme 100G '), ['nivea', 'creme', '100g'])
})

test('medicamento fica fora: CMED, registro MS de medicamento ou grupo de medicamento do ERP', () => {
  assert.equal(isMedicine({ ean: '7891000100103' }, new Set(['7891000100103'])), true)
  assert.equal(isMedicine({ registroMs: '1023456780012' }), true)
  assert.equal(isMedicine({ registroMs: '6777700010016' }), false) // cosmético/alimento
  assert.equal(isMedicine({ group: 'GENERICOS - GENERICO ONEROSO' }), true)
  assert.equal(isMedicine({ group: 'ETICO - ETICOS 20% DESC.' }), true)
  assert.equal(isMedicine({ group: 'OTC - ETICOS/LIBERADOS OTC' }), true)
  assert.equal(isMedicine({ group: 'PERFUMARIA - PERFUMARIA HIG. PESSOAL' }), false)
  assert.equal(isMedicine({ group: 'CORRELATOS - HOSPITALARES/ORTOPEDICOS' }), false)
  assert.equal(isMedicine({ group: 'LEITES - LEITE/FORMULA', ean: '7891' }, new Set()), false)
})
