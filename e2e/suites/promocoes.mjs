// @title: Promoções por planilha (EAN + valor aproximado → peças de story, feed e A4), temas e downloads
// @needs:
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
const req = createRequire(new URL('../../package.json', import.meta.url))
const pg = req('pg'), sharp = req('sharp'), ExcelJS = req('exceljs'), { unzipSync } = req('fflate')

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
const gtin = (b12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(b12[i]) * (i % 2 === 0 ? 1 : 3); return b12 + String((10 - (s % 10)) % 10) }
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const xlsx = async (rows) => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Plan'); rows.forEach((r) => ws.addRow(r)); return Buffer.from(await wb.xlsx.writeBuffer()) }
// imagem de produto: retângulo colorido (PNG) para entrar no banco de imagens
const foto = async (cor) => sharp({ create: { width: 300, height: 420, channels: 3, background: '#ffffff' } }).composite([{ input: await sharp({ create: { width: 180, height: 320, channels: 3, background: cor } }).png().toBuffer(), left: 60, top: 50 }]).png().toBuffer()
const arte = (w, h, cor) => sharp({ create: { width: w, height: h, channels: 3, background: cor } }).png().toBuffer()

try {
  const admin = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id
  const E = [gtin('789200010001'), gtin('789200010002'), gtin('789200010003'), gtin('789200010004'), gtin('789200010005'), gtin('789200010006'), gtin('789200010007'), gtin('789200010008')]
  const nomes = ['LEITE NINHO FASES 1+ 800GR', 'APTANUTRI PREMIUM 3 800G', 'SAB. LIQ. GRANADO BEBE 250ML', 'SH. HUGGIES KIDS 360ML', 'TALCO TRA-LA-LA BABY 160G', 'LENCO UMEDECIDO PERSONAL BABY C/50 UND', 'PRODUTO SEM FOTO 100ML', 'COND. HUGGIES KIDS 360ML']
  for (const [i, e] of E.entries()) await q(`insert into products (ean, description, name_key, search, source, created_by) values ($1,$2,$3,$4,'manual',$5)`, [e, nomes[i], nomes[i], nomes[i].toLowerCase() + ' ' + e, admin])

  const { p: a, c: ac } = await login0()
  async function login0() { const x = await mk(); await login(x.p, 'teste_e2e'); return x }
  // fotos no banco de imagens (todos menos o penúltimo)
  for (const [i, e] of E.entries()) {
    if (i === 6) continue
    const pid = (await q(`select id from products where ean = $1`, [e]))[0].id
    const r = await ac.request.post(BASE + '/api/produtos/imagens', { headers: { origin: BASE }, multipart: { product_id: pid, file: { name: `f${i}.png`, mimeType: 'image/png', buffer: await foto(['#c0392b', '#2471a3', '#1e8449', '#d68910', '#7d3c98', '#117a65', '#566573', '#a04000'][i]) } } })
    if (r.status() !== 200) console.log('upload foto falhou', r.status())
  }

  // ---------- menu e tela inicial ----------
  ck('menu tem "Promoções"', (await a.textContent('.side-nav')).includes('Promoções'))
  await a.goto(BASE + '/promocoes'); await idle(a)
  ck('tela de promoções tem o envio de planilha e o modelo de exemplo', (await a.locator('#np-file').count()) === 1 && (await a.locator('a[href="/api/promocoes/modelo"]').count()) === 1)
  const modelo = await ac.request.get(BASE + '/api/promocoes/modelo')
  const mb = await modelo.body()
  ck('planilha de exemplo baixa em .xlsx e usa "Valor aproximado"', modelo.status() === 200 && mb.subarray(0, 2).toString() === 'PK' && /Valor aproximado/.test(await (async () => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(mb); return wb.worksheets[0].getRow(1).values.join('|') })()))

  // ---------- tema ----------
  await a.goto(BASE + '/promocoes/temas'); await idle(a)
  await a.fill('#nt-name', 'Atacadão do Bebê E2E'); await a.getByRole('button', { name: 'Criar tema' }).click()
  await a.waitForURL(/\/promocoes\/temas\/[0-9a-f-]{36}$/, { timeout: 20000 }); await idle(a)
  const themeId = a.url().split('/').pop()
  ck('tema criado e aberto no editor', (await q(`select name from promo_themes where id = $1`, [themeId]))[0]?.name === 'Atacadão do Bebê E2E')
  // envia cabeçalho e rodapé do story pela API (o botão "Enviar" abre o seletor de arquivo do sistema)
  const up = async (role, format, buf) => (await ac.request.post(`${BASE}/api/promocoes/tema/${themeId}/arte`, { headers: { origin: BASE }, multipart: { role, format, file: { name: 'arte.png', mimeType: 'image/png', buffer: buf } } })).status()
  ck('cabeçalho do story é aceito', (await up('header', 'story', await arte(1080, 380, '#1c5fd4'))) === 200)
  ck('rodapé do story é aceito', (await up('footer', 'story', await arte(1080, 170, '#0f3fa8'))) === 200)
  // arte completa em branco → divide em cabeçalho, rodapé e fundo
  const dividir = (buf, h, f2, fmt = 'feed') => ac.request.post(`${BASE}/api/promocoes/tema/${themeId}/dividir`, { headers: { origin: BASE }, multipart: { format: fmt, header_px: String(h), footer_px: String(f2), file: { name: 'completa.png', mimeType: 'image/png', buffer: buf } } })
  ck('arte completa é dividida: cabeçalho 300 px, rodapé 150 px e fundo inteiro', (await dividir(await arte(1080, 1350, '#2e9be6'), 300, 150)).status() === 200)
  const div = await q(`select role, width, height from promo_theme_assets where theme_id = $1 and format = 'feed' order by role`, [themeId])
  ck('divisão guardou cabeçalho (1080×300), rodapé (1080×150) e fundo (1080×1350)', div.length === 3 && div.find((x) => x.role === 'header')?.height === 300 && div.find((x) => x.role === 'footer')?.height === 150 && div.find((x) => x.role === 'background')?.height === 1350, JSON.stringify(div))
  ck('alturas que não cabem na imagem são recusadas', (await dividir(await arte(1080, 1350, '#fff'), 900, 600)).status() === 422)
  ck('altura inválida (texto) é recusada', (await dividir(await arte(1080, 1350, '#fff'), 'abc', 0)).status() === 400)
  ck('selo de preço vazio é aceito (vale para os 3 formatos)', (await up('badge', 'story', await arte(400, 400, '#1747b8'))) === 200 && (await up('tag', 'story', await arte(300, 120, '#e3171d'))) === 200)
  ck('arte inválida (texto) é recusada', (await ac.request.post(`${BASE}/api/promocoes/tema/${themeId}/arte`, { headers: { origin: BASE }, multipart: { role: 'header', format: 'feed', file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('não é imagem de verdade, só texto aqui') } } })).status() === 422)
  ck('papel inválido é recusado', (await ac.request.post(`${BASE}/api/promocoes/tema/${themeId}/arte`, { headers: { origin: BASE }, multipart: { role: 'qualquer', format: 'story', file: { name: 'a.png', mimeType: 'image/png', buffer: await arte(200, 100, '#fff') } } })).status() === 422)
  const stored = (await q(`select role, format, mime, width, height from promo_theme_assets where theme_id = $1 order by role`, [themeId]))
  ck('artes guardadas em WEBP no banco', stored.length >= 2 && stored.every((x) => x.mime === 'image/webp'), JSON.stringify(stored))
  const art = await ac.request.get(`${BASE}/api/promocoes/tema/${themeId}/header/story`)
  ck('arte do tema abre logado (webp, cache por impressão digital)', art.status() === 200 && art.headers()['content-type'] === 'image/webp' && !!art.headers()['etag'])
  ck('sem login a arte não abre (401)', (await (await browser.newContext()).request.get(`${BASE}/api/promocoes/tema/${themeId}/header/story`)).status() === 401)
  await a.reload(); await idle(a)
  ck('editor do tema mostra a prévia e as artes enviadas', (await a.locator('canvas[aria-label="Prévia do tema"]').count()) === 1 && (await a.locator('img[src*="/header/story"]').count()) >= 1)
  await a.fill('#th-tag', 'Oba!'); await a.fill('#th-title', 'OFERTÃO')
  await a.locator('input[aria-label="Colunas Story / Status"]').fill('2'); await a.locator('input[aria-label="Linhas Story / Status"]').fill('2')
  await a.getByRole('button', { name: 'Salvar tema' }).click(); await a.waitForSelector('.form-ok', { timeout: 15000 })
  const cfgDb = (await q(`select config from promo_themes where id = $1`, [themeId]))[0].config
  ck('tema salvo: etiqueta, título e grade do story (2×2)', cfgDb.tagText === 'Oba!' && cfgDb.title === 'OFERTÃO' && cfgDb.grid.story.cols === 2 && cfgDb.grid.story.rows === 2, JSON.stringify(cfgDb).slice(0, 200))

  // ---------- planilha (várias abas, como a da rede) → promoção ----------
  const cab = ['Barras', 'Descrição', 'Totalizador Fiscal', 'Preço de Venda', 'Preço de Promoção', 'Valor Aproximado', 'Estoque', 'Últ. Prc. Entrada', 'Últ. Entrada', 'Registro MS']
  const lin = (ean, nome, venda, promo, aprox) => [ean, nome, 'F', venda, promo, aprox, 5, 1, '06/03/2026', '. . . -']
  const wbMulti = new ExcelJS.Workbook()
  const abaLeite = wbMulti.addWorksheet('leite')
  const abaPerf = wbMulti.addWorksheet('perfumaria')
  const abaFralda = wbMulti.addWorksheet('fralda')
  const obs = wbMulti.addWorksheet('Observações')
  const separador = (ws) => { const r = ws.addRow(['', '', '', '', '', '', '', '', '', '']); r.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } } }) } // linha azul entre os grupos
  abaLeite.addRow(cab); abaPerf.addRow(cab); abaFralda.addRow(cab)
  abaLeite.addRow(lin(E[0], 'ignorado: o nome vem do catálogo', 49.9, 41.9, 39.99)); abaLeite.addRow(lin(E[1], '', 69, 62, '59,99')); separador(abaLeite); abaLeite.addRow(lin(E[2], '', 25, 21, 'R$ 19,99'))
  abaPerf.addRow(lin(E[3], '', 20, 17, 15.99)); abaPerf.addRow(lin(E[4], '', 15, 13, 12.99)); separador(abaPerf); abaPerf.addRow(lin(E[5], '', 10, 8, 7.99)); abaPerf.addRow(lin(E[6], '', 5, 4, 4.5))
  abaPerf.addRow(lin(E[0], '', 3, 2, 1)) // repetido em outra aba: vale a primeira (leite)
  abaFralda.addRow(lin(E[7], '', 81, 64, '55,5')); separador(abaFralda)
  abaFralda.addRow(lin(gtin('789299999999'), 'PRODUTO NOVO SÓ NA PLANILHA 50ML', 3, 2, 2.99)) // fora do catálogo, mas com nome
  abaFralda.addRow(lin(gtin('789299999998'), '', 3, 2, 2.99)) // fora do catálogo e sem nome: não entra
  abaFralda.addRow(lin('1234567890123', '', 3, 2, 2.99)) // EAN inválido
  abaFralda.addRow(lin(gtin('789200010009'), '', 3, 2, 'abc')) // valor inválido
  obs.addRow(['Observações da campanha'])
  const planilha = Buffer.from(await wbMulti.xlsx.writeBuffer())
  await a.goto(BASE + '/promocoes'); await idle(a)
  await a.fill('#np-name', 'Atacadão do Bebê — teste'); await a.selectOption('#np-theme', themeId); await a.fill('#np-title', 'ATACADÃO DO BEBÊ'); await a.fill('#np-val', 'Válido de 20 a 26/10')
  await a.setInputFiles('#np-file', { name: 'promo.xlsx', mimeType: XLSX, buffer: planilha })
  await a.getByRole('button', { name: 'Montar promoção' }).click()
  await a.waitForSelector('text=Promoção criada', { timeout: 30000 })
  const rep = await a.textContent('[role=status]')
  ck('relatório: 9 produtos de 3 abas, sem foto, fora do catálogo, avisos das linhas e da aba ignorada', /9 produto/.test(rep) && /fralda/.test(rep) && /leite/.test(rep) && /perfumaria/.test(rep) && /sem foto/.test(rep) && /fora do catálogo/.test(rep) && /Observações/.test(rep), rep.replace(/\s+/g, ' ').slice(0, 400))
  const camp = (await q(`select id, name, title, validity, theme_id from promo_campaigns order by created_at desc limit 1`))[0]
  const itens = await q(`select position, ean, name, price::float8 as price, section from promo_items where campaign_id = $1 order by position`, [camp.id])
  ck('itens na ordem das abas: leite (3), perfumaria (4), fralda (2)', itens.length === 9 && itens.slice(0, 3).every((x) => x.section === 'leite') && itens.slice(3, 7).every((x) => x.section === 'perfumaria') && itens.slice(7).every((x) => x.section === 'fralda'), itens.map((x) => x.section).join())
  ck('o preço vem da coluna "Valor aproximado" (não de venda nem de promoção), em número, texto com vírgula e "R$"', itens[0].price === 39.99 && itens[1].price === 59.99 && itens[2].price === 19.99 && itens[6].price === 4.5 && itens[7].price === 55.5, JSON.stringify(itens.map((x) => x.price)))
  ck('nome vem do catálogo (ERP), não da planilha', itens[0].name === 'LEITE NINHO FASES 1+ 800GR' && itens[1].name === 'APTANUTRI PREMIUM 3 800G')
  ck('repetido em outra aba, EAN inválido, valor inválido e código sem nome não entram; código novo com nome entra', !itens.some((x) => x.ean === '1234567890123') && itens.filter((x) => x.ean === E[0]).length === 1 && itens[8].name === 'PRODUTO NOVO SÓ NA PLANILHA 50ML')
  ck('título, validade e tema gravados', camp.title === 'ATACADÃO DO BEBÊ' && camp.validity === 'Válido de 20 a 26/10' && camp.theme_id === themeId)

  // ---------- editor (estilo Canva) ----------
  await a.getByRole('link', { name: /Abrir e baixar/ }).click(); await a.waitForURL(/\/promocoes\/[0-9a-f-]{36}$/); await idle(a)
  await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const dim = async () => a.evaluate(() => { const c = document.querySelector('.canva-paper canvas'); return { w: c.width, h: c.height } })
  await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.width === 1080 && document.querySelector('.canva-paper canvas')?.height === 1920, null, { timeout: 30000 })
  ck('editor tem painel (Produtos/Tema/Dados), peça, inspetor e faixa de peças', (await a.locator('.canva-left').count()) === 1 && (await a.locator('.canva-stage').count()) === 1 && (await a.locator('.canva-right').count()) === 1 && (await a.locator('.canva-strip').count()) === 1)
  ck('story tem 1080×1920', JSON.stringify(await dim()) === '{"w":1080,"h":1920}')
  ck('aviso de produto sem foto aparece', /sem foto/.test(await a.textContent('.notice')))
  const pintado = await a.evaluate(() => { const c = document.querySelector('.canva-paper canvas'); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let nb = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 0 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) nb++; return nb })
  ck('a peça foi desenhada (não está em branco)', pintado > 1500, pintado)
  ck('story quebra por aba: 3 peças (leite, perfumaria, fralda), com o nome da aba', /Peça 1 de 3/.test(await a.textContent('.canva-pager')) && /aba leite/.test(await a.textContent('.canva-pager')) && (await a.locator('.canva-thumb').count()) === 3)
  await a.waitForFunction(() => document.querySelectorAll('.canva-thumb img').length === 3, null, { timeout: 30000 })
  ck('faixa de peças mostra uma miniatura por peça', (await a.locator('.canva-thumb img').count()) === 3)
  ck('sobre a peça há uma área clicável por produto (3 na peça de leite)', (await a.locator('.canva-hit').count()) === 3)
  await a.locator('.canva-hit').first().click()
  if (process.env.E2E_OUT) await a.screenshot({ path: `${process.env.E2E_OUT}/promocao-editor.png`, fullPage: true })
  ck('clicar no produto da peça abre o inspetor com nome e preço', (await a.inputValue('#in-name')) === 'LEITE NINHO FASES 1+ 800GR' && (await a.inputValue('#in-price')) === '39,99')
  await a.fill('#in-name', 'Leite Ninho Fases 1+ 800g'); await a.locator('#in-name').blur(); await wait(1500)
  ck('editar o nome pelo inspetor: salva em maiúsculas', (await q(`select name from promo_items where campaign_id = $1 and position = 1`, [camp.id]))[0].name === 'LEITE NINHO FASES 1+ 800G')
  await a.fill('#in-price', '41,5'); await a.locator('#in-price').blur(); await wait(1500)
  ck('editar o preço pelo inspetor: salva', (await q(`select price::float8 as p from promo_items where campaign_id = $1 and position = 1`, [camp.id]))[0].p === 41.5)
  await a.fill('#in-price', 'abc'); await a.locator('#in-price').blur(); await wait(1200)
  ck('preço inválido é recusado com aviso e não muda o valor', /Preço inválido/.test(await a.textContent('main')) && (await q(`select price::float8 as p from promo_items where campaign_id = $1 and position = 1`, [camp.id]))[0].p === 41.5)
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  // arrastar um produto sobre outro na peça troca os dois de lugar
  const hits = a.locator('.canva-hit')
  const idA = await hits.nth(0).getAttribute('data-item'), idB = await hits.nth(1).getAttribute('data-item')
  await hits.nth(0).dragTo(hits.nth(1)); await wait(2000)
  const ordem = (await q(`select id from promo_items where campaign_id = $1 order by position limit 3`, [camp.id])).map((x) => x.id)
  ck('arrastar o produto 1 sobre o 2 troca os dois de lugar (salvo no banco)', ordem[0] === idB && ordem[1] === idA, `${ordem[0] === idB} ${ordem[1] === idA}`)
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  // arrastar na lista = mover para aquela posição
  const lis = a.locator('.canva-list li[data-item]')
  const primeiro = await lis.nth(0).getAttribute('data-item')
  await lis.nth(0).dragTo(lis.nth(2)); await wait(2000)
  ck('arrastar na lista move o produto para a posição de destino', (await q(`select id from promo_items where campaign_id = $1 and position = 3`, [camp.id]))[0].id === primeiro)
  await a.reload(); await idle(a)
  await a.getByRole('tab', { name: /Tema/ }).click()
  ck('aba Tema lista os temas e marca o atual', (await a.locator('.canva-themes button.on').count()) === 1)
  await a.getByRole('tab', { name: /Produtos/ }).click()
  await a.locator('.canva-list li').nth(5).click()
  ck('clicar na lista abre o produto e vai para a peça dele (perfumaria)', /aba perfumaria/.test(await a.textContent('.canva-pager')) && (await a.locator('#in-name').count()) === 1)
  await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).click(); await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.height === 1350, null, { timeout: 30000 })
  ck('feed tem 1080×1350 e também quebra por aba (3 peças)', JSON.stringify(await dim()) === '{"w":1080,"h":1350}' && (await a.locator('.canva-thumb').count()) === 3)
  await a.getByRole('button', { name: 'Cartaz / Flyer A4' }).click(); await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.height === 2000, null, { timeout: 30000 })
  ck('A4 tem proporção de A4 (1414×2000) e NÃO quebra por aba (1 peça com os 9)', JSON.stringify(await dim()) === '{"w":1414,"h":2000}' && (await a.locator('.canva-thumb').count()) === 1)
  await a.getByRole('button', { name: 'Story / Status' }).click(); await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.height === 1920, null, { timeout: 30000 }); await wait(600)

  // downloads
  const [dl1] = await Promise.all([a.waitForEvent('download', { timeout: 30000 }), a.getByRole('button', { name: /Baixar esta peça/ }).click()])
  const png = await readFile(await dl1.path())
  const meta = await sharp(png).metadata()
  ck('baixar a peça entrega um PNG 1080×1920 com o nome da aba no arquivo', png.subarray(1, 4).toString() === 'PNG' && meta.width === 1080 && meta.height === 1920 && /story-\d-(leite|perfumaria|fralda)\.png$/.test(dl1.suggestedFilename()), `${meta.format} ${meta.width}x${meta.height} ${dl1.suggestedFilename()}`)
  const [dl2] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.getByRole('button', { name: 'Todos os formatos (ZIP)' }).click()])
  const zip = unzipSync(new Uint8Array(await readFile(await dl2.path())))
  const nomesZip = Object.keys(zip)
  ck('ZIP com todos os formatos: 3 story + 3 feed + 1 A4', nomesZip.filter((n) => n.startsWith('story/')).length === 3 && nomesZip.filter((n) => n.startsWith('feed/')).length === 3 && nomesZip.filter((n) => n.startsWith('a4/')).length === 1, nomesZip.join())
  // guarda as peças para conferência visual (e2e/.out)
  for (const n of nomesZip) if (process.env.E2E_OUT && /-1(-[a-z]+)?\.png$/.test(n)) await writeFile(`${process.env.E2E_OUT}/promocao-${n.replace('/', '-')}`, Buffer.from(zip[n]))
  const [dl3] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.getByRole('button', { name: 'A4 em PDF' }).click()])
  const pdf = await readFile(await dl3.path())
  ck('PDF do A4 é um PDF de verdade', pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000, pdf.length)

  // inspetor: subir/descer/remover e adicionar
  await a.locator('.canva-list li').nth(0).click()
  await a.getByRole('button', { name: 'Descer' }).click(); await wait(1500)
  ck('descer o item pelo inspetor troca com o seguinte', (await q(`select id from promo_items where campaign_id = $1 and position = 2`, [camp.id]))[0].id !== null)
  await a.reload(); await idle(a)
  await a.locator('.canva-list li').last().click()
  await a.getByRole('button', { name: 'Remover' }).click(); await wait(1500)
  ck('remover o último item reorganiza as posições', (await q(`select count(*)::int n, max(position)::int m from promo_items where campaign_id = $1`, [camp.id]))[0].m === 8)
  await a.reload(); await idle(a)
  const picker = a.locator('section[aria-label="Produtos da promoção"] .picker input[type=search]')
  await picker.fill('talco'); await a.locator('.picker li button:has-text("Escolher")').first().click()
  await a.locator('input[aria-label="Preço do produto adicionado"]').fill('11,99'); await a.getByRole('button', { name: 'Adicionar' }).click(); await wait(1500)
  ck('adicionar produto pelo catálogo, com preço', (await q(`select count(*)::int n from promo_items where campaign_id = $1 and price = 11.99`, [camp.id]))[0].n === 1)
  await a.getByRole('tab', { name: /Dados/ }).click()
  await a.fill('#pc-title', 'NOVO TÍTULO'); await a.getByRole('button', { name: 'Salvar' }).first().click(); await wait(1500)
  ck('dados da promoção salvos', (await q(`select title from promo_campaigns where id = $1`, [camp.id]))[0].title === 'NOVO TÍTULO')

  // ---------- erros da planilha ----------
  const post = (buf, name = 'p.xlsx') => ac.request.post(BASE + '/api/promocoes/importar', { headers: { origin: BASE }, multipart: { name: 'Teste de erro', file: { name, mimeType: XLSX, buffer: buf } } })
  const semCol = await post(await xlsx([['Qualquer', 'Coisa'], [1, 2]]))
  ck('planilha sem as colunas é recusada com explicação', semCol.status() === 422 && /Valor aproximado/.test((await semCol.json()).error))
  const todosFora = await post(await xlsx([['Barras', 'Valor Aproximado'], [gtin('789288888888'), 5]]))
  const tf = await todosFora.json().catch(() => ({}))
  ck('nenhum código no catálogo (e sem nome): recusa orientando a importar o ERP', todosFora.status() === 422 && /catálogo/.test(tf.error ?? ''), `${todosFora.status()} ${JSON.stringify(tf).slice(0, 200)}`)
  ck('arquivo que não é xlsx é recusado', (await post(Buffer.from('a;b\n1;2'), 'x.csv')).status() === 422)
  ck('envio de outra origem é recusado (403)', (await ac.request.post(BASE + '/api/promocoes/importar', { headers: { origin: 'https://evil.example' }, multipart: { file: { name: 'p.xlsx', mimeType: XLSX, buffer: planilha } } })).status() === 403)

  // ---------- leitor ----------
  const { p: v, c: vc } = await mk(); await login(v, 'e2e_vw')
  await v.goto(BASE + '/promocoes'); await idle(v)
  ck('leitor vê as promoções, sem o envio de planilha', (await v.locator('#np-file').count()) === 0 && (await v.locator('a[href^="/promocoes/"]').count()) >= 1)
  await v.goto(`${BASE}/promocoes/${camp.id}`); await idle(v); await v.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  ck('leitor vê a peça e baixa, mas não edita', (await v.getByRole('button', { name: /Baixar esta peça/ }).count()) === 1 && (await v.locator('button[aria-label="Remover"]').count()) === 0 && (await v.locator('#pc-name').count()) === 0)
  ck('leitor não importa planilha pela API (403)', (await vc.request.post(BASE + '/api/promocoes/importar', { headers: { origin: BASE }, multipart: { file: { name: 'p.xlsx', mimeType: XLSX, buffer: planilha } } })).status() === 403)
  ck('leitor não envia arte de tema (403)', (await vc.request.post(`${BASE}/api/promocoes/tema/${themeId}/arte`, { headers: { origin: BASE }, multipart: { role: 'header', format: 'story', file: { name: 'a.png', mimeType: 'image/png', buffer: await arte(300, 100, '#fff') } } })).status() === 403)

  // excluir promoção e tema
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a)
  await a.getByRole('tab', { name: /Dados/ }).click()
  await a.getByRole('button', { name: 'Excluir promoção' }).click(); await a.waitForURL(BASE + '/promocoes', { timeout: 15000 })
  ck('excluir a promoção apaga os itens', (await q(`select count(*)::int n from promo_items where campaign_id = $1`, [camp.id]))[0].n === 0)
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
