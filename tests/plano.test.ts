import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDraft, buildDrafts, buildPreviewRows, cleanPages, inferPillar, normalizeTitle, parsePlan, parseRow } from '../src/lib/domain/plan-import.ts'

// Plano fictício com a mesma estrutura dos planos de 60 dias (tabela do calendário + briefings + playbook de stories).
const HEADER = 'PLANO EXEMPLO — Farmácia Modelo'
const page = (n: number, body: string) => `${HEADER}\n${body}\n${n}`
const PAGES = [
  page(1, `PLANO COMPLETO DE MARKETING\n60 DIAS — FARMÁCIA MODELO\n01/06/2026 a 07/06/2026\nObjetivo do ciclo: ser lembrada como a farmácia que resolve rápido.\n1. Como usar este documento\nTexto de abertura.`),
  page(2, [
    '6. Calendário mestre',
    'Dias 1 a 7',
    'Dia/Data Código Formato Tema Horário Stories de apoio',
    'Dia 1', '01/06/2026 (Seg)', 'R01 Reel Genérico que', 'economiza de verdade', '19h Bastidor + prova +', 'CTA WhatsApp',
    'Dia 2', '02/06/2026 (Ter)', 'I01 Feed institucional Atendimento pelo', 'nome', '19h Abertura +', 'enquete + CTA',
    'Dia 3', '03/06/2026 (Qua)', 'C01 Carrossel Organize seu', 'armário de remédios', '11h Resumo do tema', '+ interação',
    'Dia 4', '04/06/2026 (Qui)', 'S01 Stories Serviço e', 'conveniência', '8h / 12h / 18h 5 stories do', 'playbook do dia',
    'Dia 5', '05/06/2026 (Qui)', 'R02 Reel Combo inverno', '19h Bastidor',
    'Dia 6', '06/06/2026 (Sáb)', 'R03 Reel Sem briefing no PDF', '10h30 Stories',
    'Dia 7', '31/02/2026 (Dom)', 'R04 Reel Data impossível', '19h Stories',
  ].join('\n')),
  page(3, [
    '7. Briefings completos — institucionais',
    'I01 — Atendimento pelo nome',
    'Formato Feed institucional (foto de equipe)',
    'Objetivo Diferenciar a Farmácia Modelo de redes impessoais',
    'reforçando atendimento humano.',
    'Pilar Proximidade + Confiança',
    'Gancho criativo “Aqui você não é só mais um cliente.”',
    'Direção visual Template 4. Foto real em destaque, frase curta sobre',
    'fundo azul.',
    'CTA final Vem sentir a diferença.',
    'Roteiro de captação',
    '1. Atendente recebendo cliente pelo nome',
    '2. Sorriso espontâneo da equipe',
    'Legenda pronta',
    'Tem lugar que atende pedido. E tem lugar que atende gente.',
    'Aqui a gente gosta de chamar pelo nome, ouvir com calma e orientar sem pressa. É isso que faz a Farmácia',
    'Modelo cuidar de perto.',
    '\u{1F400} (27) 99999-0000',
    'Stories de apoio',
    ' Story 1: boomerang da equipe',
    ' Story 2: caixa “Qual atendimento te marcou?”',
    'Observação operacional',
    'Garantir o WhatsApp na arte ou na legenda.',
    '8. Briefings completos — carrosséis',
    'C01 — Organize seu armário de remédios',
    'Objetivo Educar sobre organização.',
    'Pilar Educação + Confiança',
    'Direção visual Template 3.',
    'CTA final Salva esse carrossel.',
    'Legenda pronta',
    'Organizar o armário evita erro. Tome apenas o que o médico indicou.',
    'Roteiro slide a slide',
    'Capa: “Organize seu armário de remédios”',
    'Slide 2: “Separe por tipo.”',
    'Orientação de arte',
    'Textos curtos.',
  ].join('\n')),
  page(4, [
    '9. Reels — roteiros completos',
    'R01 — Genérico que economiza de verdade',
    'Data no plano Dia 1 — 01/06/2026 (Seg)',
    'Tipo / duração Oferta | 40 a 60 segundos',
    'Hook Você viu. Gostou. Chamou. Chegou.',
    'CTA final Chama a gente: (27) 99999-0000.',
    'Cenas sugeridas',
    '10. Fachada da loja em movimento',
    '11. Equipe atendendo com atenção',
    'Fala / narração',
    'Chamou. Chegou.',
    'Quando você manda uma mensagem, a equipe já se move. Quando o pedido entra, já começa a ser',
    'separado. Quando está pronto, já está saindo.',
    'Observação operacional',
    'Manter o bordão final.',
    '10. Playbook de stories',
    'S01 — Serviço e conveniência',
    '12. Frame 1: Bom dia + presença da loja',
    '13. Frame 2: Mostra o WhatsApp como canal principal',
    'Regra fixa do dia: terminar com CTA leve.',
    '11. Operação comercial',
    'Texto final que não é briefing.',
  ].join('\n')),
]

test('cleanPages tira cabeçalho repetido, número de página e símbolos invisíveis', () => {
  const lines = cleanPages(PAGES)
  assert.ok(!lines.includes(HEADER))
  assert.ok(!lines.some((l) => /^\d{1,2}$/.test(l)))
  assert.ok(!lines.some((l) => /[-]/.test(l)))
})

test('parseRow separa código, formato, tema, horário e stories de apoio', () => {
  const r = parseRow('R01 Reel Genérico que economiza de verdade 19h Bastidor + prova + CTA WhatsApp')!
  assert.deepEqual([r.code, r.kind, r.theme, r.timesText, r.times, r.support], ['R01', 'reel', 'Genérico que economiza de verdade', '19h', ['19:00'], 'Bastidor + prova + CTA WhatsApp'])
  const s = parseRow('S01 Stories Serviço e conveniência 8h / 12h / 18h 5 stories do playbook do dia')!
  assert.deepEqual([s.kind, s.theme, s.times, s.support], ['stories', 'Serviço e conveniência', ['08:00', '12:00', '18:00'], '5 stories do playbook do dia'])
  assert.equal(parseRow('R05 Reel Dica 10h30 Stories')!.times[0], '10:30')
  const i = parseRow('I01 Feed institucional Atendimento pelo nome 19h Abertura')!
  assert.deepEqual([i.kind, i.formatText, i.theme], ['institucional', 'Feed institucional', 'Atendimento pelo nome'])
})

test('parseRow não confunde texto comum com linha de calendário', () => {
  assert.equal(parseRow('a 23/07/2026'), null)
  assert.equal(parseRow('Versão integrada com reels, institucionais'), null)
  assert.equal(parseRow('Quando 2 horas depois'), null)
})

test('parsePlan lê o calendário inteiro e a tabela de vários formatos', () => {
  const p = parsePlan(PAGES)
  assert.equal(p.entries.length, 6) // R04 tem data impossível (31/02) e é ignorada
  assert.deepEqual(p.entries.map((e) => e.code), ['R01', 'I01', 'C01', 'S01', 'R02', 'R03'])
  assert.deepEqual(p.entries.map((e) => e.kind), ['reel', 'institucional', 'carrossel', 'stories', 'reel', 'reel'])
  assert.deepEqual(p.period, { start: '2026-06-01', end: '2026-06-06' })
  assert.equal(p.objective, 'ser lembrada como a farmácia que resolve rápido.')
  assert.equal(p.entries[0].theme, 'Genérico que economiza de verdade')
  assert.equal(p.entries[2].theme, 'Organize seu armário de remédios')
  assert.equal(p.entries[3].timesText, '8h / 12h / 18h')
  assert.equal(p.entries[5].times[0], '10:30')
})

test('parsePlan avisa o que está errado no PDF em vez de aceitar em silêncio', () => {
  const p = parsePlan(PAGES)
  const codes = p.warnings.map((w) => w.code)
  assert.ok(codes.includes('data_invalida'), 'data inexistente 31/02')
  assert.ok(codes.includes('dia_da_semana'), '05/06/2026 é sexta, não quinta')
  assert.ok(codes.includes('sem_briefing'), 'R02 e R03 sem briefing')
  assert.ok(codes.includes('emoji_corrigido'))
  assert.ok(codes.includes('periodo_divergente'), 'o PDF anuncia 01 a 07/06 mas as linhas válidas vão até 06/06')
  const wk = p.warnings.find((w) => w.code === 'dia_da_semana')!
  assert.match(wk.message, /05\/06\/2026 cai em Sex/)
  assert.equal(wk.entry, 4)
})

test('briefing: rótulos, listas numeradas e parágrafos quebrados pelo PDF', () => {
  const p = parsePlan(PAGES)
  const i01 = p.entries.find((e) => e.code === 'I01')!.block!
  assert.equal(i01.fields.objetivo, 'Diferenciar a Farmácia Modelo de redes impessoais reforçando atendimento humano.')
  assert.equal(i01.fields.pilar, 'Proximidade + Confiança')
  assert.equal(i01.fields.direcao, 'Template 4. Foto real em destaque, frase curta sobre fundo azul.')
  assert.deepEqual(i01.lists.captacao, ['Atendente recebendo cliente pelo nome', 'Sorriso espontâneo da equipe'])
  assert.deepEqual(i01.lists.stories_apoio, ['Story 1: boomerang da equipe', 'Story 2: caixa “Qual atendimento te marcou?”'])
  // linha longa sem ponto final continua na seguinte; frase terminada em ponto começa novo parágrafo
  assert.equal(i01.fields.legenda.split('\n')[0], 'Tem lugar que atende pedido. E tem lugar que atende gente.')
  assert.match(i01.fields.legenda, /É isso que faz a Farmácia Modelo cuidar de perto\./)
  assert.match(i01.fields.legenda, /📲 \(27\) 99999-0000/)
  const r01 = p.entries[0].block!
  assert.deepEqual(r01.lists.cenas, ['Fachada da loja em movimento', 'Equipe atendendo com atenção'])
  assert.match(r01.fields.fala, /já começa a ser separado\./)
})

test('um título numerado encerra o briefing em texto corrido, mas numeração dentro de lista é item', () => {
  const p = parsePlan(PAGES)
  const r01 = p.entries[0].block!
  assert.equal(r01.fields.obs_operacional, 'Manter o bordão final.') // não engoliu "10. Playbook de stories"
  assert.equal(r01.lists.cenas.length, 2) // "10." e "11." eram itens da lista
  const s01 = p.entries.find((e) => e.code === 'S01')!.block!
  assert.deepEqual(s01.lists.frames, ['Frame 1: Bom dia + presença da loja', 'Frame 2: Mostra o WhatsApp como canal principal'])
  assert.equal(s01.fields.regra, 'terminar com CTA leve.') // não engoliu "11. Operação comercial"
})

test('o objetivo do ciclo que quebra em duas linhas no PDF é lido inteiro', () => {
  const p = parsePlan([['PLANO', '60 DIAS', 'Objetivo do ciclo: ser a farmácia que resolve rápido e fica na cabeça da', 'cidade.', 'Documento estratégico', 'Dia 1', '01/06/2026 (Seg)', 'R01 Reel A 19h x'].join('\n')])
  assert.equal(p.objective, 'ser a farmácia que resolve rápido e fica na cabeça da cidade.')
})

test('sem calendário: erro claro e nenhuma pauta', () => {
  const p = parsePlan(['Documento sem tabela\nSó texto corrido sobre marketing.'])
  assert.equal(p.entries.length, 0)
  assert.equal(p.warnings[0].level, 'erro')
  assert.equal(p.warnings[0].code, 'sem_calendario')
})

test('linha repetida e código repetido em datas diferentes são sinalizados', () => {
  const p = parsePlan([['Dia 1', '01/06/2026 (Seg)', 'R01 Reel A 19h x', 'Dia 1', '01/06/2026 (Seg)', 'R01 Reel A 19h x', 'Dia 2', '02/06/2026 (Ter)', 'R01 Reel B 19h x'].join('\n')])
  assert.equal(p.entries.length, 2)
  const codes = p.warnings.map((w) => w.code)
  assert.ok(codes.includes('linha_repetida') && codes.includes('codigo_repetido'))
})

test('tabela em uma linha só (outro gerador de PDF) também é lida', () => {
  const p = parsePlan(['Dia 1 01/06/2026 (Seg) R01 Reel Tema curto 19h Apoio\nDia 2 02/06/2026 (Ter) C01 Carrossel Outro tema 11h Apoio 2'].map((s) => s))
  assert.deepEqual(p.entries.map((e) => [e.code, e.dayNumber, e.theme, e.support]), [['R01', 1, 'Tema curto', 'Apoio'], ['C01', 2, 'Outro tema', 'Apoio 2']])
})

test('linha sem código mas com formato recebe código sintético estável', () => {
  const p = parsePlan(['01/06/2026 (Seg) Reel Tema sem código 19h Apoio'].map((s) => s))
  assert.equal(p.entries[0].code, 'D01')
  assert.equal(p.entries[0].codeFromPlan, false)
})

// ---------- conversão em pautas ----------
const OPTS = { leadDays: 3, initialStage: 'auto' as const, fileName: 'plano.pdf' }

test('Reel vira Reels com roteiro, cenas e tarefas de gravação', () => {
  const d = buildDrafts(parsePlan(PAGES), OPTS)[0]
  assert.equal(d.title, 'R01 · Genérico que economiza de verdade')
  assert.deepEqual([d.format, d.pillar, d.stage, d.post_date, d.post_time, d.due_at], ['reels', 'campanha', 'briefing', '2026-06-01', '19:00', '2026-05-29'])
  assert.equal(d.reels.hook, 'Você viu. Gostou. Chamou. Chegou.')
  assert.equal(d.reels.cta, 'Chama a gente: (27) 99999-0000.')
  assert.equal(d.reels.scenes.length, 2)
  assert.match(d.script, /Chamou\. Chegou\./)
  assert.ok(d.checklist.includes('Gravar: Fachada da loja em movimento'))
  assert.ok(d.checklist.includes('Conferir o WhatsApp na arte, na legenda ou na tela final') === false) // sem menção de WhatsApp nesse briefing
})

test('Feed institucional: legenda pronta, captação e stories de apoio viram campos e tarefas', () => {
  const d = buildDrafts(parsePlan(PAGES), OPTS)[1]
  assert.deepEqual([d.format, d.pillar], ['feed', 'relacionamento'])
  assert.match(d.caption, /^Tem lugar que atende pedido/)
  assert.match(d.script, /Gancho: “Aqui você não é só mais um cliente\.”/)
  assert.ok(d.checklist.includes('Captar: Atendente recebendo cliente pelo nome'))
  assert.ok(d.checklist.includes('Story de apoio — Story 1: boomerang da equipe'))
  assert.ok(d.checklist.includes('Conferir o WhatsApp na arte, na legenda ou na tela final'))
  assert.match(d.comment, /Objetivo: Diferenciar a Farmácia Modelo/)
  assert.match(d.comment, /peça I01/)
})

test('Carrossel: roteiro slide a slide no roteiro; texto sobre medicamento pede revisão', () => {
  const d = buildDrafts(parsePlan(PAGES), OPTS)[2]
  assert.deepEqual([d.format, d.pillar], ['carrossel', 'educacao'])
  assert.match(d.script, /^Roteiro slide a slide:\nCapa: “Organize seu armário de remédios”\nSlide 2: “Separe por tipo\.”/)
  assert.equal(d.ad.medicine, true)
  assert.ok(d.ad.issues >= 1, 'o imperativo "tome" é apontado pela RDC 96')
  assert.ok(d.checklist.includes('Revisão farmacêutica antes de aprovar'))
})

test('Stories: formato feed (convenção do sistema), prazo de 1 dia, frames como tarefas e horários', () => {
  const d = buildDrafts(parsePlan(PAGES), OPTS)[3]
  assert.equal(d.title, 'S01 · Stories: Serviço e conveniência')
  assert.deepEqual([d.format, d.post_time, d.due_at, d.pillar], ['feed', '08:00', '2026-06-03', 'servicos'])
  assert.ok(d.checklist.includes('Frame 1: Bom dia + presença da loja'))
  assert.ok(d.checklist.includes('Publicar nos horários: 8h / 12h / 18h'))
  assert.match(d.script, /Regra fixa do dia: terminar com CTA leve\./)
})

test('sem briefing entra como Ideia; etapa inicial pode ser forçada; revisão farmacêutica nunca vem marcada', () => {
  const plan = parsePlan(PAGES)
  const noBrief = plan.entries.find((e) => e.code === 'R03')!
  assert.equal(buildDraft(noBrief, OPTS).stage, 'ideia')
  assert.equal(buildDraft(plan.entries[0], { ...OPTS, initialStage: 'ideia' }).stage, 'ideia')
  assert.equal(buildDraft(noBrief, { ...OPTS, initialStage: 'briefing' }).stage, 'briefing')
  assert.ok(!('pharma_review' in buildDraft(plan.entries[0], OPTS)), 'o rascunho não traz pharma_review: a revisão é feita por uma pessoa')
})

test('pilar: primeiro termo do pilar manda; tipo do Reel; tema; padrão por formato', () => {
  const plan = parsePlan(PAGES)
  assert.equal(inferPillar(plan.entries[1]), 'relacionamento') // "Proximidade + Confiança"
  assert.equal(inferPillar(plan.entries[0]), 'campanha') // tipo "Oferta"
  assert.equal(inferPillar(plan.entries[5]), 'institucional') // sem briefing nem pista no tema: padrão do Reel
})

test('título longo é cortado; checklist sem duplicatas e com limite', () => {
  const plan = parsePlan(PAGES)
  const e = { ...plan.entries[0], theme: 'x'.repeat(400) }
  assert.ok(buildDraft(e, OPTS).title.length <= 140)
  const d = buildDraft(plan.entries[1], OPTS)
  assert.equal(new Set(d.checklist).size, d.checklist.length)
  assert.ok(d.checklist.every((t) => t.length <= 200))
})

test('normalizeTitle ignora acento, caixa e pontuação', () => {
  assert.equal(normalizeTitle('R01 · Genérico, que  economiza!'), 'r01 generico que economiza')
})

test('prévia: datas passadas e peças que já existem vêm desmarcadas; o resto vem marcado', () => {
  const plan = parsePlan(PAGES)
  const existing = [{ post_date: '2026-06-02', title: 'I01 · Atendimento pelo nome', format: 'feed' }, { post_date: '2026-06-05', title: 'Outra coisa', format: 'reels' }]
  const rows = buildPreviewRows(plan, existing, '2026-06-03', OPTS)
  const by = Object.fromEntries(rows.map((r) => [r.code, r]))
  assert.equal(by.R01.past, true); assert.equal(by.R01.checked, false) // 01/06 já passou
  assert.equal(by.I01.duplicate, true); assert.equal(by.I01.checked, false) // já existe
  assert.equal(by.C01.checked, true) // 03/06 é hoje: ainda vale
  assert.equal(by.R02.sameDay, 1) // já há um Reels em 05/06 (informativo, não bloqueia)
  assert.equal(by.R02.checked, true)
  assert.ok(by.R02.notes.some((n) => /cai em Sex/.test(n)), 'o aviso do dia da semana aparece na linha')
  assert.equal(by.C01.medicine, true)
})
