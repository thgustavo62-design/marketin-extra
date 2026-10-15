// @title: Fontes abertas (feriados, IPCA, CMED), preço máximo, datas e RDC 96
// @needs: net
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
const pg = createRequire(new URL('../../package.json', import.meta.url))('pg')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 260) : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /@(127.0.0.1|localhost)[:/]/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } })
await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const day = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); p.on('dialog', (d) => d.accept()); return { c, p } }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }
const scope = async (p, name) => { await p.selectOption('select[aria-label="Filial"]', { label: name }); await p.waitForLoadState('networkidle'); await wait(300) }
const card = (p, k) => p.locator(`article[data-source-card="${k}"]`)
const btn = (loc, name) => loc.getByRole('button', { name, exact: true })
const textOf = (loc, re) => loc.waitFor({ timeout: 150000 }).then(() => loc.textContent())

const original = await q(`select id, name, icms_pct::float8 as icms from brands`)
const minas = original.find((b) => b.name === 'Minas Farma'), farma = original.find((b) => b.name === 'Farma e Farma')

try {
  const admin = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id
  await q(`update brands set icms_pct = null`)

  // =============== ADMIN: fontes ===============
  const { p: a } = await mk()
  await login(a, 'teste_e2e'); await scope(a, 'Minas Farma')
  await a.goto(BASE + '/inteligencia?aba=mercado'); await idle(a)
  const tabs = await a.locator('nav.tabs[aria-label="Seções"]').textContent()
  ck('abas novas: Mercado e pesquisas e Preço máximo (CMED)', tabs.includes('Mercado e pesquisas') && tabs.includes('Preço máximo (CMED)'))
  ck('as três fontes aparecem com licença e link', (await a.locator('article[data-source-card]').count()) === 3 && /Sem chave/.test(await card(a, 'cmed').textContent()))
  ck('pesquisas iniciais registradas, com fonte e data de acesso', (await a.locator('article[data-note]').count()) >= 9 && /RDC 96\/2008, art\. 8º/.test(await a.textContent('main')) && /acessado em 11\/10\/2026/.test(await a.textContent('main')))
  ck('clima ficou de fora por termo de uso (nota explica)', (await a.locator('article[data-note*="clima"]').count()) === 1 && /não comercial|uso comercial/i.test(await a.locator('article[data-note*="clima"]').textContent()))

  // feriados (BrasilAPI real)
  await q(`update external_sources set last_run_at = null`)
  await btn(card(a, 'feriados'), 'Atualizar agora').click()
  await card(a, 'feriados').locator('.form-ok').waitFor({ timeout: 60000 })
  const hol = (await q(`select count(*)::int n, bool_or(name ilike 'Natal%') natal from external_holidays`))[0]
  ck('feriados importados da BrasilAPI (do ano atual e do próximo)', hol.n >= 18 && hol.natal === true, JSON.stringify(hol))
  await btn(card(a, 'feriados'), 'Atualizar agora').click()
  await card(a, 'feriados').locator('.form-error').waitFor({ timeout: 20000 })
  ck('segunda atualização seguida é barrada (limite de uso da fonte)', /menos de 10 minutos/.test(await card(a, 'feriados').locator('.form-error').textContent()))

  // IPCA (IBGE real)
  await btn(card(a, 'ipca'), 'Atualizar agora').click()
  await card(a, 'ipca').locator('.form-ok').waitFor({ timeout: 90000 })
  const ip = (await q(`select count(*)::int n, count(distinct category)::int c, count(*) filter (where accumulated_12m_pct is not null)::int acc from external_ipca`))[0]
  ck('IPCA importado (3 categorias, mensal e 12 meses)', ip.n >= 50 && ip.c === 3 && ip.acc >= 30, JSON.stringify(ip))
  await a.reload(); await idle(a)
  const ipt = await a.locator('table[data-table="ipca"]').textContent()
  ck('tabela de IPCA mostra os três recortes com percentuais', /Produtos farmacêuticos e óticos/.test(ipt) && /Saúde e cuidados pessoais/.test(ipt) && /\d,\d{2}%/.test(ipt))

  // CMED (Anvisa real, ~12 MB)
  const t0 = Date.now()
  await q(`update external_sources set last_run_at = null where key = 'cmed'`)
  await btn(card(a, 'cmed'), 'Atualizar lista de preços').click()
  const cmedMsg = await textOf(card(a, 'cmed').locator('.form-ok, .form-error').first())
  const cm = (await q(`select count(*)::int n, count(*) filter (where cardinality(eans) > 0)::int com_ean, count(*) filter (where pmc ? '17')::int com_pmc17, max(published_on)::text pub from cmed_products`))[0]
  ck('lista da CMED importada (milhares de apresentações, com EAN e PMC por alíquota)', /apresentações importadas|já está na versão mais recente/.test(cmedMsg) && cm.n > 20000 && cm.com_ean > 20000 && cm.com_pmc17 > 15000, `${cmedMsg} | ${JSON.stringify(cm)} | ${Math.round((Date.now() - t0) / 1000)}s`)
  await q(`update external_sources set last_run_at = now() - interval '1 hour' where key = 'cmed'`)
  await a.reload(); await idle(a)
  await btn(card(a, 'cmed'), 'Atualizar lista de preços').click()
  await card(a, 'cmed').locator('.form-ok').waitFor({ timeout: 90000 })
  ck('nova checagem com a mesma versão não baixa de novo ("já está na versão mais recente")', /já está na versão mais recente/.test(await card(a, 'cmed').locator('.form-ok').textContent()))
  ck('importações ficam registradas (ok e pulada)', (await q(`select count(*)::int n from external_imports where source = 'cmed' and status in ('ok','skipped')`))[0].n >= 2)

  // =============== PREÇO MÁXIMO ===============
  const prod = (await q(`select eans[1] as ean, product, presentation, (pmc->>'17')::float8 as pmc17 from cmed_products where price_regime = 'Regulado' and pmc ? '17' and cardinality(eans) > 0 and (pmc->>'17')::float8 between 8 and 80 order by ggrem limit 1 offset 40`))[0]
  const libre = (await q(`select eans[1] as ean from cmed_products where price_regime = 'Liberado' and not (pmc ? '17') and cardinality(eans) > 0 limit 1`))[0]
  const url = (extra) => `${BASE}/inteligencia?aba=precos&${extra}`
  await a.goto(url(`q=${prod.ean}&preco=${String(prod.pmc17 + 1.5).replace('.', ',')}`)); await idle(a)
  ck('sem ICMS cadastrado, o sistema NÃO afirma "acima do teto"', (await a.locator('[data-verdict="sem_icms"]').count()) >= 1 && (await a.locator('[data-verdict="acima"]').count()) === 0 && /Cadastre a alíquota/.test(await a.locator('table[data-table="cmed"]').textContent()))
  const row = a.locator('.icms-row[data-brand="Minas Farma"]')
  await row.locator('select').selectOption('17'); await row.getByRole('button', { name: 'Salvar' }).click(); await row.locator('.form-ok').waitFor({ timeout: 15000 })
  ck('ICMS da filial salvo (só administrador)', (await q(`select icms_pct::float8 i from brands where id = $1`, [minas.id]))[0].i === 17)
  await a.goto(url(`q=${prod.ean}&preco=${String(prod.pmc17 + 1.5).replace('.', ',')}`)); await idle(a)
  const tr = a.locator(`table[data-table="cmed"] tr`).filter({ hasText: prod.product }).first()
  ck('consulta por EAN acha o produto e mostra o PMC da alíquota (igual ao do banco)', (await tr.textContent()).replace(/\u00a0/g, ' ').includes(brl(prod.pmc17).replace(/\u00a0/g, ' ')), prod.pmc17)
  ck('preço acima do PMC → "Acima do teto", com valores e aviso de infração', (await a.locator('[data-verdict="acima"]').count()) >= 1 && /ACIMA do teto/.test(await a.locator('[data-verdict="acima"]').first().textContent()) && /infração/.test(await a.locator('[data-verdict="acima"]').first().textContent()))
  await a.goto(url(`q=${prod.ean}&preco=${String(prod.pmc17).replace('.', ',')}`)); await idle(a)
  ck('preço exatamente igual ao PMC → "Dentro do teto"', (await a.locator('[data-verdict="dentro"]').count()) >= 1 && (await a.locator('[data-verdict="acima"]').count()) === 0)
  if (libre) {
    await a.goto(url(`q=${libre.ean}&preco=999,99`)); await idle(a)
    ck('item de preço liberado (sem PMC): não afirma teto', (await a.locator('[data-verdict="sem_teto"]').count()) >= 1)
  }
  await a.goto(url(`q=acebrofilina`)); await idle(a)
  ck('busca por nome retorna várias apresentações', (await a.locator('table[data-table="cmed"] tr[data-ggrem]').count()) >= 5)
  await a.goto(url(`q=7890000000017&preco=10`)); await idle(a)
  ck('EAN que não está na lista: "Nada encontrado" (sem inventar)', /Nada encontrado/.test(await a.textContent('main')))
  await a.goto(url(`q=${prod.ean}&preco=abc`)); await idle(a)
  ck('preço digitado inválido é recusado', /Preço inválido/.test(await a.textContent('main')))

  // (a conferência de oferta por pedido saiu junto com a tela de Solicitações; a conferência de preço fica na aba Preço máximo, testada acima)

  await a.goto(url(`q=${prod.ean}&preco=10`)); await idle(a)
  const ys = await a.locator('.filters input[name="q"], .filters input[name="preco"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  ck('visual: campos de busca e de preço na mesma linha', ys.length === 2 && Math.abs(ys[0] - ys[1]) <= 2, JSON.stringify(ys))

  // =============== DATAS IMPORTANTES × PLANEJAMENTO ===============
  await a.goto(BASE + '/inteligencia?aba=mercado'); await idle(a)
  const unc = a.locator('table[data-table="datas"] tr[data-covered="nao"]').first()
  ck('há datas importantes nos próximos 90 dias, e as sem conteúdo oferecem "Criar conteúdo"', (await a.locator('table[data-table="datas"] tr').count()) >= 3 && (await unc.locator('a.btn[href*="data="]').count()) === 1)
  const gaps = await a.locator('table[data-table="datas"] tr[data-covered="nao"]').evaluateAll((trs) => trs.map((tr) => ({ name: tr.querySelector('td:nth-child(2) b').textContent, inDays: tr.querySelector('td:nth-child(4)').textContent.trim(), href: tr.querySelector('a.btn').getAttribute('href') })))
  const within = (g, n) => g.inDays === 'agora' || parseInt(g.inDays) <= n
  const near = gaps.find((g) => within(g, 30))
  const near21 = gaps.find((g) => within(g, 21))
  const target = near21 ?? near ?? gaps[0]
  const targetDate = target.href.split('data=')[1]

  // ANTES de planejar: o achado e o alerta existem (quando há data descoberta no horizonte)
  await a.goto(BASE + '/inteligencia'); await idle(a)
  const before = await a.locator('article[data-finding="datas_sem_conteudo"]').textContent().catch(() => '')
  ck(near ? 'achado "Datas importantes sem conteúdo" existe quando há data sem conteúdo em até 30 dias' : 'sem data descoberta em 30 dias: o achado não aparece', near ? /sem nenhum conteúdo planejado/.test(before) && before.includes(near.name) : before === '', before.slice(0, 180))
  const ipcaFinding = await a.locator('article[data-finding="contexto_ipca"]').textContent()
  ck('achado de contexto de preços usa o IPCA importado (com a ressalva de que não é o preço da loja)', /acumulam \d,\d{2}% em 12 meses/.test(ipcaFinding) && /não o preço da sua loja/.test(ipcaFinding), ipcaFinding.slice(0, 220))
  const reeval = async () => {
    await a.goto(BASE + '/alertas'); await idle(a)
    await Promise.all([a.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/alertas'), { timeout: 60000 }), a.getByRole('button', { name: 'Reavaliar agora' }).click()])
    await wait(800); await a.reload(); await idle(a)
  }
  await reeval()
  const alertsBefore = await a.locator('.alert-list li[data-type="date_uncovered"]').allTextContents()
  ck(near21 ? 'alerta "Sem conteúdo para <data>" para data próxima sem conteúdo' : 'sem data descoberta em 21 dias: nenhum alerta de data', near21 ? alertsBefore.some((t) => t.includes(near21.name)) : alertsBefore.length === 0, JSON.stringify(alertsBefore).slice(0, 200))

  // planeja um conteúdo na data descoberta
  await q(`insert into posts (brand_id, title, post_date, format, pillar, stage, created_by) values ($1,'E2E Conteúdo da data',$2,'feed','institucional','ideia',$3)`, [minas.id, targetDate, admin])
  await a.goto(BASE + '/inteligencia?aba=mercado'); await idle(a)
  const flipped = await a.locator('table[data-table="datas"] tr', { hasText: target.name }).first().getAttribute('data-covered')
  ck(`planejar um conteúdo na data (${target.name}) a marca como coberta`, flipped === 'sim', flipped)

  // DEPOIS: o alerta dessa data resolve sozinho e o achado deixa de citá-la
  await reeval()
  ck('o alerta da data coberta é resolvido sozinho (sai de "Ativos")', (await a.locator('.alert-list li[data-type="date_uncovered"]', { hasText: target.name }).count()) === 0)
  await a.goto(BASE + '/inteligencia'); await idle(a)
  const after = await a.locator('article[data-finding="datas_sem_conteudo"]').textContent().catch(() => '')
  const statementAfter = after.split('Evidência')[0]
  ck('o achado deixa de citar a data que passou a ter conteúdo', !statementAfter.includes(target.name), statementAfter.slice(0, 200))

  // =============== RDC 96/2008 ===============
  const mkPost = async (title, caption, pillar) => (await q(`insert into posts (brand_id, title, post_date, format, pillar, stage, caption, created_by) values ($1,$2,$3,'feed',$4,'producao',$5,$6) returning id`, [minas.id, title, day(5), pillar, caption, admin]))[0].id
  const bad = await mkPost('E2E Peça ruim', 'Tome Dipirona 500 mg, saboroso e cientificamente comprovado. Ganhe pontos na compra! 20% de desconto.', 'medicamentos')
  const clean = await mkPost('E2E Peça limpa', 'Dipirona 500 mg de R$ 12,90 por R$ 9,90. Se persistirem os sintomas, o médico deverá ser consultado.', 'medicamentos')
  const none = await mkPost('E2E Peça institucional', 'Venha conhecer nossa loja renovada neste sábado.', 'institucional')
  await a.goto(`${BASE}/planejamento/conteudos/${bad}`); await idle(a)
  const panelBad = a.locator('section[data-ad-check]')
  const bt = await panelBad.textContent()
  ck('RDC 96: peça com vários problemas fica "vedado", com artigo e trecho', (await panelBad.getAttribute('data-ad-check')) === 'vedado' && ['art. 8º, VII', 'art. 8º, VI', 'art. 26, I', 'art. 10'].every((x) => bt.includes(x)) && /Tome Dipirona/.test(bt), bt.slice(0, 200))
  ck('RDC 96: desconto sem preço integral pede revisão (art. 11 § 4º)', /art\. 11, § 4º/.test(bt))
  await a.goto(`${BASE}/planejamento/conteudos/${clean}`); await idle(a)
  ck('RDC 96: peça correta (com preço integral e advertência) não tem pontos vedados', ['ok', 'revisar'].includes(await a.locator('section[data-ad-check]').getAttribute('data-ad-check')) && (await a.locator('section[data-ad-check] li[data-level="vedado"]').count()) === 0)
  await a.goto(`${BASE}/planejamento/conteudos/${none}`); await idle(a)
  ck('RDC 96: texto institucional sem medicamento não é avaliado como propaganda de medicamento', (await a.locator('section[data-ad-check]').getAttribute('data-ad-check')) === 'na')
  await a.goto(`${BASE}/producao?abrir=${bad}`); await a.waitForSelector('dialog.drawer[open] h4', { timeout: 30000 }); await wait(500)
  const drw = a.locator('dialog.drawer[open] .ad-summary')
  ck('o cartão resume a conferência para o revisor, com link para o editor', (await drw.getAttribute('data-ad')) === 'vedado' && /vedado\(s\)/.test(await drw.textContent()))

  // =============== NOTAS ===============
  await a.goto(BASE + '/inteligencia?aba=mercado'); await idle(a)
  if (!(await a.locator('.new-request[open]').count())) await a.click('.new-request summary')
  await a.fill('#nt-title', 'E2E Nota de teste'); await a.fill('#nt-sum', 'Resumo de teste com mais de dez caracteres.'); await a.fill('#nt-src', 'Fonte de teste'); await a.fill('#nt-url', 'http://sem-https.com')
  await a.click('.new-request button.primary')
  await a.waitForFunction(() => /https/.test(document.querySelector('.new-request .form-error')?.textContent ?? ''), null, { timeout: 15000 })
  ck('nota sem fonte https é recusada', true)
  await a.fill('#nt-url', 'https://exemplo.gov.br/pagina'); await a.click('.new-request button.primary')
  await a.locator('.new-request .form-ok').waitFor({ timeout: 15000 })
  await a.reload(); await idle(a)
  ck('nota registrada com fonte, data e confiança', (await a.locator('article[data-note="E2E Nota de teste"]').count()) === 1)
  await btn(a.locator('article[data-note="E2E Nota de teste"]'), 'Arquivar').click()
  await a.locator('article[data-note="E2E Nota de teste"].muted-card').waitFor({ timeout: 15000 })
  ck('nota arquivada fica visível só para quem edita', true)

  // =============== PERMISSÕES ===============
  const { p: v } = await mk(); await login(v, 'e2e_vw'); await scope(v, 'Minas Farma')
  await v.goto(BASE + '/inteligencia?aba=mercado'); await idle(v)
  ck('leitor vê fontes, datas e pesquisas, sem botões de atualizar nem formulário de nota', (await v.locator('article[data-source-card]').count()) === 3 && (await v.getByRole('button', { name: /Atualizar/ }).count()) === 0 && (await v.locator('.new-request').count()) === 0 && (await v.locator('article[data-note="E2E Nota de teste"]').count()) === 0)
  await v.goto(url(`q=${prod.ean}`)); await idle(v)
  ck('leitor consulta o preço, mas a alíquota fica travada', (await v.locator('.icms-row select').first().isDisabled()) && (await v.locator('.icms-row button').count()) === 0)
  await v.goto(BASE + '/inteligencia'); await idle(v)
  ck('leitor vê a ação sugerida de cada achado (link), embora não possa decidir', (await v.locator('article.finding .finding-actions a.btn').first().isVisible()) && (await v.getByRole('button', { name: /Vou aplicar|Dispensar/ }).count()) === 0)
  const { p: e } = await mk(); await login(e, 'e2e_ed'); await scope(e, 'Minas Farma')
  await e.goto(url(`q=${prod.ean}`)); await idle(e)
  ck('editor também não altera a alíquota (só administrador)', await e.locator('.icms-row select').first().isDisabled())
  await e.goto(BASE + '/inteligencia?aba=mercado'); await idle(e)
  ck('editor pode atualizar as fontes', (await e.getByRole('button', { name: 'Atualizar agora' }).count()) >= 2)
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  for (const b of original) await q(`update brands set icms_pct = $2 where id = $1`, [b.id, b.icms]).catch(() => {})
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
