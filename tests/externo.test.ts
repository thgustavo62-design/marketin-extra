import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAdvertising } from '../src/lib/domain/advertising.ts'
import { coverageWindow, daysUntil, easterSunday, keyDatesFor, nthWeekday, upcomingDates } from '../src/lib/domain/calendar.ts'
import { buildHeaderIndex, checkPrice, discoverCmedFile, isIcmsRate, mapCmedRow, normalizeEan, normalizeHeader, parseBrNumber, pmcFor, verdictMessage } from '../src/lib/domain/cmed.ts'
import { mergeIpca, parseHolidays, parseSidra } from '../src/lib/domain/external.ts'

// ---------- calendário ----------
test('n-ésimo dia da semana e Páscoa (valores conhecidos)', () => {
  assert.equal(nthWeekday(2026, 5, 0, 2), '2026-05-10') // Dia das Mães 2026
  assert.equal(nthWeekday(2026, 8, 0, 2), '2026-08-09') // Dia dos Pais 2026
  assert.equal(nthWeekday(2026, 11, 4, 4), '2026-11-26') // 4ª quinta de novembro
  assert.equal(easterSunday(2026), '2026-04-05')
  assert.equal(easterSunday(2025), '2025-04-20')
  assert.equal(easterSunday(2024), '2024-03-31')
})

test('datas do ano: Black Friday, Carnaval e campanhas de mês inteiro', () => {
  const k = Object.fromEntries(keyDatesFor(2026).map((d) => [d.key.split(':')[0], d]))
  assert.equal(k.black_friday.date, '2026-11-27')
  assert.equal(k.carnaval.date, '2026-02-17') // terça de Carnaval
  assert.equal(k.maes.date, '2026-05-10')
  assert.deepEqual([k.outubro_rosa.date, k.outubro_rosa.endDate], ['2026-10-01', '2026-10-31'])
  assert.ok(keyDatesFor(2026).every((d, i, a) => i === 0 || a[i - 1].date <= d.date))
})

test('próximas datas: respeita horizonte, relevância e vira de ano; campanha em andamento ainda conta', () => {
  const u = upcomingDates('2026-10-11', 60, 3).map((d) => d.key.split(':')[0])
  assert.ok(u.includes('outubro_rosa') && u.includes('criancas') && u.includes('novembro_azul') && u.includes('black_friday'))
  assert.ok(!u.includes('diabetes')) // relevância 2
  const y = upcomingDates('2026-12-20', 40, 3).map((d) => d.key)
  assert.ok(y.includes('natal:2026') && y.includes('farmaceutico:2027'))
  assert.equal(daysUntil('2026-10-11', keyDatesFor(2026).find((d) => d.key.startsWith('outubro_rosa'))!), 0)
  assert.equal(daysUntil('2026-10-11', keyDatesFor(2026).find((d) => d.key.startsWith('criancas'))!), 1)
})

test('janela de cobertura: a data tem 4 dias antes e 1 depois; campanha de mês, o mês todo', () => {
  assert.deepEqual(coverageWindow(keyDatesFor(2026).find((d) => d.key.startsWith('criancas'))!), { from: '2026-10-08', to: '2026-10-13' })
  assert.deepEqual(coverageWindow(keyDatesFor(2026).find((d) => d.key.startsWith('novembro_azul'))!), { from: '2026-10-28', to: '2026-11-30' })
})

// ---------- CMED ----------
test('números brasileiros e EAN', () => {
  assert.equal(parseBrNumber('27,44'), 27.44)
  assert.equal(parseBrNumber('1.234,56'), 1234.56)
  assert.equal(parseBrNumber(49.66), 49.66)
  assert.equal(parseBrNumber('    -     '), null)
  assert.equal(parseBrNumber(''), null)
  assert.equal(parseBrNumber('abc'), null)
  assert.equal(normalizeEan('7891106000956'), '7891106000956')
  assert.equal(normalizeEan('    -     '), null)
  assert.equal(normalizeEan('123'), null)
  assert.equal(normalizeHeader('PF 17,5 %  ALC'), 'pf 17,5 % alc')
  assert.equal(isIcmsRate(17.5), true)
  assert.equal(isIcmsRate(16), false)
})

const HEADER = ['SUBSTÂNCIA', 'CNPJ', 'LABORATÓRIO', 'CÓDIGO GGREM', 'REGISTRO', 'EAN 1', 'EAN 2', 'EAN 3', 'PRODUTO', 'APRESENTAÇÃO', 'CLASSE TERAPÊUTICA', 'TIPO DE PRODUTO (STATUS DO PRODUTO)', 'REGIME DE PREÇO',
  'PF Sem Impostos', 'PMC Sem Impostos', 'PMC 0 %', 'PMC 17 %', 'PMC 17 % ALC', 'PMC 17,5 %', 'PMC 18 %', 'RESTRIÇÃO HOSPITALAR', 'TARJA']
const ROW = ['ACEBROFILINA', '73.856.593/0001-66', 'PRATI DONADUZZI', '528526090273007', '1256801590039', '7898148292745', '    -     ', '    -     ', 'ACEBROFILINA', '5 MG/ML XPE CT FR VD AMB X 120 ML + COP', 'R5C - EXPECTORANTES', 'Genérico', 'Regulado',
  '20,16', '28,00', '29,10', '33,91', '31,00', '34,10', '34,50', 'Não', '- (*)']

test('cabeçalho por nome: acha as colunas de PMC por alíquota e ignora as de ALC', () => {
  const h = buildHeaderIndex(HEADER)
  assert.equal(h.ok, true)
  if (h.ok) assert.deepEqual(h.pmcRates.map((r) => r.rate), [0, 17, 17.5, 18])
})

test('cabeçalho com ordem diferente continua funcionando; sem colunas essenciais, falha com aviso', () => {
  const swapped = [...HEADER]; [swapped[8], swapped[3]] = [swapped[3], swapped[8]]
  assert.equal(buildHeaderIndex(swapped).ok, true)
  const bad = buildHeaderIndex(HEADER.filter((h) => h !== 'REGIME DE PREÇO'))
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.error, /regime de preco/)
  assert.equal(buildHeaderIndex(HEADER.filter((h) => !/^PMC \d/.test(h))).ok, false)
})

test('linha da CMED vira produto: EAN limpo, PMC por alíquota, traços viram nulo', () => {
  const h = buildHeaderIndex(HEADER)
  assert.ok(h.ok)
  if (!h.ok) return
  const p = mapCmedRow(h, ROW)!
  assert.deepEqual(p.eans, ['7898148292745'])
  assert.deepEqual(p.pmc, { '0': 29.1, '17': 33.91, '17.5': 34.1, '18': 34.5 })
  assert.equal(p.pfSemImpostos, 20.16)
  assert.equal(p.priceRegime, 'Regulado')
  assert.equal(p.tarja, '- (*)')
  assert.equal(p.hospitalOnly, false)
  assert.equal(mapCmedRow(h, ['x']), null)
})

test('descoberta do arquivo: só o padrão oficial, versão e data de publicação', () => {
  const html = '<a href="/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos/lista_pmc__20261009_115232671.xlsx/@@download/file">PMC</a>'
  const f = discoverCmedFile(html)!
  assert.equal(f.url, 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos/lista_pmc__20261009_115232671.xlsx/@@download/file')
  assert.equal(f.version, '20261009_115232671')
  assert.equal(f.publishedOn, '2026-10-09')
  assert.equal(discoverCmedFile('<a href="https://evil.com/arquivos/lista_pmc__20261009_1.xlsx/x">'), discoverCmedFile('<a href="https://evil.com/arquivos/lista_pmc__20261009_1.xlsx/x">'))
  assert.equal(discoverCmedFile('sem arquivo'), null)
})

test('preço de oferta contra o teto: dentro, acima, sem teto, sem ICMS, não encontrado', () => {
  const prod = { product: 'X', presentation: '10 mg', pmc: { '17': 33.91, '18': 34.5 } }
  assert.equal(pmcFor(prod, 17), 33.91)
  assert.equal(pmcFor(prod, null), null)
  const dentro = checkPrice(33.91, prod, 17)
  assert.equal(dentro.status, 'dentro')
  const acima = checkPrice(35, prod, 17)
  assert.deepEqual([acima.status, acima.pmc, acima.excess], ['acima', 33.91, 1.09])
  assert.equal(checkPrice(30, prod, 20).status, 'sem_teto') // sem PMC para essa alíquota
  assert.equal(checkPrice(30, prod, null).status, 'sem_icms') // nunca afirma "acima" sem a alíquota
  assert.equal(checkPrice(30, null, 17).status, 'nao_encontrado')
  assert.match(verdictMessage(acima), /R\$\s?35,00 ACIMA do teto.*PMC R\$\s?33,91.*infração/s)
  assert.match(verdictMessage(checkPrice(30, prod, null)), /Cadastre a alíquota/)
})

// ---------- fontes abertas ----------
test('feriados da BrasilAPI: lê o que é válido e recusa resposta estranha', () => {
  const r = parseHolidays([{ date: '2026-04-03', name: 'Sexta-feira Santa', type: 'national' }, { date: 'x', name: 'ruim' }, { name: 'sem data' }])
  assert.equal(r.ok && r.rows.length, 1)
  assert.equal(parseHolidays({ erro: 1 }).ok, false)
  assert.equal(parseHolidays([]).ok, false)
})

test('IPCA do IBGE: lê séries, junta mensal e 12 meses, ignora "..." e categorias desconhecidas', () => {
  const sidra = (serie: Record<string, string>, cat = '7661') => [{ resultados: [{ classificacoes: [{ categoria: { [cat]: 'x' } }], series: [{ serie }] }, { classificacoes: [{ categoria: { '9999': 'y' } }], series: [{ serie: { '202609': '9' } }] }] }]
  const mon = parseSidra(sidra({ '202608': '0.10', '202609': '...' }))
  const acc = parseSidra(sidra({ '202608': '4.33', '202609': '4.09' }))
  assert.ok(mon.ok && acc.ok)
  if (mon.ok && acc.ok) {
    assert.equal(mon.points.length, 1)
    const rows = mergeIpca(mon.points, acc.points)
    assert.deepEqual(rows.map((r) => [r.period, r.category, r.monthly, r.accumulated12]), [['2026-08', 'farmaceuticos', 0.1, 4.33], ['2026-09', 'farmaceuticos', null, 4.09]])
  }
  assert.equal(parseSidra({ erro: true }).ok, false)
})

// ---------- RDC 96/2008 ----------
const codes = (t: string, pillar?: string) => checkAdvertising(t, { pillar }).issues.map((i) => i.code)

test('RDC 96: texto sem medicamento não é avaliado como propaganda de medicamento', () => {
  const r = checkAdvertising('Venha conhecer nossa nova loja. Use o cupom BEMVINDO!')
  assert.equal(r.appliesToMedicine, false)
  assert.deepEqual(r.issues, [])
})

test('RDC 96: imperativo, sabor, comprovação científica e única alternativa (com artigo e trecho)', () => {
  const r = checkAdvertising('Tome Dipirona 500 mg, delicioso e cientificamente comprovado. É o único tratamento, dispensa consulta!')
  const c = r.issues.map((i) => i.code)
  assert.ok(['imperativo', 'sabor', 'comprovacao', 'unica_alternativa'].every((x) => c.includes(x)), c.join(','))
  const imp = r.issues.find((i) => i.code === 'imperativo')!
  assert.equal(imp.article, 'art. 8º, VII')
  assert.equal(imp.level, 'vedado')
  assert.match(imp.excerpt ?? '', /Tome Dipirona/)
  assert.equal(r.issues[0].level, 'vedado') // vedados primeiro
})

test('RDC 96: desconto sem preço integral pede revisão; com "de R$ … por R$ …" não', () => {
  assert.ok(codes('Paracetamol 750 mg com 20% de desconto hoje').includes('preco_integral'))
  assert.ok(!codes('Paracetamol 750 mg de R$ 12,90 por R$ 9,90').includes('preco_integral'))
})

test('RDC 96: fidelidade com medicamento, venda sob prescrição e advertência obrigatória', () => {
  assert.ok(codes('Ganhe pontos na compra de qualquer medicamento').includes('fidelidade'))
  const rx = checkAdvertising('Antibiótico amoxicilina em oferta')
  assert.ok(rx.issues.some((i) => i.code === 'prescricao' && i.article === 'art. 27'))
  assert.ok(codes('Dipirona 500 mg para dor e febre').includes('advertencia'))
  assert.ok(!codes('Dipirona 500 mg. Se persistirem os sintomas, o médico deverá ser consultado.').includes('advertencia'))
})

test('RDC 96: pilar "medicamentos" força o contexto e acentos não atrapalham', () => {
  assert.equal(checkAdvertising('Experimente nosso atendimento', { pillar: 'medicamentos' }).appliesToMedicine, true)
  assert.ok(codes('Tome esse comprimido', undefined).includes('imperativo'))
  assert.ok(codes('NÃO PRECISA DE MÉDICO: remédio para dor').includes('unica_alternativa'))
  assert.ok(!codes('Tomei o remédio ontem').includes('imperativo')) // "tomei" não é o imperativo
})
