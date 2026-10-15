// @title: Importar o PDF REAL do cliente (Minas_Farma_Planejamento_60_Dias.pdf): só roda se o arquivo existir nesta máquina
// @needs: 
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const pg = createRequire(new URL('../../package.json', import.meta.url))('pg')
const BASE = process.env.BASE || 'http://localhost:3100'
const PDF = process.env.E2E_PDF_REAL || 'C:/Users/Admin/Downloads/Minas_Farma_Planejamento_60_Dias.pdf'
if (!existsSync(PDF)) { console.log('PULADO: PDF real não encontrado (defina E2E_PDF_REAL com o caminho do arquivo).'); console.log('\n0/0 verificações passaram'); process.exit(0) }
const DIR = process.env.E2E_OUT || '.'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 260) : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } })
await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const adminId = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id
const clean = async () => { await q(`delete from posts where origin = 'plano-pdf' and created_by = $1`, [adminId]); await q(`delete from plan_imports where created_by = $1`, [adminId]); await q(`delete from campaigns where name like 'E2E%'`) }
await clean()
const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const a = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
a.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); a.on('dialog', (d) => d.accept())
const idle = () => a.waitForLoadState('networkidle')
try {
  await a.goto(BASE + '/login'); await a.fill('#username', 'teste_e2e'); await a.fill('#password', 'Senha-Teste-1'); await a.click('button.primary'); await a.waitForURL(BASE + '/'); await idle()
  await a.selectOption('select[aria-label="Filial"]', { label: 'Minas Farma' }); await a.waitForLoadState('networkidle'); await wait(300)
  await a.goto(BASE + '/planejamento/importar-plano'); await idle()
  await a.setInputFiles('#pi-file', PDF)
  await a.getByRole('button', { name: /Ler o PDF/ }).click()
  await a.waitForURL(/importar-plano\/[0-9a-f-]{36}$/, { timeout: 90000 }); await idle()
  const importId = a.url().split('/').pop()
  const summary = await a.locator('.pi-summary').textContent()
  ck('lê 26 peças: 17 carrosséis e 9 Reels, período 20/10 a 17/12/2026', (await a.locator('table[data-table="previa"] tbody tr').count()) === 26 && /20\/10\/2026 a 17\/12\/2026/.test(summary) && /17\s*Carross/.test(summary) && /9\s*Reels/.test(summary), summary.replace(/\s+/g, ' ').slice(0, 200))
  ck('briefings: 26 de 26', /26 de 26/.test(summary))
  ck('todas as datas são futuras: vêm marcadas (26 de 26)', /26 de 26 marcadas/.test(await a.locator('[data-selected-count]').textContent()))
  ck('nenhum aviso de erro; informa que o ano veio do período e que os horários vieram da regra semanal', (await a.locator('[data-warning]').filter({ hasText: 'Erro' }).count()) === 0 && (await a.locator('[data-warning="ano_do_periodo"]').count()) === 1 && (await a.locator('[data-warning="horario_por_regra"]').count()) === 1)
  ck('objetivo do ciclo (Direção central) aparece na prévia', /Cuidado próximo que aparece em atitudes/.test(await a.textContent('main')))
  const m01 = await a.locator('tr[data-code="M01"]').textContent()
  ck('linha M01: 20/10, Carrossel, tema e horário 12h', /20\/10/.test(m01) && /Carrossel/.test(m01) && /Você sabe tudo que sua mãe toma\?/.test(m01) && /12h/.test(m01), m01.replace(/\s+/g, ' ').slice(0, 160))
  await a.screenshot({ path: `${DIR}/f12-previa.png`, fullPage: true })

  await a.fill('#pi-camp', 'E2E Plano Minas 60 dias')
  await a.getByRole('button', { name: 'Importar 26 peças' }).click()
  await a.locator('[data-imported]').waitFor({ timeout: 90000 })
  ck('importou 26 pautas', /26 pautas criadas/.test(await a.textContent('[data-imported]')))

  const posts = await q(`select title, post_date::text d, post_time::text t, format, pillar, stage, caption, script, reels, plan_code, due_at::text due, pharma_review from posts where plan_import_id = $1 order by post_date`, [importId])
  ck('26 pautas no banco: 17 carrossel e 9 reels', posts.length === 26 && posts.filter((p) => p.format === 'carrossel').length === 17 && posts.filter((p) => p.format === 'reels').length === 9)
  const m1 = posts.find((p) => p.plan_code === 'M01'), m2 = posts.find((p) => p.plan_code === 'M02')
  ck('M01: carrossel 20/10 12:00 com slides no roteiro e legenda', m1.d === '2026-10-20' && m1.t === '12:00:00' && /^Roteiro slide a slide:\nCapa: Você sabe tudo que sua mãe toma\?\nCard 2:/.test(m1.script) && /^Cuidar também é organizar informações/.test(m1.caption), `${m1.d} ${m1.t}`)
  ck('M02: Reel 22/10 18:00 com 5 cenas por tempo, roteiro e legenda', m2.d === '2026-10-22' && m2.t === '18:00:00' && m2.format === 'reels' && m2.reels.scenes.length === 5 && m2.reels.scenes[0].time === '0-3s' && /^0-3s: Cliente encenado/.test(m2.script) && /^Uma boa orientação começa por ouvir/.test(m2.caption))
  ck('todos em Briefing, sem revisão farmacêutica marcada', posts.every((p) => p.stage === 'briefing' && p.pharma_review === false))
  ck('26 horários preenchidos (regra semanal): Ter 12h, Qui 18h, Sáb 10h', posts.every((p) => p.t !== null) && new Set(posts.map((p) => p.t)).size === 3, [...new Set(posts.map((p) => p.t))].join(','))
  const tasks = await q(`select p.plan_code, count(*)::int n, bool_or(c.label = 'Revisão farmacêutica antes de aprovar') pharm from post_checklist_items c join posts p on p.id = c.post_id where p.plan_import_id = $1 group by 1`, [importId])
  ck('tarefas em todas as pautas (cenas a gravar, produção, revisão)', tasks.length === 26 && tasks.every((t) => t.n >= 3), JSON.stringify(tasks.slice(0, 3)))
  ck('briefings que pedem revisão do farmacêutico ganham a tarefa', tasks.find((t) => t.plan_code === 'M01').pharm === true && tasks.find((t) => t.plan_code === 'M14').pharm === true)
  const com = (await q(`select body from post_comments c join posts p on p.id = c.post_id where p.plan_import_id = $1 and p.plan_code = 'M04'`, [importId]))[0].body
  ck('comentário do briefing traz Objetivo, Por que testar, Produção e Medir', /Objetivo: Cadastros qualificados/.test(com) && /Por que testar:/.test(com) && /Produção: Validar regras atuais/.test(com) && /Medir: Acessos identificados ao Club/.test(com))

  await a.goto(BASE + '/planejamento/calendario?m=2026-10'); await idle()
  ck('calendário de outubro mostra M01 (20/10) e M02 (22/10)', (await a.getByText('M01 · Você sabe tudo que sua mãe toma?').count()) >= 1 && (await a.getByText('M02 ·').count()) >= 1)
  await a.goto(BASE + '/planejamento/calendario?m=2026-12'); await idle()
  ck('calendário de dezembro mostra M26 (17/12)', (await a.getByText('M26 ·').count()) >= 1)

  // desfazer tudo (nada andou)
  await a.goto(BASE + '/planejamento/importar-plano'); await idle()
  await a.locator(`tr[data-import="${importId}"]`).getByRole('button', { name: 'Desfazer importação' }).click()
  await a.locator(`tr[data-import="${importId}"][data-status="desfeito"]`).waitFor({ timeout: 60000 })
  ck('desfazer remove as 26 pautas e a campanha', (await q(`select count(*)::int n from posts where origin = 'plano-pdf' and created_by = $1`, [adminId]))[0].n === 0 && (await q(`select count(*)::int n from campaigns where name = 'E2E Plano Minas 60 dias'`))[0].n === 0)
} catch (e) { console.log('FAIL  execução sem exceção  ->', String(e).slice(0, 400)); R.push(false) }
finally { await clean(); await browser.close(); await db.end(); console.log(`${R.filter(Boolean).length}/${R.length} verificações passaram`) }
