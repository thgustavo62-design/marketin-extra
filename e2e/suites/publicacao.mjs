// @title: Publicação manual/assistida: lembrete, confirmação do endereço e vínculo
// @needs: 
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
const pg = createRequire(new URL('../../package.json', import.meta.url))('pg')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 240) : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /@(127.0.0.1|localhost)[:/]/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } })
await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const day = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); p.on('dialog', (d) => d.accept()); return { c, p } }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }
const scope = async (p, name) => { await p.selectOption('select[aria-label="Filial"]', { label: name }); await p.waitForLoadState('networkidle'); await wait(300) }
const idleP = (p) => p.waitForLoadState('networkidle')

try {
  const minas = (await q(`select id from brands where name = 'Minas Farma'`))[0].id
  const admin = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id
  const today = day(0)

  const { p: a } = await mk(); await login(a, 'teste_e2e'); await scope(a, 'Minas Farma')
  const { p: v3 } = await mk(); await login(v3, 'e2e_vw'); await scope(v3, 'Minas Farma')

  // =============== PUBLICAÇÃO MANUAL / ASSISTIDA ===============
  const mkPost = async (title, stage, time = null) => (await q(`insert into posts (brand_id, title, post_date, post_time, format, pillar, stage, assigned_to, created_by) values ($1,$2,$3,$4,'feed','institucional',$5,$6,$6) returning id`, [minas, title, today, time, stage, admin]))[0].id
  const pPub = await mkPost('E2E Publicar hoje', 'aprovado')
  await q(`insert into external_publications (brand_id, platform, external_account_id, account_name, external_media_id, permalink, media_type, media_product_type, published_at) values ($1,'instagram','E2E-acc','E2E minas','E2E-pub1','https://www.instagram.com/p/E2Epub1/','IMAGE','FEED',now())`, [minas])
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }))
  const pFuture = hour < 23 ? await mkPost('E2E Publicar mais tarde', 'aprovado', '23:59') : null

  // alerta "Hora de publicar"
  await a.goto(BASE + '/alertas'); await idle(a)
  await Promise.all([a.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/alertas'), { timeout: 60000 }), a.getByRole('button', { name: 'Reavaliar agora' }).click()])
  await wait(800); await a.reload(); await idle(a)
  const due = a.locator('.alert-list li', { hasText: 'Hora de publicar: E2E Publicar hoje' })
  ck('lembrete "Hora de publicar" para conteúdo aprovado de hoje (publicação manual)', (await due.count()) === 1 && /manual/.test(await due.textContent()) && (await due.getAttribute('data-type')) === 'publish_due')
  if (pFuture) ck('conteúdo com horário ainda no futuro não gera o lembrete', (await a.locator('.alert-list li', { hasText: 'Hora de publicar: E2E Publicar mais tarde' }).count()) === 0)

  // cartão: método e confirmação
  await a.goto(BASE + `/producao?abrir=${pPub}`); await a.waitForSelector('dialog.drawer[open] h4', { timeout: 30000 }); await wait(500)
  const D = a.locator('dialog.drawer[open]')
  ck('seção Publicação: API aparece desabilitada e o texto diz que o sistema não publica sozinho', (await D.locator('#pub-method option[value="api"]').isDisabled()) && /não publica sozinho/.test(await D.locator('[data-section="publicacao"] h4').textContent()))
  await D.locator('#pub-method').selectOption('assistido'); await D.locator('.form-ok').waitFor({ timeout: 15000 })
  ck('método assistido é salvo', (await q(`select publication_method from posts where id = $1`, [pPub]))[0].publication_method === 'assistido')
  await D.locator('#pub-url').fill('https://evil.com/instagram.com/p/x')
  await D.getByRole('button', { name: 'Confirmar publicação' }).click()
  await D.locator('.form-error').waitFor({ timeout: 15000 })
  ck('endereço que não é de rede social é recusado', /rede social/.test(await D.locator('.form-error').first().textContent()))
  await D.locator('#pub-url').fill('https://www.instagram.com/p/E2Epub1/?igsh=abc')
  await D.getByRole('button', { name: 'Confirmar publicação' }).click()
  await D.locator('.form-error', { hasText: /aprova/i }).waitFor({ timeout: 15000 })
  ck('sem aprovação válida (filial exige) a confirmação é recusada e nada muda', /aprova/i.test(await D.locator('.form-error').first().textContent()) && (await q(`select stage, published_url from posts where id = $1`, [pPub]))[0].stage === 'aprovado')
  await q(`update brands set approval_required = false where id = $1`, [minas])
  await D.getByRole('button', { name: 'Confirmar publicação' }).click()
  await D.locator('.form-ok', { hasText: 'Publicação confirmada' }).first().waitFor({ timeout: 20000 })
  const pub = (await q(`select stage, published_url, published_confirmed_by, published_confirmed_at from posts where id = $1`, [pPub]))[0]
  ck('confirmação: etapa Publicado, endereço, quem e quando registrados', pub.stage === 'publicado' && pub.published_url.startsWith('https://www.instagram.com/p/E2Epub1/') && pub.published_confirmed_by === admin && pub.published_confirmed_at)
  const ep = (await q(`select content_id, link_method, linked_by from external_publications where external_media_id = 'E2E-pub1'`))[0]
  ck('endereço igual ao de uma publicação coletada: vínculo feito (manual, por quem confirmou)', ep.content_id === pPub && ep.link_method === 'manual' && ep.linked_by === admin)
  await D.locator('[data-section="publicacao"]', { hasText: 'Publicação confirmada por Admin Teste' }).waitFor({ timeout: 15000 }).catch(() => {})
  ck('o cartão publicado mostra o link e quem confirmou', /Publicação confirmada por Admin Teste/.test(await D.locator('[data-section="publicacao"]').textContent()) && (await D.locator('[data-section="publicacao"] a', { hasText: 'Abrir publicação' }).count()) === 1)
  await q(`update brands set approval_required = true where id = $1`, [minas])
  await a.goto(BASE + '/alertas'); await idle(a)
  await Promise.all([a.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/alertas'), { timeout: 60000 }), a.getByRole('button', { name: 'Reavaliar agora' }).click()])
  await wait(800); await a.reload(); await idle(a)
  ck('depois de confirmar, o lembrete some de "Ativos"', (await a.locator('.alert-list li', { hasText: 'Hora de publicar: E2E Publicar hoje' }).count()) === 0)

  // leitor não confirma
  await v3.goto(BASE + `/producao?abrir=${pFuture ?? pPub}`); await v3.waitForSelector('dialog.drawer[open] h4', { timeout: 30000 }); await wait(500)
  ck('leitor vê a seção Publicação sem poder confirmar nem mudar o método', (await v3.locator('dialog.drawer[open] #pub-method').isDisabled()) && (await v3.getByRole('button', { name: 'Confirmar publicação' }).count()) === 0)
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await q(`update brands set approval_required = true`).catch(() => {})
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)