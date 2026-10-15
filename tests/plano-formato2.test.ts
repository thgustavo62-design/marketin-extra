import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDrafts, cleanPages, parsePlan } from '../src/lib/domain/plan-import.ts'

// Segundo formato de plano (fictício): datas sem ano, tipo C/R + código, horário por regra semanal e briefings "P01 / 10/11 / CARROSSEL / SEMANA 1".
const OPTS = { leadDays: 3, initialStage: 'auto' as const, fileName: 'plano.pdf' }
const FOOT = (n: number) => `FARMACIA MODELO / 60 DIAS 0${n}`
const pg = (n: number, kicker: string, body: string[]) => [kicker, 'Título da página', 'Subtítulo da página', FOOT(n), ...body].join('\n')

const PAGES = [
  pg(1, 'PLANEJAMENTO EDITORIAL', ['Farmácia Modelo', '10 de novembro a 12 de dezembro de 2026 • Cidade Exemplo', 'Direção central', 'Cuidado próximo que aparece em atitudes: orientação responsável,', 'equipe real e benefícios do programa.', 'Outro título', 'Texto de apoio.']),
  pg(2, 'ESTRATÉGIA', ['Texto qualquer da estratégia.', 'Mais texto.']),
  pg(3, 'AGENDA EDITORIAL', [
    'Data Tipo Pauta',
    '10/11 C P01 Tema do primeiro carrossel.',
    '12/11 R P02 “Tema do reel com aspas...”',
    '14/11 C P03 Terceiro tema sem briefing no PDF.',
    '31/12 C P09 Peça fora do período anunciado.',
    'Terça 12h: carrossel • Quinta 18h: Reel • Sábado 10h: carrossel. Horário de Brasília; são janelas',
    'iniciais para teste, não horários comprovados para a conta.',
  ]),
  pg(4, 'CADERNO DE PRODUÇÃO', [
    'P01 / 10/11 / CARROSSEL / SEMANA 1',
    'Tema do primeiro carrossel.',
    'Objetivo: Compartilhamento entre familiares. Por que testar: A preocupação com quem cuidamos',
    'cria identificação.',
    'Capa: Tema do primeiro carrossel.',
    'Card 2: Na próxima conversa, pergunte sobre os medicamentos que ela usa e anote tudo o que',
    'for dito pela equipe.',
    'Card 3: Mantenham uma lista atualizada.',
    'Legenda: Cuidar também é organizar informações. Uma lista atualizada ajuda na conversa com os',
    'profissionais. Compartilhe com quem cuida da família.',
    'Produção: Lista fictícia sem nomes de produtos. Revisão do farmacêutico. Não associar o conteúdo a desconto.',
    'Medir: Compartilhamentos ÷ alcance | Base: S1',
    'P02 / 12/11 / REEL / SEMANA 1',
    '“Tema do reel com aspas...”',
    'Objetivo: Reconhecimento do papel do farmacêutico. Por que testar: Uma frase cotidiana abre espaço.',
    '0-3s: Cliente encenado: “Só me vê alguma coisa para isso...”',
    '3-9s: Farmacêutico: “Antes, eu preciso entender melhor sua dúvida.”',
    '17-25s: Fala: “Uma orientação responsável começa com uma conversa. Algumas situações precisam de',
    'outro atendimento.”',
    'Legenda: Uma boa orientação começa por ouvir. Procure o farmacêutico.',
    'Produção: Cena identificada como simulação. Gravar com profissional real.',
    'Medir: Conversas qualificadas atribuídas à peça | Base: S7',
  ]),
  pg(5, 'PRODUÇÃO E DISTRIBUIÇÃO', ['Etapa Rotina recomendada', 'Preparar Gerência confirma ofertas e operação.', 'Texto da seção seguinte que não é do briefing.']),
]

test('formato 2: datas sem ano, tipo C/R e código; o ano vem do período "10 de novembro a 12 de dezembro de 2026"', () => {
  const p = parsePlan(PAGES)
  assert.deepEqual(p.entries.map((e) => [e.code, e.kind, e.date]), [['P01', 'carrossel', '2026-11-10'], ['P02', 'reel', '2026-11-12'], ['P03', 'carrossel', '2026-11-14'], ['P09', 'carrossel', '2026-12-31']])
  assert.equal(p.entries[1].theme, '“Tema do reel com aspas...”')
  const codes = p.warnings.map((w) => w.code)
  assert.ok(codes.includes('ano_do_periodo'))
  assert.ok(codes.includes('fora_do_periodo'), 'P09 (31/12) está fora do período anunciado')
  assert.match(p.warnings.find((w) => w.code === 'fora_do_periodo')!.message, /P09 \(31\/12\)/)
  assert.match(p.objective ?? '', /^Cuidado próximo que aparece em atitudes: orientação responsável, equipe real e benefícios do programa\.$/)
})

test('formato 2: horário vem da regra semanal do PDF e o texto corrido depois da tabela não vira tema', () => {
  const p = parsePlan(PAGES)
  assert.deepEqual(p.entries.map((e) => e.times[0]), ['12:00', '18:00', '10:00', undefined]) // 31/12/2026 é quinta: a regra de quinta é Reel, não carrossel
  assert.equal(p.entries[3].theme, 'Peça fora do período anunciado.')
  assert.ok(p.warnings.some((w) => w.code === 'horario_por_regra'))
  assert.ok(!p.warnings.some((w) => w.code === 'dias_sem_peca'), 'calendário esparso é proposital: sem aviso de dias vazios')
})

test('formato 2: rodapé repetido no meio da página é removido e a seção seguinte não entra no briefing', () => {
  assert.ok(!cleanPages(PAGES).some((l) => /^FARMACIA MODELO \/ 60 DIAS/.test(l)))
  const p02 = parsePlan(PAGES).entries[1].block!
  assert.equal(p02.fields.medir, 'Conversas qualificadas atribuídas à peça | Base: S7')
  assert.ok(!JSON.stringify(p02).includes('seção seguinte'))
})

test('formato 2: título na linha seguinte, objetivo e "por que testar" separados, Capa/Card e tempos', () => {
  const p = parsePlan(PAGES)
  const p01 = p.entries[0].block!
  assert.equal(p01.heading, 'Tema do primeiro carrossel.')
  assert.equal(p01.fields.objetivo, 'Compartilhamento entre familiares')
  assert.equal(p01.fields.por_que, 'A preocupação com quem cuidamos cria identificação.')
  assert.deepEqual(p01.lists.slides, ['Capa: Tema do primeiro carrossel.', 'Card 2: Na próxima conversa, pergunte sobre os medicamentos que ela usa e anote tudo o que for dito pela equipe.', 'Card 3: Mantenham uma lista atualizada.'])
  assert.match(p01.fields.legenda, /^Cuidar também é organizar informações\./)
  assert.equal(p01.fields.data, '10/11')
  const p02 = p.entries[1].block!
  assert.equal(p02.lists.cenas_tempo.length, 3)
  assert.match(p02.lists.cenas_tempo[2], /^17-25s: Fala: .*precisam de outro atendimento\.”$/)
})

test('formato 2: Reel por tempo vira cenas, roteiro e legenda; "Produção" vira tarefas e pede revisão farmacêutica', () => {
  const ds = buildDrafts(parsePlan(PAGES), OPTS)
  const reel = ds[1]
  assert.deepEqual([reel.format, reel.post_time, reel.stage], ['reels', '18:00', 'briefing'])
  assert.equal(reel.reels.scenes[0].time, '0-3s')
  assert.match(reel.reels.scenes[2].scene, /Fala: .*outro atendimento\./)
  assert.match(reel.script, /^0-3s: Cliente encenado/)
  assert.match(reel.caption, /^Uma boa orientação começa por ouvir/)
  assert.ok(reel.checklist.some((t) => t.startsWith('Gravar: 3-9s Farmacêutico')))
  assert.ok(reel.checklist.includes('Produção: Gravar com profissional real.'))
  const car = ds[0]
  assert.ok(car.checklist.includes('Revisão farmacêutica antes de aprovar'), 'o briefing pede "Revisão do farmacêutico"')
  assert.equal(car.pillar, 'relacionamento') // "famil" no objetivo
  assert.match(car.comment, /Por que testar: A preocupação/)
  assert.match(car.comment, /Medir: Compartilhamentos ÷ alcance/)
  assert.equal(ds[2].stage, 'ideia') // P03 não tem briefing
})

test('o período que cruza o ano resolve cada data sem ano no ano certo', () => {
  const p = parsePlan([['Plano', '20 de dezembro a 10 de janeiro de 2027', 'Data Tipo Pauta', '28/12 C X01 Fim do ano.', '05/01 R X02 Começo do ano.'].join('\n')])
  assert.deepEqual(p.entries.map((e) => e.date), ['2026-12-28', '2027-01-05'])
})

test('sem período anunciado e sem ano nas datas: assume o ano de referência e avisa para conferir', () => {
  const p = parsePlan([['Plano sem período', 'Data Tipo Pauta', '03/03 C X01 Tema.'].join('\n')], { defaultYear: 2031 })
  assert.equal(p.entries[0].date, '2031-03-03')
  assert.equal(p.warnings.find((w) => w.code === 'ano_assumido')?.level, 'aviso')
})
