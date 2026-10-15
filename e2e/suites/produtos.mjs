// @title: Banco de imagens de produtos (importar ERP, casar imagens por descrição/EAN, conferir, principal, conteúdo)
// @needs:
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
const req = createRequire(new URL('../../package.json', import.meta.url))
const pg = req('pg'), sharp = req('sharp'), ExcelJS = req('exceljs')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 260) : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /@(127.0.0.1|localhost)[:/]/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } })
await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows

const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1500, height: 1000 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); p.on('dialog', (d) => d.accept()); return { c, p } }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }

// GTIN-13 válido a partir de 12 dígitos
const gtin = (base12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(base12[i]) * (i % 2 === 0 ? 1 : 3); return base12 + String((10 - (s % 10)) % 10) }
const EAN = { multi: gtin('789100010001'), protex: gtin('789100010002'), seda1: gtin('789100010003'), seda2: gtin('789100010004'), acnase: gtin('789100010005'), dove: gtin('789100010006') }
// imagem de cor sólida, diferente para cada semente (hash distinto)
const png = (seed, size = 200) => sharp({ create: { width: size, height: size, channels: 4, background: { r: (seed * 37) % 255, g: (seed * 91) % 255, b: (seed * 53) % 255, alpha: 1 } } }).png().toBuffer()
const xlsx = async (rows) => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Produtos'); rows.forEach((r) => ws.addRow(r)); return Buffer.from(await wb.xlsx.writeBuffer()) }
const outcome = async (p, t = 30000) => { await p.waitForSelector('.form-ok, .form-error', { timeout: t }); return p.textContent('.form-ok, .form-error') }
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

try {
  const admin = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id
  const { p: a, c: ac } = await mk()
  await login(a, 'teste_e2e')

  // ---------- menu e tela vazia ----------
  ck('menu tem "Produtos"', (await a.textContent('.side-nav')).includes('Produtos'))
  await a.goto(BASE + '/produtos'); await idle(a)
  ck('catálogo vazio orienta a importar o ERP', /catálogo ainda está vazio/.test(await a.textContent('main')))

  // ---------- importar o ERP (duas planilhas, formatos diferentes) ----------
  await a.goto(BASE + '/produtos/importar'); await idle(a)
  const minas = await xlsx([
    ['Barras', 'Descrição', 'Princípio Ativo', 'Estoque'],
    [EAN.multi, 'MULTIGRIP 20CAP', 'PARACETAMOL', 3],
    [EAN.protex, 'SAB. PROTEX 85GR C/6 UN VITAMINA E', '', 10],
    [EAN.seda1, 'COND. SEDA 250ML TOQUE DE SEDA', '', 4],
    [EAN.seda2, 'COND. SEDA 250ML RECONSTRUCAO', '', 4],
    [EAN.acnase, 'ACNASE CLEAN SAB. 80G ESFOLIANTE', '', 2],
    ['', 'PRODUTO MANIPULADO XPTO', '', 1],
    [EAN.acnase, 'ACNASE CLEAN SAB. 80G ESFOLIANTE', '', 2], // repetido na mesma planilha: não duplica
  ])
  await a.setInputFiles('input[aria-label="Planilha do ERP"]', { name: 'minas.xlsx', mimeType: XLSX, buffer: minas })
  await a.getByRole('button', { name: 'Importar produtos' }).click()
  const msg1 = await outcome(a)
  ck('importação 1: 6 produtos únicos a partir de 7 linhas', /6 produtos únicos/.test(msg1) && /7 linhas/.test(msg1) && /1 sem código de barras/.test(msg1), msg1)
  const farma = await xlsx([
    ['Código', 'Descrição', 'Barras', 'Nome Grupo', 'Preço de Venda'],
    [101, 'MULTIGRIP 20 CAPSULAS', EAN.multi, 'ANALGESICOS', 12.9],
    [102, 'SH DOVE 400ML', EAN.dove, 'HIGIENE', 19.9],
    [103, 'LIXO SEM BARRAS INVALIDAS', '12345', '', 1],
  ])
  await a.reload(); await idle(a)
  await a.setInputFiles('input[aria-label="Planilha do ERP"]', { name: 'farma.xlsx', mimeType: XLSX, buffer: farma })
  await a.getByRole('button', { name: 'Importar produtos' }).click()
  const msg2 = await outcome(a)
  ck('importação 2: o mesmo EAN das duas lojas vira um produto só (1 atualizado, 2 novos)', /1 atualizados/.test(msg2) && /2 novos/.test(msg2), msg2)
  const total = Number((await q(`select count(*)::int n from products`))[0].n)
  ck('catálogo tem 8 produtos (6 + Dove + código inválido sem EAN)', total === 8, total)
  const multi = (await q(`select description, aliases, group_name, erp_code from products where ean = $1`, [EAN.multi]))[0]
  ck('descrição das duas lojas guardada (principal + alternativa), grupo e código aproveitados', multi.description === 'MULTIGRIP 20 CAPSULAS' && multi.aliases.includes('MULTIGRIP 20CAP') && multi.group_name === 'ANALGESICOS' && multi.erp_code === '101', JSON.stringify(multi))
  ck('EAN inválido do ERP não vira código de barras', (await q(`select count(*)::int n from products where ean is null and description = 'LIXO SEM BARRAS INVALIDAS'`))[0].n === 1)
  await a.setInputFiles('input[aria-label="Planilha do ERP"]', { name: 'x.xlsx', mimeType: XLSX, buffer: await xlsx([['Qualquer', 'Coisa'], [1, 2]]) })
  await a.getByRole('button', { name: 'Importar produtos' }).click()
  await a.waitForSelector('.form-error', { timeout: 20000 })
  ck('planilha sem as colunas do ERP é recusada com explicação', /Descrição/.test(await a.textContent('.form-error')))

  // ---------- enviar imagens em lote ----------
  await a.reload(); await idle(a)
  const files = [
    { name: 'MULTIGRIP 20CAP.png', mimeType: 'image/png', buffer: await png(1) },
    { name: `${EAN.dove}.png`, mimeType: 'image/png', buffer: await png(2) },
    { name: 'ACNASE CLEAN SAB 80G.png', mimeType: 'image/png', buffer: await png(3) },
    { name: 'COND SEDA 250ML.png', mimeType: 'image/png', buffer: await png(4) },
    { name: 'zzzz qqqq 999.png', mimeType: 'image/png', buffer: await png(5) },
    { name: '77ba1cf0-9112-4733-86ca-f96ecf7fe5c1.png', mimeType: 'image/png', buffer: await png(6) },
    { name: 'pequena.png', mimeType: 'image/png', buffer: await png(7, 10) },
    { name: 'falsa.png', mimeType: 'image/png', buffer: Buffer.from('isto não é uma imagem de verdade, é só texto') },
  ]
  await a.setInputFiles('input[aria-label="Imagens"]', files)
  await a.waitForSelector('[role=status] .form-ok', { timeout: 60000 })
  const sum = await a.textContent('[role=status] .form-ok')
  ck('resumo: 2 ligadas sozinhas, 1 por semelhança, 3 na fila, 2 recusadas', /2 ligadas automaticamente/.test(sum) && /1 ligadas por semelhança/.test(sum) && /3 na fila/.test(sum) && /2 recusadas/.test(sum), sum)
  const by = async (name) => (await q(`select product_id, match_method, is_primary, suggestions from product_images where original_name = $1`, [name]))[0]
  const multiId = (await q(`select id from products where ean = $1`, [EAN.multi]))[0].id
  const doveId = (await q(`select id from products where ean = $1`, [EAN.dove]))[0].id
  const acnaseId = (await q(`select id from products where ean = $1`, [EAN.acnase]))[0].id
  const r1 = await by('MULTIGRIP 20CAP.png')
  ck('nome igual à descrição alternativa (outra loja) liga sozinho como principal', r1.product_id === multiId && r1.match_method === 'exata' && r1.is_primary === true, JSON.stringify(r1))
  const r2 = await by(`${EAN.dove}.png`)
  ck('arquivo nomeado com o EAN liga pelo código de barras', r2.product_id === doveId && r2.match_method === 'ean', JSON.stringify(r2))
  const r3 = await by('ACNASE CLEAN SAB 80G.png')
  ck('nome incompleto mas único liga como "similar" (para conferir)', r3.product_id === acnaseId && r3.match_method === 'similar', JSON.stringify(r3))
  const r4 = await by('COND SEDA 250ML.png')
  ck('nome ambíguo (toque de seda × reconstrução) NÃO liga: vai para a fila com 2 sugestões', r4.product_id === null && r4.suggestions.length >= 2, JSON.stringify(r4).slice(0, 200))
  ck('imagens sem nome útil ficam na fila', (await q(`select count(*)::int n from product_images where product_id is null`))[0].n === 3)
  ck('imagem pequena demais e arquivo falso não entram', (await q(`select count(*)::int n from product_images where original_name in ('pequena.png','falsa.png')`))[0].n === 0)
  const stored = (await q(`select mime, width, height, size_bytes, length(data) as len, length(thumb) as tlen from product_images where original_name = 'MULTIGRIP 20CAP.png'`))[0]
  ck('imagem guardada otimizada em WEBP com miniatura', stored.mime === 'image/webp' && stored.len === stored.size_bytes && stored.tlen > 0 && stored.tlen <= stored.len + 400, JSON.stringify(stored))
  await a.setInputFiles('input[aria-label="Imagens"]', [files[0]])
  await a.waitForFunction(() => /1 repetidas/.test(document.querySelector('[role=status] .form-ok')?.textContent ?? ''), null, { timeout: 30000 })
  ck('reenviar a mesma imagem não duplica', (await q(`select count(*)::int n from product_images where product_id = $1`, [multiId]))[0].n === 1)

  // ---------- conferir ----------
  await a.goto(BASE + '/produtos/conferir'); await idle(a)
  ck('fila mostra 3 sem produto e 1 por semelhança', (await a.locator('section:has(h3:has-text("Sem produto definido")) .asset-card').count()) === 3 && (await a.locator('section:has(h3:has-text("semelhança")) .asset-card').count()) === 1)
  await a.locator('section:has(h3:has-text("semelhança")) button:has-text("Está certo")').click()
  await wait(1200)
  ck('"Está certo" confirma a ligação (sai da conferência)', (await q(`select match_method from product_images where product_id = $1`, [acnaseId]))[0].match_method === 'manual')
  const card = a.locator('section:has(h3:has-text("Sem produto definido")) .asset-card', { hasText: 'COND SEDA 250ML.png' })
  await card.getByRole('button', { name: /TOQUE DE SEDA/ }).click()
  await wait(1500)
  const sedaId = (await q(`select id from products where ean = $1`, [EAN.seda1]))[0].id
  ck('escolher a sugestão liga a imagem ao produto (principal)', (await q(`select is_primary from product_images where original_name = 'COND SEDA 250ML.png' and product_id = $1`, [sedaId]))[0]?.is_primary === true)
  const card2 = a.locator('section:has(h3:has-text("Sem produto definido")) .asset-card', { hasText: 'zzzz' })
  await card2.locator('input[type=search]').fill('protex')
  await card2.locator('.picker li button:has-text("Escolher")').first().click()
  await wait(1500)
  const protexId = (await q(`select id from products where ean = $1`, [EAN.protex]))[0].id
  ck('busca livre também liga (pelo nome do produto)', (await q(`select count(*)::int n from product_images where product_id = $1`, [protexId]))[0].n === 1)
  await a.locator('section:has(h3:has-text("Sem produto definido")) .asset-card', { hasText: '77ba1cf0' }).getByRole('button', { name: 'Excluir imagem' }).click()
  await wait(1200)
  ck('excluir imagem da fila funciona e a fila zera', (await q(`select count(*)::int n from product_images where product_id is null`))[0].n === 0)

  // ---------- catálogo e busca ----------
  await a.goto(BASE + '/produtos'); await idle(a)
  ck('catálogo mostra 8 produtos e KPIs', (await a.locator('.asset-card').count()) === 8 && /Com imagem/.test(await a.textContent('.kpis')))
  await a.goto(BASE + '/produtos?q=' + encodeURIComponent('multigrip')); await idle(a)
  ck('busca por nome (inclusive descrição da outra loja)', (await a.locator('.asset-card').count()) === 1)
  await a.goto(BASE + '/produtos?q=' + EAN.dove); await idle(a)
  ck('busca por código de barras', (await a.locator('.asset-card').count()) === 1)
  await a.goto(BASE + '/produtos?q=paracetamol'); await idle(a)
  ck('busca por princípio ativo', (await a.locator('.asset-card').count()) === 1)
  await a.goto(BASE + '/produtos?f=sem'); await idle(a)
  ck('filtro "só sem imagem" (8 − 5 com imagem = 3)', (await a.locator('.asset-card').count()) === 3, await a.locator('.asset-card').count())

  // ---------- produto: imagens ----------
  await a.goto(`${BASE}/produtos/${doveId}`); await idle(a)
  ck('página do produto lista a imagem principal', (await a.locator('.asset-card').count()) === 1 && /Principal/.test(await a.textContent('.asset-card')))
  await a.setInputFiles('section[aria-label="Imagens do produto"] input[type=file]', [{ name: 'dove-2.png', mimeType: 'image/png', buffer: await png(9) }])
  await a.waitForFunction(() => document.querySelectorAll('.asset-card').length === 2, null, { timeout: 30000 })
  ck('segunda imagem entra no produto (sem virar principal)', (await q(`select count(*)::int n from product_images where product_id = $1 and is_primary`, [doveId]))[0].n === 1)
  await a.locator('.asset-card', { hasText: 'dove-2.png' }).getByRole('button', { name: /Tornar principal/ }).click()
  await wait(1500)
  ck('tornar principal troca e mantém uma só principal', (await q(`select original_name from product_images where product_id = $1 and is_primary`, [doveId])).map((x) => x.original_name).join() === 'dove-2.png')
  await a.reload(); await idle(a)
  await a.locator('.asset-card', { hasText: 'dove-2.png' }).getByRole('button', { name: /Excluir/ }).click()
  await wait(1500)
  ck('excluir a principal promove a outra', (await q(`select original_name from product_images where product_id = $1 and is_primary`, [doveId])).map((x) => x.original_name).join() === `${EAN.dove}.png`)
  await a.locator('.asset-card').getByRole('button', { name: /Não é deste produto/ }).click()
  await wait(1500)
  ck('"não é deste produto" devolve a imagem para a fila', (await q(`select count(*)::int n from product_images where product_id is null`))[0].n === 1)
  const dl = await ac.request.get(`${BASE}/api/produtos/imagem/${(await q(`select id from product_images where product_id = $1`, [multiId]))[0].id}`)
  ck('imagem abre logado (webp, cache privado)', dl.status() === 200 && dl.headers()['content-type'] === 'image/webp' && /private/.test(dl.headers()['cache-control']))
  await a.goto(`${BASE}/produtos/${multiId}`); await idle(a)
  await a.fill('#pf-desc', 'MULTIGRIP 20 CAPSULAS EDITADO'); await a.fill('#pf-lab', 'LAB TESTE')
  await a.getByRole('button', { name: 'Salvar alterações' }).click()
  await a.waitForSelector('.form-ok', { timeout: 15000 })
  ck('editar dados do produto', (await q(`select description, manufacturer from products where id = $1`, [multiId]))[0].manufacturer === 'LAB TESTE')
  await a.fill('#pf-ean', '1234567890123'); await a.getByRole('button', { name: 'Salvar alterações' }).click()
  await a.waitForSelector('.form-error', { timeout: 15000 })
  ck('código de barras com dígito verificador errado é recusado', /Código de barras inválido/.test(await a.textContent('.form-error')))

  // ---------- novo produto manual ----------
  await a.goto(BASE + '/produtos/novo'); await idle(a)
  await a.fill('#pf-desc', 'PRODUTO NOVO MANUAL 50ML'); await a.fill('#pf-ean', gtin('789100019999'))
  await a.getByRole('button', { name: 'Cadastrar produto' }).click()
  await a.waitForURL(/\/produtos\/[0-9a-f-]{36}$/, { timeout: 15000 })
  ck('cadastrar produto manual abre a página dele', (await q(`select source from products where description = 'PRODUTO NOVO MANUAL 50ML'`))[0]?.source === 'manual')
  await a.goto(BASE + '/produtos/novo'); await idle(a)
  await a.fill('#pf-desc', 'OUTRO NOME'); await a.fill('#pf-ean', gtin('789100019999'))
  await a.getByRole('button', { name: 'Cadastrar produto' }).click()
  await a.waitForSelector('.form-error', { timeout: 15000 })
  ck('EAN repetido é recusado', /Já existe um produto/.test(await a.textContent('.form-error')))

  // ---------- produtos num conteúdo ----------
  const minasBrand = (await q(`select id from brands where name = 'Minas Farma'`))[0].id
  const post = (await q(`insert into posts (brand_id, title, post_date, format, pillar, stage, created_by) values ($1,'E2E Post produto', current_date,'feed','institucional','briefing',$2) returning id`, [minasBrand, admin]))[0].id
  await a.goto(`${BASE}/planejamento/conteudos/${post}`); await idle(a)
  const box = a.locator('section[aria-label="Produtos do conteúdo"]')
  await box.locator('input[type=search]').fill('protex')
  await box.locator('.picker li button:has-text("Escolher")').first().click()
  await wait(1500)
  ck('vincular produto ao conteúdo grava', (await q(`select count(*)::int n from post_products where post_id = $1 and product_id = $2`, [post, protexId]))[0].n === 1)
  await a.reload(); await idle(a)
  ck('produto vinculado aparece com a imagem para baixar', (await box.locator('li').count()) === 1 && (await box.locator('a:has-text("Baixar")').count()) === 1)
  await a.goto(`${BASE}/produtos/${protexId}`); await idle(a)
  ck('a página do produto mostra o conteúdo que o usa', /E2E Post produto/.test(await a.textContent('main')))
  await a.goto(`${BASE}/planejamento/conteudos/${post}`); await idle(a)
  await box.getByRole('button', { name: /Remover/ }).click()
  await wait(1200)
  ck('remover o produto do conteúdo', (await q(`select count(*)::int n from post_products where post_id = $1`, [post]))[0].n === 0)

  // ---------- perfil leitor e sem login ----------
  const { p: v, c: vc } = await mk()
  await login(v, 'e2e_vw')
  await v.goto(BASE + '/produtos'); await idle(v)
  ck('leitor vê o catálogo sem botões de importar', (await v.locator('.asset-card').count()) >= 1 && (await v.locator('a:has-text("Importar produtos e imagens")').count()) === 0)
  await v.goto(BASE + '/produtos/importar'); await idle(v)
  ck('leitor não vê o importador', /somente leitura/.test(await v.textContent('main')))
  await v.goto(`${BASE}/produtos/${doveId}`); await idle(v)
  ck('leitor não vê botões de edição na página do produto', (await v.getByRole('button', { name: /Enviar imagem|Excluir|Salvar/ }).count()) === 0)
  const up = await vc.request.post(BASE + '/api/produtos/imagens', { headers: { origin: BASE }, multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: await png(20) } } })
  ck('leitor não envia imagem pela API (403)', up.status() === 403, up.status())
  const erp = await vc.request.post(BASE + '/api/produtos/importar-erp', { headers: { origin: BASE }, multipart: { file: { name: 'x.xlsx', mimeType: XLSX, buffer: minas } } })
  ck('leitor não importa o ERP pela API (403)', erp.status() === 403, erp.status())
  const anon = await (await browser.newContext()).request.get(`${BASE}/api/produtos/imagem/${(await q(`select id from product_images limit 1`))[0].id}`)
  ck('sem login a imagem não abre (401)', anon.status() === 401, anon.status())
  const crossSite = await ac.request.post(BASE + '/api/produtos/imagens', { headers: { origin: 'https://evil.example' }, multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: await png(21) } } })
  ck('envio de outra origem é recusado (403)', crossSite.status() === 403, crossSite.status())
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
