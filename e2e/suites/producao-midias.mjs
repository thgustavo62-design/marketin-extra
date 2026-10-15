// @title: Biblioteca de mídias, aprovações e política de aprovação
// @needs: 
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
const pg = createRequire(new URL('../../package.json', import.meta.url))('pg')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x ? '  -> ' + String(x).slice(0, 220) : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /@(127.0.0.1|localhost)[:/]/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } })
await db.connect()

const PNG_BASE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const png = (tag) => Buffer.concat([PNG_BASE, Buffer.from('E2E-' + tag)])

const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1500, height: 1000 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); p.on('dialog', (d) => d.accept()); return { c, p } }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }
const scope = async (p, name) => { await p.selectOption('select[aria-label="Filial"]', { label: name }); await p.waitForLoadState('networkidle'); await wait(300) }
const col = (p, name) => p.locator(`section[aria-label="${name}"]`)
const card = (p, title) => p.locator('.kcard', { hasText: title })
const D = (p) => p.locator('dialog.drawer[open]')
const openCard = async (p, title) => { await card(p, title).locator('.kcard-main').click(); await p.waitForSelector('dialog.drawer[open] h4'); await wait(400) }
const addCard = async (p, stage, title) => {
  await col(p, stage).locator('.kadd-btn').click()
  await p.fill('input[aria-label="Título do novo cartão"]', title)
  await p.click('.kadd button.primary'); await card(p, title).waitFor({ timeout: 20000 })
}
const stageOf = (p) => D(p).locator('select[aria-label="Etapa"]').inputValue()
const futureDate = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)

try {
  const minas = (await db.query(`select id from brands where name = 'Minas Farma'`)).rows[0].id
  const farma = (await db.query(`select id from brands where name = 'Farma e Farma'`)).rows[0].id

  // =============== ADMIN ===============
  const { p: a } = await mk()
  await login(a, 'teste_e2e')
  await scope(a, 'Minas Farma')

  await a.goto(BASE + '/producao'); await idle(a)
  const menu = await a.textContent('.side-nav')
  ck('menu: Aprovações e Biblioteca em Produção (sem Solicitações)', ['Aprovações', 'Biblioteca de mídias'].every((t) => menu.includes(t)) && !menu.includes('Solicitações'))

  // ---------- biblioteca ----------
  await a.goto(BASE + '/producao/biblioteca'); await idle(a)
  await a.fill('#up-title', 'E2E Arte')
  await a.setInputFiles('#up-file', { name: 'arte.png', mimeType: 'image/png', buffer: png('v1') })
  await a.click('.upload-panel button.primary')
  await a.locator('.upload-panel .form-ok').waitFor({ timeout: 20000 })
  await a.locator('.asset-card', { hasText: 'E2E Arte' }).waitFor({ timeout: 20000 })
  ck('upload de PNG entra na biblioteca', true)

  await a.fill('#up-title', 'E2E Arte duplicada')
  await a.setInputFiles('#up-file', { name: 'arte-copia.png', mimeType: 'image/png', buffer: png('v1') })
  await a.click('.upload-panel button.primary')
  await a.locator('.upload-panel .form-error').waitFor({ timeout: 20000 })
  ck('arquivo idêntico é recusado (duplicado)', /já|mesmo|duplic/i.test(await a.locator('.upload-panel .form-error').textContent()), await a.locator('.upload-panel .form-error').textContent())

  await a.setInputFiles('#up-file', { name: 'falso.png', mimeType: 'image/png', buffer: Buffer.from('isto é só texto, não uma imagem') })
  await a.click('.upload-panel button.primary')
  await a.waitForFunction(() => /tipo|permitid|aceit|não é/i.test(document.querySelector('.upload-panel .form-error')?.textContent ?? '') && !/já|mesmo|duplic/i.test(document.querySelector('.upload-panel .form-error')?.textContent ?? ''), null, { timeout: 20000 })
  ck('arquivo falso com extensão .png é recusado pelo conteúdo', true, await a.locator('.upload-panel .form-error').textContent())

  await a.setInputFiles('#up-file', { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.concat([PNG_BASE, Buffer.alloc(4.5 * 1024 * 1024)]) })
  await a.click('.upload-panel button.primary')
  await a.waitForFunction(() => /4 MB/.test(document.querySelector('.upload-panel .form-error')?.textContent ?? ''), null, { timeout: 15000 })
  ck('arquivo acima de 4 MB é recusado com orientação para usar link', true)

  await a.click('.upload-panel .tab >> text=Link')
  await a.fill('#up-title', 'E2E Vídeo link'); await a.fill('#up-url', 'javascript:alert(1)')
  await a.click('.upload-panel button.primary')
  await a.locator('.upload-panel .form-error').waitFor({ timeout: 15000 })
  ck('link com javascript: é recusado', /https|endereço|inválid/i.test(await a.locator('.upload-panel .form-error').textContent()), await a.locator('.upload-panel .form-error').textContent())
  await a.fill('#up-url', 'https://example.com/video-final')
  await a.click('.upload-panel button.primary')
  await a.locator('.asset-card', { hasText: 'E2E Vídeo link' }).waitFor({ timeout: 20000 })
  ck('link https externo entra na biblioteca', true)

  await a.locator('.asset-card', { hasText: 'E2E Arte' }).first().locator('.asset-main').click()
  await a.waitForSelector('dialog.drawer[open] .versions li')
  await a.setInputFiles('dialog.drawer[open] input[aria-label="Arquivo da nova versão"]', { name: 'arte-v2.png', mimeType: 'image/png', buffer: png('v2') })
  await a.click('dialog.drawer[open] button:has-text("Enviar nova versão")')
  await a.waitForFunction(() => document.querySelectorAll('dialog.drawer[open] .versions li').length === 2, null, { timeout: 20000 })
  ck('nova versão: peça passa a ter v1 e v2', true)
  await a.fill('#asset-tags', 'ofertas, E2E'); await a.click('dialog.drawer[open] button:has-text("Salvar etiquetas")')
  await a.locator('dialog.drawer[open] .form-ok').waitFor({ timeout: 15000 })
  ck('etiquetas salvas', true)
  await a.locator('dialog.drawer[open] button[aria-label="Fechar"]').click()

  // ---------- aprovação: fluxo completo ----------
  await a.goto(BASE + '/producao'); await idle(a)
  await addCard(a, 'Briefing', 'E2E Aprov A')
  await openCard(a, 'E2E Aprov A')
  await D(a).locator('button:has-text("Anexar da biblioteca")').click()
  await D(a).locator('.picker li', { hasText: 'E2E Arte' }).first().locator('button').click()
  await D(a).locator('.files li', { hasText: 'E2E Arte' }).waitFor({ timeout: 15000 })
  ck('cartão: arquivo anexado da biblioteca', true)

  await D(a).locator('select[aria-label="Etapa"]').selectOption('aprovado')
  await D(a).locator('.form-error').waitFor({ timeout: 15000 })
  ck('pular a aprovação é recusado', /Aguardando aprovação/.test(await D(a).locator('.form-error').first().textContent()), await D(a).locator('.form-error').first().textContent())

  await D(a).locator('button:has-text("Enviar para aprovação")').click()
  await D(a).locator('text=Aguardando decisão').waitFor({ timeout: 15000 })
  ck('enviado para aprovação: etapa muda e fica pendente', (await stageOf(a)) === 'aprovacao')

  await D(a).locator('button:has-text("Anexar da biblioteca")').click()
  await D(a).locator('.picker li', { hasText: 'E2E Vídeo link' }).first().locator('button').click()
  await D(a).locator('text=invalidado').first().waitFor({ timeout: 15000 })
  ck('anexo novo depois do envio invalida a aprovação e volta para revisão', (await stageOf(a)) === 'revisao')

  await D(a).locator('button:has-text("Enviar para aprovação")').click()
  await D(a).locator('text=Aguardando decisão').waitFor({ timeout: 15000 })
  await D(a).locator('button:has-text("Reprovar")').click()
  await D(a).locator('.form-error').waitFor({ timeout: 15000 })
  ck('reprovar sem motivo é recusado', /motivo/i.test(await D(a).locator('.form-error').first().textContent()))
  await D(a).locator('textarea[aria-label="Motivo da decisão"]').fill('Falta o logo da loja')
  await D(a).locator('button:has-text("Reprovar")').click()
  await D(a).locator('text=Reprovado por').first().waitFor({ timeout: 15000 })
  ck('reprovado com motivo: volta para Em produção', (await stageOf(a)) === 'producao')

  await D(a).locator('button:has-text("Enviar para aprovação")').click()
  await D(a).locator('text=Aguardando decisão').waitFor({ timeout: 15000 })
  await D(a).locator('button:has-text("Aprovar")').click()
  await D(a).locator('text=Aprovado por').first().waitFor({ timeout: 15000 })
  ck('aprovado: etapa Aprovado e aprovação válida', (await stageOf(a)) === 'aprovado' && /Vale para o conteúdo/.test(await D(a).textContent()))
  ck('histórico de aprovação registra envios e decisões', (await D(a).locator('.events li').allTextContents()).join(' ').includes('Aprovado'))

  await D(a).locator('.files li', { hasText: 'E2E Vídeo link' }).locator('button[aria-label^="Desvincular"]').click()
  await D(a).locator('.files li', { hasText: 'E2E Vídeo link' }).waitFor({ state: 'detached', timeout: 15000 })
  await wait(800)
  ck('desvincular anexo depois de aprovado invalida e volta para revisão', (await stageOf(a)) === 'revisao')
  await D(a).locator('select[aria-label="Etapa"]').selectOption('agendado')
  await D(a).locator('.form-error').waitFor({ timeout: 15000 })
  ck('não agenda sem aprovação válida', /aprova/i.test(await D(a).locator('.form-error').first().textContent()), await D(a).locator('.form-error').first().textContent())
  await D(a).locator('button[aria-label="Fechar"]').click()

  // ---------- fila de aprovações ----------
  await a.reload(); await idle(a)
  await addCard(a, 'Briefing', 'E2E Aprov B')
  await card(a, 'E2E Aprov B').locator('select.kmove').selectOption('aprovacao')
  await col(a, 'Aguardando aprovação').locator('.kcard', { hasText: 'E2E Aprov B' }).waitFor({ timeout: 15000 })
  await wait(3000)
  await a.goto(BASE + '/producao/aprovacoes'); await idle(a)
  const row = a.locator('tr', { hasText: 'E2E Aprov B' })
  ck('fila de aprovações lista o conteúdo pendente', (await row.count()) === 1)
  await row.locator('a:has-text("Revisar")').click()
  await a.waitForSelector('dialog.drawer[open] h4', { timeout: 20000 })
  ck('"Revisar" abre o detalhe do cartão', /abrir=/.test(a.url()) && (await D(a).textContent()).includes('E2E Aprov B'))
  await D(a).locator('button:has-text("Aprovar")').click()
  await D(a).locator('text=Aprovado por').first().waitFor({ timeout: 15000 })
  await a.goto(BASE + '/producao/aprovacoes'); await idle(a)
  ck('decidido sai da fila', (await a.locator('tr', { hasText: 'E2E Aprov B' }).count()) === 0)

  // ---------- política por filial ----------
  await a.goto(BASE + '/configuracoes/fluxo'); await idle(a)
  const tog = a.locator('input[aria-label="Exigir aprovação em Minas Farma"]')
  ck('política: exigir aprovação começa ligada', await tog.isChecked())
  await tog.uncheck(); await wait(2500)
  ck('política desligada fica salva', (await db.query(`select approval_required from brands where id = $1`, [minas])).rows[0].approval_required === false)
  await a.goto(BASE + '/producao'); await idle(a)
  await addCard(a, 'Briefing', 'E2E Livre C')
  await card(a, 'E2E Livre C').locator('select.kmove').selectOption('aprovado')
  await col(a, 'Aprovado').locator('.kcard', { hasText: 'E2E Livre C' }).waitFor({ timeout: 15000 })
  ck('com a política desligada, vai direto para Aprovado', true)
  await a.goto(BASE + '/configuracoes/fluxo'); await idle(a)
  await a.locator('input[aria-label="Exigir aprovação em Minas Farma"]').check(); await wait(2500)
  ck('política religada', (await db.query(`select approval_required from brands where id = $1`, [minas])).rows[0].approval_required === true)

  // =============== EDITOR ===============
  const { p: e } = await mk()
  await login(e, 'e2e_ed')
  await scope(e, 'Minas Farma')
  await e.goto(BASE + '/producao'); await idle(e)
  await addCard(e, 'Briefing', 'E2E Editor A')
  await card(e, 'E2E Editor A').locator('select.kmove').selectOption('aprovacao')
  await col(e, 'Aguardando aprovação').locator('.kcard', { hasText: 'E2E Editor A' }).waitFor({ timeout: 15000 })
  await wait(2500)
  await openCard(e, 'E2E Editor A')
  const et = await D(e).textContent()
  ck('editor envia para aprovação mas não vê botões de decisão do próprio envio', et.includes('Aguardando decisão') && (await D(e).locator('button:has-text("Aprovar")').count()) === 0 && (await D(e).locator('textarea[aria-label="Motivo da decisão"]').count()) === 0)
  await D(e).locator('button[aria-label="Fechar"]').click()
  await e.goto(BASE + '/configuracoes/fluxo'); await idle(e)
  ck('editor não acessa a política de aprovação', !e.url().includes('/configuracoes/fluxo'), e.url())

  // =============== LEITOR ===============
  const { p: v, c: vc } = await mk()
  await login(v, 'e2e_vw')
  await scope(v, 'Minas Farma')
  await v.goto(BASE + '/producao/biblioteca'); await idle(v)
  ck('leitor vê a biblioteca sem painel de envio', (await v.locator('.asset-card').count()) >= 1 && (await v.locator('.upload-panel').count()) === 0)
  await v.goto(BASE + '/producao'); await idle(v)
  await openCard(v, 'E2E Aprov A')
  ck('leitor abre o cartão sem controles de edição', (await D(v).locator('button:has-text("Enviar para aprovação")').count()) === 0 && (await D(v).locator('button:has-text("Anexar da biblioteca")').count()) === 0)
  await D(v).locator('button[aria-label="Fechar"]').click()
  const up = await vc.request.post(BASE + '/api/media', { headers: { origin: BASE }, multipart: { brand_id: minas, file: { name: 'x.png', mimeType: 'image/png', buffer: png('viewer') } } })
  ck('leitor não envia arquivo pela API (403)', up.status() === 403, up.status())
  const noSession = await (await browser.newContext()).request.post(BASE + '/api/media', { headers: { origin: BASE }, multipart: { brand_id: minas, file: { name: 'x.png', mimeType: 'image/png', buffer: png('anon') } } })
  ck('sem login não envia arquivo (401)', noSession.status() === 401, noSession.status())

  // =============== OUTRA FILIAL ===============
  const asset = (await db.query(`select id from media_assets where title = 'E2E Arte' and deleted_at is null limit 1`)).rows[0].id
  const own = await vc.request.get(BASE + '/api/media/' + asset)
  ck('quem tem acesso baixa a mídia', own.status() === 200 && (own.headers()['content-type'] ?? '').startsWith('image/png'), own.status())
  await db.query(`update users set brand_ids = $1 where username_normalized = 'e2e_vw'`, [[farma]])
  const { p: v2, c: vc2 } = await mk()
  await login(v2, 'e2e_vw')
  const other = await vc2.request.get(BASE + '/api/media/' + asset)
  ck('usuário de outra filial recebe 404 na mídia da Minas Farma', other.status() === 404, other.status())
  await v2.goto(BASE + '/producao/biblioteca'); await idle(v2)
  ck('biblioteca da outra filial não mostra mídia da Minas Farma', (await v2.locator('.asset-card', { hasText: 'E2E Arte' }).count()) === 0)
  const anon = await (await browser.newContext()).request.get(BASE + '/api/media/' + asset, { maxRedirects: 0 })
  ck('mídia não abre sem login', anon.status() === 401 || anon.status() === 404 || anon.status() === 307, anon.status())
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
