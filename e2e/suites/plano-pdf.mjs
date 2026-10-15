// @title: Importar plano em PDF (dois formatos, com PDFs fictícios gerados na hora): prévia, importação, desfazer, duplicidade e permissões
// @needs:
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const req = createRequire(new URL('../../package.json', import.meta.url))
const pg = req('pg')
const { PDFDocument, StandardFonts } = req('pdf-lib')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 260) : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } })
await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const addD = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const br = (iso) => iso.split('-').reverse().join('/')
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const wdIdx = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay()
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const longBR = (iso) => `${Number(iso.slice(8))} de ${MES[Number(iso.slice(5, 7)) - 1]}`
const TMP = mkdtempSync(join(tmpdir(), 'e2e-plano-'))

// ---- gera um PDF de texto simples: uma lista de páginas, cada uma uma lista de linhas ----
async function makePdf(pages) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const lines of pages) { const page = pdf.addPage([595, 842]); let y = 800; for (const l of lines) { page.drawText(l, { x: 40, y, size: 9, font }); y -= 13 } }
  return Buffer.from(await pdf.save())
}

// Formato 1: tabela "Dia N / dd/mm/aaaa (Seg) / R01 Reel Tema / 19h apoio" + briefings por rótulo. Duas peças já passaram.
const start1 = addD(today, -2)
const rows1 = [['R01', 'Reel', 'Tema do reel um', '19h', 'Bastidor'], ['I01', 'Feed institucional', 'Atendimento de teste', '11h', 'Enquete'], ['C01', 'Carrossel', 'Dicas de teste', '19h', 'Resumo'], ['S01', 'Stories', 'Servico de teste', '8h / 12h / 18h', '5 stories']]
const d1 = (i) => addD(start1, i)
const pdf1 = await makePdf([
  ['PLANO DE TESTE', '4 DIAS - FARMACIA MODELO', `${br(d1(0))} a ${br(d1(3))}`, 'Objetivo do ciclo: testar a importacao de plano.', '6. Calendario mestre', 'Dia/Data Codigo Formato Tema Horario Stories de apoio',
    ...rows1.flatMap((r, i) => [`Dia ${i + 1}`, `${br(d1(i))} (${WD[wdIdx(d1(i))]})`, `${r[0]} ${r[1]} ${r[2]}`, `${r[3]} ${r[4]}`])],
  ['7. Briefings completos', 'I01 — Atendimento de teste', 'Formato Feed institucional', 'Objetivo Teste do objetivo.', 'Pilar Proximidade + Confianca', 'Gancho criativo "Gancho de teste."', 'CTA final Chame a gente.',
    'Roteiro de captacao', '1. Captar a fachada', '2. Captar a equipe', 'Legenda pronta', 'Legenda de teste do feed.', 'Stories de apoio', 'Story 1: abertura', 'Observacao operacional', 'Incluir WhatsApp.',
    '8. Briefings completos - carrosseis', 'C01 — Dicas de teste', 'Objetivo Educar.', 'Pilar Educacao', 'CTA final Salva.', 'Legenda pronta', 'Legenda do carrossel.', 'Roteiro slide a slide', 'Capa: "Dicas"', 'Slide 2: "Dica um"'],
  ['9. Reels', 'R01 — Tema do reel um', `Data no plano Dia 1 — ${br(d1(0))} (${WD[wdIdx(d1(0))]})`, 'Tipo / duracao Oferta | 40 a 60 segundos', 'Hook Gancho do reel.', 'CTA final Chame.', 'Cenas sugeridas', '1. Cena um', '2. Cena dois', 'Fala / narracao', 'Fala do reel de teste.',
    '10. Playbook de stories', 'S01 — Servico de teste', 'Frame 1: Bom dia', 'Frame 2: CTA', 'Regra fixa do dia: terminar com CTA.'],
])

// Formato 2: "dd/mm C P01 Título", ano só no período do topo, horário por regra semanal, briefings "P01 / dd/mm / CARROSSEL / SEMANA 1".
let base2 = addD(today, 7); while (wdIdx(base2) !== 1) base2 = addD(base2, 1) // próxima segunda
const e2 = [[1, 'C', 'P01', 'Tema do primeiro carrossel.'], [3, 'R', 'P02', '“Tema do reel de teste...”'], [5, 'C', 'P03', 'Terceiro tema sem briefing.'], [8, 'C', 'P04', 'Quarto tema.'], [10, 'R', 'P05', 'Quinto tema.']]
const dm = (iso) => iso.slice(8) + '/' + iso.slice(5, 7)
const FOOT = (n) => `FARMACIA MODELO / 60 DIAS 0${n}`
const hdr = (n, k) => [k, 'Titulo da pagina', 'Subtitulo da pagina', FOOT(n)]
const pdf2 = await makePdf([
  [...hdr(1, 'PLANEJAMENTO EDITORIAL'), 'Farmacia Modelo', `${longBR(addD(base2, 0))} a ${longBR(addD(base2, 10))} de ${addD(base2, 10).slice(0, 4)} - Cidade`, 'Direcao central', 'Cuidado proximo que aparece em atitudes.'],
  [...hdr(2, 'ESTRATEGIA'), 'Texto da estrategia.'],
  [...hdr(3, 'AGENDA EDITORIAL'), 'Data Tipo Pauta', ...e2.map(([n, t, c, th]) => `${dm(addD(base2, n))} ${t} ${c} ${th}`),
    'Terça 12h: carrossel • Quinta 18h: Reel • Sábado 10h: carrossel. Horário de Brasília; são janelas', 'iniciais para teste.'],
  [...hdr(4, 'CADERNO DE PRODUÇÃO'),
    `P01 / ${dm(addD(base2, 1))} / CARROSSEL / SEMANA 1`, 'Tema do primeiro carrossel.', 'Objetivo: Compartilhamento entre familiares. Por que testar: Identificacao.', 'Capa: Tema do primeiro carrossel.', 'Card 2: Pergunte sobre os medicamentos que ela usa.', 'Card 3: Mantenham uma lista.',
    'Legenda: Cuidar tambem e organizar informacoes. Compartilhe.', 'Produção: Lista ficticia sem nomes. Revisão do farmacêutico. Não associar a desconto.', 'Medir: Compartilhamentos | Base: S1',
    `P02 / ${dm(addD(base2, 3))} / REEL / SEMANA 1`, '“Tema do reel de teste...”', 'Objetivo: Reconhecimento do papel do profissional. Por que testar: Escuta.',
    '0-3s: Cliente encenado: “Só me vê alguma coisa...”', '3-9s: Farmacêutico: “Antes, preciso entender.”', '9-17s: Mostrar o profissional ouvindo.', 'Legenda: Uma boa orientação começa por ouvir.', 'Produção: Cena identificada como simulação. Gravar com profissional real.', 'Medir: Conversas | Base: S7'],
  [...hdr(5, 'PRODUÇÃO E DISTRIBUIÇÃO'), 'Etapa Rotina recomendada', 'Preparar Gerência confirma ofertas.'],
])
const F1 = join(TMP, 'plano-formato1.pdf'), F2 = join(TMP, 'plano-formato2.pdf'), BAD = join(TMP, 'nao-e-pdf.pdf')
writeFileSync(F1, pdf1); writeFileSync(F2, pdf2); writeFileSync(BAD, 'isto nao e um pdf')

const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1500, height: 1000 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); p.on('dialog', (d) => d.accept()); return p }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }
const scope = async (p, name) => { await p.selectOption('select[aria-label="Filial"]', { label: name }); await p.waitForLoadState('networkidle'); await wait(300) }
const upload = async (p, file) => { await p.goto(BASE + '/planejamento/importar-plano'); await idle(p); await p.setInputFiles('#pi-file', file); await p.getByRole('button', { name: /Ler o PDF/ }).click() }
const toPreview = async (p) => { await p.waitForURL(/importar-plano\/[0-9a-f-]{36}$/, { timeout: 60000 }); await idle(p); return p.url().split('/').pop() }

try {
  const minas = (await q(`select id from brands where name = 'Minas Farma'`))[0].id
  const edId = (await q(`select id from users where username_normalized = 'e2e_ed'`))[0].id
  const a = await mk(); await login(a, 'teste_e2e'); await scope(a, 'Minas Farma')

  // ===== botões e permissões de tela =====
  await a.goto(BASE + '/planejamento/calendario'); await idle(a)
  ck('Calendário tem o botão "Importar plano (PDF)"', (await a.locator('a[data-import-plan]').count()) === 1)
  await a.goto(BASE + '/planejamento/conteudos'); await idle(a)
  ck('Conteúdos também tem o botão', (await a.getByRole('link', { name: /Importar plano \(PDF\)/ }).count()) >= 1)
  ck('o menu lateral tem "Importar plano (PDF)" e não tem mais "Gerar semana"', (await a.textContent('.side-nav')).includes('Importar plano (PDF)') && !(await a.textContent('.side-nav')).includes('Gerar semana'))
  const v = await mk(); await login(v, 'e2e_vw'); await scope(v, 'Minas Farma')
  await v.goto(BASE + '/planejamento/calendario'); await idle(v)
  ck('leitor não vê o botão no Calendário', (await v.locator('a[data-import-plan]').count()) === 0)
  await v.goto(BASE + '/planejamento/importar-plano'); await idle(v)
  ck('leitor vê a página só para leitura (sem envio)', (await v.locator('#pi-file').count()) === 0 && /somente leitura/.test(await v.textContent('main')))

  // ===== arquivo inválido =====
  await upload(a, BAD); await a.locator('.form-error').first().waitFor({ timeout: 20000 })
  ck('arquivo que não é PDF é recusado com mensagem clara', /não é um PDF/.test(await a.locator('.form-error').first().textContent()))

  // ===== FORMATO 1 =====
  await upload(a, F1); const id1 = await toPreview(a); const url1 = a.url()
  ck('formato 1: lê as 4 peças (Reel, Feed, Carrossel, Stories)', (await a.locator('table[data-table="previa"] tbody tr').count()) === 4)
  const sum1 = await a.locator('.pi-summary').textContent()
  ck('formato 1: resumo com período, 1 de cada formato e briefings 4 de 4', new RegExp(`${br(d1(0))} a ${br(d1(3))}`).test(sum1) && /1\s*Reels/.test(sum1) && /1\s*Carross/.test(sum1) && /4 de 4/.test(sum1), sum1.replace(/\s+/g, ' ').slice(0, 200))
  ck('formato 1: as 2 peças com data passada vêm desmarcadas e sinalizadas', /2 de 4 marcadas/.test(await a.locator('[data-selected-count]').textContent()) && (await a.locator('tr[data-past="sim"]').count()) === 2)
  ck('nada foi criado antes de confirmar', (await q(`select count(*)::int n from posts where plan_import_id = $1`, [id1]))[0].n === 0)
  await a.getByRole('button', { name: 'Marcar todas', exact: true }).click()
  await a.locator('select[name^="pillar_"]').first().selectOption('bastidores')
  await a.fill('#pi-camp', 'E2E Plano formato 1'); await a.selectOption('#pi-assigned', edId); await a.fill('#pi-lead', '4')
  await a.getByRole('button', { name: 'Importar 4 peças' }).click()
  await a.locator('[data-imported]').waitFor({ timeout: 60000 })
  const posts1 = await q(`select id, title, post_date::text d, post_time::text t, format, pillar, stage, caption, script, reels, plan_code, due_at::text due, pharma_review, assigned_to, campaign_id from posts where plan_import_id = $1`, [id1])
  const by1 = (c) => posts1.find((p) => p.plan_code === c)
  ck('formato 1: 4 pautas, todas em Briefing e sem revisão farmacêutica marcada', posts1.length === 4 && posts1.every((p) => p.stage === 'briefing' && p.pharma_review === false))
  ck('formato 1: Reel com pilar escolhido, prazo de 4 dias e responsável', by1('R01').format === 'reels' && by1('R01').pillar === 'bastidores' && by1('R01').due === addD(d1(0), -4) && by1('R01').assigned_to === edId && by1('R01').t === '19:00:00')
  ck('formato 1: roteiro do Reel (gancho, cenas) e legenda do feed', by1('R01').reels.hook === 'Gancho do reel.' && by1('R01').reels.scenes.length === 2 && /Fala do reel/.test(by1('R01').script) && /^Legenda de teste do feed/.test(by1('I01').caption))
  ck('formato 1: Stories vira Feed com prazo de 1 dia e frames no roteiro', by1('S01').format === 'feed' && by1('S01').due === addD(d1(3), -1) && /Frame 1: Bom dia/.test(by1('S01').script) && by1('S01').t === '08:00:00')
  ck('formato 1: todas ligadas à campanha criada (período certo)', (await q(`select count(*)::int n from campaigns c where c.id = $1 and c.name = 'E2E Plano formato 1' and c.starts_on = $2 and c.ends_on = $3`, [posts1[0].campaign_id, d1(0), d1(3)]))[0].n === 1)
  const nTask = (await q(`select count(*)::int n from post_checklist_items where post_id = any($1)`, [posts1.map((p) => p.id)]))[0].n
  ck('formato 1: tarefas, 1 comentário e 1 evento por pauta', nTask >= 12 && (await q(`select count(*)::int n from post_comments where post_id = any($1)`, [posts1.map((p) => p.id)]))[0].n === 4 && (await q(`select count(*)::int n from post_status_events where post_id = any($1) and from_stage is null`, [posts1.map((p) => p.id)]))[0].n === 4, nTask)
  await a.goto(BASE + `/planejamento/calendario?m=${today.slice(0, 7)}`); await idle(a)
  ck('calendário mostra as pautas importadas', (await a.getByText('C01 · Dicas de teste').count()) >= 1 || (await a.getByText('S01 ·').count()) >= 1)
  ck('o link "ver campanha" abre uma página que existe', await (async () => { await a.goto(url1); await idle(a); const h = await a.getByRole('link', { name: 'ver campanha' }).getAttribute('href'); return (await a.request.get(BASE + h)).status() === 200 })())

  // mesmo PDF de novo
  await upload(a, F1); await a.locator('.form-error').first().waitFor({ timeout: 60000 })
  ck('o mesmo PDF não entra duas vezes (mensagem + link para a importação anterior)', /já foi importado/.test(await a.locator('.form-error').first().textContent()) && (await a.getByRole('link', { name: 'Ver a importação anterior' }).count()) === 1)

  // desfazer respeitando trabalho andado
  await q(`update post_checklist_items set is_complete = true, completed_at = now() where id = (select id from post_checklist_items where post_id = $1 limit 1)`, [by1('I01').id])
  await q(`update posts set stage = 'producao', revision = revision + 1 where id = $1`, [by1('C01').id])
  await a.goto(BASE + '/planejamento/importar-plano'); await idle(a)
  await a.locator(`tr[data-import="${id1}"]`).getByRole('button', { name: 'Desfazer importação' }).click()
  await a.locator(`tr[data-import="${id1}"][data-status="desfeito"]`).waitFor({ timeout: 60000 })
  const left = (await q(`select plan_code from posts where origin = 'plano-pdf' order by 1`)).map((r) => r.plan_code)
  ck('desfazer removeu as 2 que não andaram e manteve I01 (tarefa feita) e C01 (mudou de etapa)', JSON.stringify(left) === JSON.stringify(['C01', 'I01']), JSON.stringify(left))
  ck('campanha mantida porque ainda há pautas', (await q(`select count(*)::int n from campaigns where name = 'E2E Plano formato 1'`))[0].n === 1)
  await upload(a, F1); await toPreview(a)
  ck('depois de desfazer o mesmo PDF é aceito; as 2 que ficaram vêm como "já existe"', (await a.locator('tr[data-code="I01"][data-duplicate="sim"]').count()) === 1 && (await a.locator('tr[data-code="C01"][data-duplicate="sim"]').count()) === 1)
  await a.getByRole('button', { name: 'Marcar todas', exact: true }).click(); await a.fill('#pi-camp', 'E2E Plano reimport')
  await a.getByRole('button', { name: /Importar 4 pe/ }).click(); await a.locator('[data-imported]').waitFor({ timeout: 60000 })
  const again = (await q(`select created_count, skipped_count from plan_imports where status = 'importado'`))[0]
  ck('reimportar ignora as que já existiam (2 criadas, 2 ignoradas) sem duplicar', again.created_count === 2 && again.skipped_count === 2 && (await q(`select count(*)::int n from posts where plan_code in ('I01','C01')`))[0].n === 2, JSON.stringify(again))

  // ===== FORMATO 2 =====
  await upload(a, F2); const id2 = await toPreview(a)
  ck('formato 2: lê as 5 peças (3 carrosséis e 2 Reels)', (await a.locator('table[data-table="previa"] tbody tr').count()) === 5 && /3\s*Carross/.test(await a.locator('.pi-summary').textContent()) && /2\s*Reels/.test(await a.locator('.pi-summary').textContent()))
  ck('formato 2: ano vindo do período e horário vindo da regra semanal são avisados', (await a.locator('[data-warning="ano_do_periodo"]').count()) === 1 && (await a.locator('[data-warning="horario_por_regra"]').count()) === 1)
  ck('formato 2: datas futuras, todas marcadas (5 de 5), e o objetivo do ciclo aparece', /5 de 5 marcadas/.test(await a.locator('[data-selected-count]').textContent()) && /Cuidado proximo que aparece em atitudes/.test(await a.textContent('main')))
  ck('formato 2: P03 sem briefing é sinalizada', (await a.locator('tr[data-code="P03"]').textContent()).includes('sem briefing'))
  await a.fill('#pi-camp', 'E2E Plano formato 2')
  await a.getByRole('button', { name: 'Importar 5 peças' }).click(); await a.locator('[data-imported]').waitFor({ timeout: 60000 })
  const posts2 = await q(`select title, post_date::text d, post_time::text t, format, stage, caption, script, reels, plan_code from posts where plan_import_id = $1`, [id2])
  const by2 = (c) => posts2.find((p) => p.plan_code === c)
  ck('formato 2: 5 pautas; horários 12:00 (Ter), 18:00 (Qui) e 10:00 (Sáb) vindos da regra', posts2.length === 5 && by2('P01').t === '12:00:00' && by2('P02').t === '18:00:00' && by2('P03').t === '10:00:00' && by2('P01').d === addD(base2, 1), JSON.stringify(posts2.map((p) => [p.plan_code, p.d, p.t])))
  ck('formato 2: carrossel com "Roteiro slide a slide" e legenda; sem briefing entra como Ideia', /^Roteiro slide a slide:\nCapa: Tema do primeiro carrossel\./.test(by2('P01').script) && /^Cuidar tambem e organizar/.test(by2('P01').caption) && by2('P03').stage === 'ideia' && by2('P01').stage === 'briefing')
  ck('formato 2: Reel com cenas por tempo (0-3s), roteiro e legenda', by2('P02').reels.scenes.length === 3 && by2('P02').reels.scenes[0].time === '0-3s' && /^0-3s: Cliente encenado/.test(by2('P02').script) && /^Uma boa orientação começa por ouvir/.test(by2('P02').caption))
  const t2 = await q(`select p.plan_code, array_agg(c.label) l from post_checklist_items c join posts p on p.id = c.post_id where p.plan_import_id = $1 group by 1`, [id2])
  ck('formato 2: "Produção" vira tarefas e o briefing que pede revisão do farmacêutico ganha a tarefa de revisão', t2.find((t) => t.plan_code === 'P01').l.includes('Revisão farmacêutica antes de aprovar') && t2.find((t) => t.plan_code === 'P02').l.includes('Produção: Gravar com profissional real.'))
  ck('formato 2: o título da seção seguinte não vira parte do último briefing', !JSON.stringify(by2('P02')).includes('Gerência'))

  // ===== permissões da API =====
  const resViewer = await v.evaluate(async () => { const fd = new FormData(); fd.append('file', new File(['%PDF-1.4'], 'x.pdf', { type: 'application/pdf' })); fd.append('brand_id', '00000000-0000-0000-0000-000000000000'); return (await fetch('/api/plano/analisar', { method: 'POST', body: fd })).status })
  ck('leitor chamando a API de leitura direto recebe 403', resViewer === 403, resViewer)
  const anon = await (await browser.newContext()).request.post(BASE + '/api/plano/analisar', { multipart: { file: { name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }, brand_id: minas } })
  ck('sem login a API recusa (401/403)', [401, 403].includes(anon.status()), anon.status())
  const e = await mk(); await login(e, 'e2e_ed'); await scope(e, 'Minas Farma'); await e.goto(BASE + '/planejamento/importar-plano'); await idle(e)
  ck('editor vê o formulário de envio', (await e.locator('#pi-file').count()) === 1)
} catch (err) { console.log('FAIL  execução sem exceção  ->', String(err).slice(0, 400)); R.push(false) }
finally { await browser.close(); await db.end(); console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`) }
