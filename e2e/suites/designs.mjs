// @title: Meus designs (artes livres sem planilha: criar, editar, peças, baixar, aprovar, duplicar, permissões)
// @needs:
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const req = createRequire(new URL('../../package.json', import.meta.url))
const pg = req('pg'), sharp = req('sharp'), { unzipSync } = req('fflate')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 260) : ''}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /@(127.0.0.1|localhost)[:/]/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } })
await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows

const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); p.on('dialog', (d) => d.accept()); return { c, p } }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }
const ready = (p) => p.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })

try {
  const { p: a, c: ac } = await mk(); await login(a, 'teste_e2e')
  ck('o menu tem "Meus designs"', (await a.textContent('.side-nav')).includes('Meus designs'))
  await a.goto(BASE + '/criacao'); await idle(a)
  ck('a tela de designs tem o formulário de novo design com os 3 formatos', (await a.locator('#nd-name').count()) === 1 && (await a.locator('#nd-format option').count()) === 3)

  // ---------- criar e abrir ----------
  await a.fill('#nd-name', 'Story de Teste'); await a.selectOption('#nd-format', 'story'); await a.getByRole('button', { name: 'Criar design' }).click()
  await a.waitForURL(/\/criacao\/[0-9a-f-]{36}$/, { timeout: 30000 }); await idle(a); await ready(a)
  const id = a.url().split('/').pop()
  const row = (await q(`select kind, design_format, design_pages, status, overrides from promo_campaigns where id = $1`, [id]))[0]
  ck('o design nasce como arte livre: formato Story, 1 peça, fundo branco, sem encartes', row.kind === 'design' && row.design_format === 'story' && row.design_pages === 1 && row.overrides?.background?.color === '#ffffff' && (await q(`select count(*)::int n from promo_items where campaign_id = $1`, [id]))[0].n === 0)
  ck('o editor do design não mostra produtos, tema nem troca de formato', (await a.getByRole('tab', { name: /Produtos/ }).count()) === 0 && (await a.getByRole('tab', { name: /Tema/ }).count()) === 0 && (await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).count()) === 0 && /Story/.test(await a.textContent('.canva-top')))
  ck('a peça é 1080×1920 e começa em branco', (await a.evaluate(() => { const c = document.querySelector('.canva-paper canvas'); return `${c.width}x${c.height}` })) === '1080x1920' && (await a.evaluate(() => { const c = document.querySelector('.canva-paper canvas'); const d = c.getContext('2d').getImageData(20, 20, 1, 1).data; return d[0] > 250 && d[1] > 250 && d[2] > 250 })))

  // ---------- editar e salvar ----------
  const lay = async () => (await q(`select layers, design_pages, status from promo_campaigns where id = $1`, [id]))[0]
  await a.locator('.canva-addbar button[title="Adicionar título"]').click(); await wait(500)
  await a.fill('#ly-text', 'FIM DE SEMANA DA LIMPEZA'); await wait(300)
  await a.locator('.canva-addbar button[aria-label="Inserir retângulo"]').click(); await wait(2500)
  let L = await lay()
  ck('texto e forma do design ficam salvos', L.layers.story.length === 2 && L.layers.story[0].text === 'FIM DE SEMANA DA LIMPEZA' && L.layers.story.every((x) => x.page === 0))
  await a.reload(); await idle(a); await ready(a)
  ck('ao reabrir, os elementos continuam lá', (await a.locator('.canva-lbox').count()) === 2)

  // ---------- peças ----------
  await a.getByRole('button', { name: '+ Nova peça' }).click(); await wait(1800)
  ck('"+ Nova peça" cria a peça 2 (salvo no design) e abre ela', (await lay()).design_pages === 2 && /Peça 2 de 2/.test(await a.textContent('.canva-pager')) && (await a.locator('.canva-lbox').count()) === 0)
  await a.locator('.canva-addbar button[aria-label="Inserir círculo"]').click(); await wait(2200)
  ck('o elemento novo fica só na peça 2', (await lay()).layers.story.filter((x) => x.page === 1).length === 1)
  await a.getByRole('button', { name: 'Duplicar peça' }).click(); await wait(2200)
  L = await lay()
  ck('"Duplicar peça" cria a peça 3 com cópia dos elementos', L.design_pages === 3 && L.layers.story.filter((x) => x.page === 2).length === 1 && L.layers.story.filter((x) => x.page === 1).length === 1 && /Peça 3 de 3/.test(await a.textContent('.canva-pager')))
  ck('a faixa de miniaturas mostra as 3 peças', (await a.locator('.canva-thumb').count()) === 3)
  await a.getByRole('button', { name: 'Excluir peça' }).click(); await wait(2200)
  L = await lay()
  ck('"Excluir peça" tira a peça e seus elementos e renumera as outras', L.design_pages === 2 && L.layers.story.length === 3 && Math.max(...L.layers.story.map((x) => x.page)) === 1)
  await a.reload(); await idle(a); await ready(a)
  ck('o número de peças continua depois de recarregar', /Peça 1 de 2/.test(await a.textContent('.canva-pager')))
  await a.keyboard.press('Control+z'); await wait(300)

  // ---------- baixar ----------
  const [dl1] = await Promise.all([a.waitForEvent('download', { timeout: 30000 }), a.getByRole('button', { name: /Baixar esta peça/ }).click()])
  const png = await readFile(await dl1.path()), meta = await sharp(png).metadata()
  ck('baixar a peça entrega PNG 1080×1920', meta.width === 1080 && meta.height === 1920 && /story-1\.png$/.test(dl1.suggestedFilename()), `${meta.width}x${meta.height} ${dl1.suggestedFilename()}`)
  const [dl2] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.getByRole('button', { name: 'Todas as peças (ZIP)' }).click()])
  const zip = unzipSync(new Uint8Array(await readFile(await dl2.path()))), nomes = Object.keys(zip)
  ck('o ZIP traz as 2 peças e o manifesto', nomes.filter((n) => n.endsWith('.png')).length === 2 && nomes.includes('manifesto.json'), nomes.join())
  ck('design Story não oferece "todos os formatos" nem PDF', (await a.getByRole('button', { name: 'Todos os formatos (ZIP)' }).count()) === 0 && (await a.getByRole('button', { name: 'A4 em PDF' }).count()) === 0)

  // ---------- verificar e aprovar ----------
  await a.getByRole('button', { name: /Verificar arte/ }).click()
  ck('verificar arte não cobra validade nem encartes de um design', (await a.locator('.canva-check li[data-code="sem-validade"]').count()) === 0 && (await a.locator('.canva-check li[data-code="sem-foto"]').count()) === 0)
  await a.getByRole('button', { name: 'Aprovar design' }).click(); await wait(1800)
  ck('um design (sem encartes) pode ser aprovado', (await lay()).status === 'aprovada')
  await a.locator('.canva-addbar button[aria-label="Inserir círculo"]').click(); await wait(2200)
  ck('editar o design aprovado volta para "em edição"', (await lay()).status === 'rascunho')

  // ---------- imagem enviada + duplicar o design ----------
  const img = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#2e7d32' } }).png().toBuffer()
  await a.locator('input[aria-label="Enviar imagem para a peça"]').setInputFiles({ name: 'verde.png', mimeType: 'image/png', buffer: img }); await wait(4000)
  ck('imagem enviada entra no design', (await q(`select count(*)::int n from promo_assets where campaign_id = $1`, [id]))[0].n === 1)
  await a.goto(BASE + '/criacao'); await idle(a)
  ck('o design aparece na lista com formato, status e peças', (await a.locator(`.design-card[data-id="${id}"]`).count()) === 1 && /Story/.test(await a.textContent(`.design-card[data-id="${id}"]`)) && /2 peça/.test(await a.textContent(`.design-card[data-id="${id}"]`)))
  await a.locator(`.design-card[data-id="${id}"]`).getByRole('button', { name: 'Duplicar' }).click()
  await a.waitForURL(/\/criacao\/[0-9a-f-]{36}$/, { timeout: 30000 }); await idle(a); await ready(a)
  const id2 = a.url().split('/').pop()
  const cp = (await q(`select name, design_pages, layers from promo_campaigns where id = $1`, [id2]))[0]
  const orig = (await q(`select layers from promo_campaigns where id = $1`, [id]))[0]
  const assetCp = (await q(`select id from promo_assets where campaign_id = $1`, [id2]))[0]
  const imgLy = cp.layers.story.find((x) => x.type === 'image')
  ck('duplicar copia o design com as peças e elementos (nome "(cópia)")', id2 !== id && cp.name === 'Story de Teste (cópia)' && cp.design_pages === 2 && cp.layers.story.length === orig.layers.story.length)
  ck('a cópia tem a própria imagem (o elemento aponta para o arquivo da cópia, não do original)', !!assetCp && imgLy?.asset === assetCp.id && (await q(`select count(*)::int n from promo_assets where campaign_id = $1 and id = $2`, [id, assetCp.id]))[0].n === 0)

  // ---------- Feed e A4 ----------
  await a.goto(BASE + '/criacao'); await idle(a)
  await a.fill('#nd-name', 'Feed de Teste'); await a.selectOption('#nd-format', 'feed'); await a.getByRole('button', { name: 'Criar design' }).click()
  await a.waitForURL(/\/criacao\/[0-9a-f-]{36}$/, { timeout: 30000 }); await idle(a); await ready(a)
  const [dlf] = await Promise.all([a.waitForEvent('download', { timeout: 30000 }), a.getByRole('button', { name: /Baixar esta peça/ }).click()])
  const mf = await sharp(await readFile(await dlf.path())).metadata()
  ck('design Feed baixa PNG 1080×1350', mf.width === 1080 && mf.height === 1350, `${mf.width}x${mf.height}`)
  await a.goto(BASE + '/criacao'); await idle(a)
  await a.fill('#nd-name', 'Cartaz de Teste'); await a.selectOption('#nd-format', 'a4'); await a.getByRole('button', { name: 'Criar design' }).click()
  await a.waitForURL(/\/criacao\/[0-9a-f-]{36}$/, { timeout: 30000 }); await idle(a); await ready(a)
  const [dla] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.getByRole('button', { name: 'A4 em PDF' }).click()])
  const pdf = await readFile(await dla.path())
  ck('design A4 oferece o PDF e ele é um PDF de verdade', pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 2000)

  // ---------- separação de promoções, console e permissões ----------
  await a.goto(BASE + '/promocoes'); await idle(a)
  ck('os designs não aparecem na lista de promoções', !/Story de Teste|Feed de Teste|Cartaz de Teste/.test(await a.textContent('main')))
  await a.goto(`${BASE}/promocoes/${id}`); await a.waitForURL(`${BASE}/criacao/${id}`, { timeout: 15000 })
  ck('abrir um design pela rota de promoções leva ao editor de designs', true)
  await a.goto(BASE + '/editor'); await idle(a)
  ck('o console em outra aba também lista os designs', (await a.locator(`a[href="/editor/${id}"]`).count()) === 1)
  const { p: t2 } = await mk(); await login(t2, 'teste_e2e')
  await t2.goto(`${BASE}/editor/${id}`); await idle(t2); await ready(t2)
  ck('o console abre o design em tela cheia (mesmo editor)', (await t2.locator('.canva-tab .canva-paper canvas[data-ready]').count()) === 1)
  const { p: v, c: vc } = await mk(); await login(v, 'e2e_vw')
  await v.goto(BASE + '/criacao'); await idle(v)
  ck('leitor vê os designs, sem criar, duplicar nem excluir', (await v.locator('.design-card').count()) >= 3 && (await v.locator('#nd-name').count()) === 0 && (await v.getByRole('button', { name: 'Duplicar' }).count()) === 0 && (await v.getByRole('button', { name: 'Excluir' }).count()) === 0)
  await v.goto(`${BASE}/criacao/${id}`); await idle(v); await ready(v)
  ck('leitor abre o design mas não vê as ferramentas de adicionar nem de peças', (await v.locator('.canva-addbar button[title="Adicionar título"]').count()) === 0 && (await v.getByRole('button', { name: '+ Nova peça' }).count()) === 0)

  // ---------- miniaturas ----------
  await a.goto(`${BASE}/criacao/${id}`); await idle(a); await ready(a)
  await a.locator('.canva-addbar button[aria-label="Inserir círculo"]').click()
  let thumb = null
  for (let t = 0; t < 20 && !thumb; t++) { await wait(1000); thumb = (await q(`select thumb_at, length(thumb)::int as n from promo_campaigns where id = $1 and thumb is not null`, [id]))[0] }
  ck('o editor gera e envia a miniatura da primeira peça (sem mexer no status)', !!thumb && thumb.n > 200 && thumb.n < 400 * 1024, JSON.stringify(thumb))
  const tr = await ac.request.get(`${BASE}/api/promocoes/miniatura/${id}`)
  const tm = await sharp(await tr.body()).metadata()
  ck('a miniatura é servida como WEBP de até 360 px, só para quem está logado', tr.status() === 200 && /webp/.test(tr.headers()['content-type'] ?? '') && tm.width <= 360 && tm.width > 100 && (await fetch(`${BASE}/api/promocoes/miniatura/${id}`)).status === 401, `${tm.width}x${tm.height}`)
  ck('arquivo que não é imagem é recusado como miniatura (422)', (await ac.request.post(`${BASE}/api/promocoes/miniatura/${id}`, { headers: { origin: BASE }, data: Buffer.from('nao e imagem de verdade, so texto aqui') })).status() === 422)
  await a.goto(BASE + '/criacao'); await idle(a)
  ck('a lista de designs mostra a miniatura no cartão', (await a.locator(`.design-card[data-id="${id}"] img.design-thumb`).count()) === 1)

  // ---------- modelos ----------
  await a.goto(`${BASE}/criacao/${id}`); await idle(a); await ready(a)
  await a.getByRole('tab', { name: /Textos/ }).click()
  await a.fill('#tpl-save-name', 'Modelo Limpeza'); await a.selectOption('#tpl-save-cat', 'limpeza')
  await a.getByRole('button', { name: 'Salvar como modelo' }).click(); await wait(2500)
  const tpl = (await q(`select id, kind, template_category, design_pages, layers from promo_campaigns where name = 'Modelo Limpeza'`))[0]
  const orig2 = (await q(`select layers, design_pages from promo_campaigns where id = $1`, [id]))[0]
  ck('"Salvar como modelo" congela uma cópia do design com nome e categoria', tpl?.kind === 'template' && tpl.template_category === 'limpeza' && tpl.design_pages === orig2.design_pages && tpl.layers.story.length === orig2.layers.story.length)
  const tplAsset = (await q(`select id from promo_assets where campaign_id = $1`, [tpl.id]))[0]
  ck('o modelo tem a própria cópia das imagens', !!tplAsset && tpl.layers.story.find((x) => x.type === 'image')?.asset === tplAsset.id)
  await a.goto(BASE + '/criacao'); await idle(a)
  ck('modelo não aparece na lista de designs nem na de promoções', (await a.locator(`.design-card[data-id="${tpl.id}"]`).count()) === 0 && !/Modelo Limpeza/.test(await a.textContent('main')))
  await a.goto(`${BASE}/criacao/${tpl.id}`); await idle(a); await wait(500)
  const sem1 = (await a.locator('.canva').count()) === 0
  await a.goto(`${BASE}/editor/${tpl.id}`); await idle(a); await wait(500)
  ck('o modelo não abre no editor (nem em designs nem no console): página não encontrada', sem1 && (await a.locator('.canva').count()) === 0)
  await a.goto(BASE + '/criacao/modelos'); await idle(a)
  ck('a página Modelos lista o modelo e filtra por categoria', (await a.locator(`.template-card[data-id="${tpl.id}"]`).count()) === 1 && (await a.getByRole('button', { name: /Limpeza \(1\)/ }).count()) === 1)
  await a.getByRole('button', { name: /Bebê \(0\)/ }).click()
  ck('filtrar por outra categoria esconde o modelo', (await a.locator('.template-card').count()) === 0)
  await a.getByRole('button', { name: /Todos/ }).click()
  await a.locator(`.template-card[data-id="${tpl.id}"]`).getByRole('button', { name: 'Usar este modelo' }).click()
  await a.waitForSelector('#tpl-name', { timeout: 15000 })
  const textoOrig = tpl.layers.story.find((x) => x.type === 'text').text
  ck('usar o modelo mostra os textos para trocar', (await a.inputValue('#tpl-f-0')) === textoOrig)
  await a.fill('#tpl-name', 'Story do Sábado'); await a.fill('#tpl-f-0', 'SUPER OFERTA DE SÁBADO')
  await a.getByRole('button', { name: 'Criar design' }).click()
  await a.waitForURL(/\/criacao\/[0-9a-f-]{36}$/, { timeout: 30000 }); await idle(a); await ready(a)
  const id3 = a.url().split('/').pop()
  const nd = (await q(`select kind, name, layers from promo_campaigns where id = $1`, [id3]))[0]
  const novoAsset = (await q(`select id from promo_assets where campaign_id = $1`, [id3]))[0]
  ck('o design novo nasce do modelo, com o texto trocado e o resto igual', nd.kind === 'design' && nd.name === 'Story do Sábado' && nd.layers.story.some((x) => x.text === 'SUPER OFERTA DE SÁBADO') && nd.layers.story.length === tpl.layers.story.length)
  ck('o design novo tem as próprias imagens e o modelo ficou intacto', nd.layers.story.find((x) => x.type === 'image')?.asset === novoAsset?.id && (await q(`select layers from promo_campaigns where id = $1`, [tpl.id]))[0].layers.story.find((x) => x.type === 'text').text === textoOrig)
  const { p: ed } = await mk(); await login(ed, 'e2e_ed')
  await ed.goto(BASE + '/criacao/modelos'); await idle(ed)
  ck('editor que não criou o modelo pode usar, mas não excluir', (await ed.getByRole('button', { name: 'Usar este modelo' }).count()) >= 1 && (await ed.getByRole('button', { name: 'Excluir' }).count()) === 0)
  await ed.close()
  await v.goto(BASE + '/criacao/modelos'); await idle(v)
  ck('leitor vê os modelos, sem usar nem excluir', (await v.locator('.template-card').count()) >= 1 && (await v.getByRole('button', { name: 'Usar este modelo' }).count()) === 0)
  await a.goto(BASE + '/criacao/modelos'); await idle(a)
  await a.locator(`.template-card[data-id="${tpl.id}"]`).getByRole('button', { name: 'Excluir' }).click()
  await a.waitForFunction(() => document.querySelectorAll('.template-card').length === 0, null, { timeout: 15000 })
  ck('o administrador exclui o modelo; o design criado com ele continua', (await q(`select count(*)::int n from promo_campaigns where id = $1`, [tpl.id]))[0].n === 0 && (await q(`select count(*)::int n from promo_campaigns where id = $1`, [id3]))[0].n === 1)
  await q(`delete from promo_campaigns where id = $1`, [id3])

  // ---------- kit de marca por filial ----------
  const brands = await q(`select id, name from brands order by name`)
  const [bA, bB] = brands
  await a.goto(BASE + '/criacao/marcas'); await idle(a)
  ck('a tela do kit de marca lista as filiais', (await a.locator('#kit-brand option').count()) >= 2)
  await a.selectOption('#kit-brand', bA.id); await a.waitForSelector('section[aria-label="Cores"]')
  await a.getByRole('button', { name: 'Adicionar cor' }).click()
  await a.locator('input[aria-label="Cor 1"]').fill('#e3171d'); await a.fill('input[aria-label="Nome da cor 1"]', 'Vermelho forte')
  await a.getByRole('button', { name: 'Adicionar texto' }).click()
  await a.fill('input[aria-label="Rótulo do texto 1"]', 'Instagram'); await a.fill('input[aria-label="Texto 1"]', '@minasfarma')
  await a.locator('input[aria-label="Fonte Bebas Neue"]').check(); await a.locator('input[aria-label="Fonte Oswald"]').check()
  await a.locator('input[aria-label="Enviar logos"]').setInputFiles({ name: 'logo_minas.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 227, g: 23, b: 29, alpha: 1 } } }).png().toBuffer() }); await wait(3500)
  await a.getByRole('button', { name: 'Salvar kit de marca' }).click(); await wait(2200)
  const kitA = (await q(`select colors, fonts, texts from brand_kits where brand_id = $1`, [bA.id]))[0]
  ck('o kit da filial salva cores, fontes aprovadas e textos prontos', kitA?.colors[0]?.hex === '#e3171d' && kitA.colors[0].name === 'Vermelho forte' && kitA.fonts.join() === 'bebas,oswald' && kitA.texts[0].text === '@minasfarma', JSON.stringify(kitA))
  const logoA = (await q(`select id, category, brand_id from promo_library where brand_id = $1`, [bA.id]))[0]
  ck('o logo enviado fica ligado à filial (categoria logo)', logoA?.category === 'logo' && (await a.locator('[data-logo]').count()) === 1)
  ck('a outra filial continua sem kit (nada se mistura)', (await q(`select count(*)::int n from brand_kits where brand_id = $1`, [bB.id]))[0].n === 0 && (await q(`select count(*)::int n from promo_library where brand_id = $1`, [bB.id]))[0].n === 0)

  // usar no editor
  await a.goto(`${BASE}/criacao/${id}`); await idle(a); await ready(a)
  await a.getByRole('tab', { name: /Camadas/ }).click()
  await a.locator('.canva-layer-list li', { hasText: 'FIM DE SEMANA' }).first().click(); await wait(300)
  await a.getByRole('tab', { name: /Marca/ }).click()
  await a.selectOption('#bp-brand', bA.id); await a.waitForSelector('button[aria-label="Aplicar a cor Vermelho forte"]')
  await a.locator('button[aria-label="Aplicar a cor Vermelho forte"]').click(); await wait(2200)
  const lyk = async () => (await q(`select layers, overrides from promo_campaigns where id = $1`, [id]))[0]
  ck('clicar na cor oficial aplica ao texto selecionado', (await lyk()).layers.story.find((x) => x.text === 'FIM DE SEMANA DA LIMPEZA').color === '#e3171d')
  await a.locator('button[aria-label="Usar a fonte Bebas Neue"]').click(); await wait(2500)
  ck('clicar na fonte aprovada troca a fonte do texto selecionado', (await lyk()).layers.story.find((x) => x.text === 'FIM DE SEMANA DA LIMPEZA').font === 'bebas')
  const n0 = (await lyk()).layers.story.length
  await a.locator('button[aria-label="Adicionar o texto Instagram"]').click(); await wait(2500)
  ck('clicar no texto pronto adiciona um texto novo na peça', (await lyk()).layers.story.length === n0 + 1 && (await lyk()).layers.story.some((x) => x.text === '@minasfarma'))
  await a.getByRole('tab', { name: /Marca/ }).click()
  await a.locator('button[aria-label="Colocar o logo logo minas na peça"]').click(); await wait(3500)
  ck('clicar no logo coloca a imagem na peça (cópia própria na promoção)', (await lyk()).layers.story.filter((x) => x.type === 'image').length >= 2)
  await a.getByRole('tab', { name: /Marca/ }).click()
  await a.locator('button[aria-label="Usar Vermelho forte como fundo"]').click(); await wait(2500)
  ck('"fundo" usa a cor oficial como fundo do design', (await lyk()).overrides?.background?.kind === 'color' && (await lyk()).overrides.background.color === '#e3171d')
  await a.getByRole('tab', { name: /Marca/ }).click()
  await a.selectOption('#bp-brand', bB.id); await wait(1200)
  ck('trocar para a outra filial mostra o kit dela (vazio), sem logos nem cores da primeira', (await a.locator('button[aria-label^="Colocar o logo"]').count()) === 0 && (await a.locator('button[aria-label^="Aplicar a cor"]').count()) === 0 && /Nenhum logo/.test(await a.textContent('.brand-panel')))
  await v.goto(BASE + '/criacao/marcas'); await idle(v)
  ck('leitor vê o kit, sem salvar nem enviar logos', (await v.getByRole('button', { name: 'Salvar kit de marca' }).count()) === 0 && (await v.locator('input[aria-label="Enviar logos"]').count()) === 0)
  ck('leitor não envia logo pela API (403)', (await vc.request.post(BASE + '/api/promocoes/biblioteca', { headers: { origin: BASE }, multipart: { brand_id: bA.id, file: { name: 'x.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).png().toBuffer() } } })).status() === 403)
  await a.goto(BASE + '/criacao/marcas'); await idle(a); await a.waitForSelector('[data-logo]')
  await a.locator('[data-logo] button[aria-label^="Excluir logo"]').click(); await wait(2000)
  ck('excluir o logo tira da filial e da biblioteca', (await q(`select count(*)::int n from promo_library where brand_id = $1`, [bA.id]))[0].n === 0)
  await q(`delete from brand_kits where brand_id = $1`, [bA.id])

  // ---------- excluir ----------
  await a.goto(BASE + '/criacao'); await idle(a)
  const antes = await a.locator('.design-card').count()
  await a.locator(`.design-card[data-id="${id2}"]`).getByRole('button', { name: 'Excluir' }).click()
  await a.waitForFunction((n) => document.querySelectorAll('.design-card').length === n - 1, antes, { timeout: 15000 })
  ck('excluir apaga o design e suas imagens', (await q(`select count(*)::int n from promo_campaigns where id = $1`, [id2]))[0].n === 0 && (await q(`select count(*)::int n from promo_assets where campaign_id = $1`, [id2]))[0].n === 0)
  await vc.close()
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
