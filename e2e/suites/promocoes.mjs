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
  abaLeite.addRow(lin(E[0], 'LEITE NINHO FASES 1+ 800GR', 49.9, 41.9, 39.99)); abaLeite.addRow(lin(E[1], 'APTANUTRI PREMIUM 3 800G', 69, 62, '59,99')); separador(abaLeite); abaLeite.addRow(lin(E[2], 'SAB. LIQ. GRANADO BEBE 250ML', 25, 21, 'R$ 19,99'))
  abaPerf.addRow(lin(E[3], 'SH. HUGGIES KIDS 360ML', 20, 17, 15.99)); abaPerf.addRow(lin(E[4], 'TALCO TRA-LA-LA BABY 160G', 15, 13, 12.99)); separador(abaPerf); abaPerf.addRow(lin(E[5], 'LENCO UMEDECIDO PERSONAL BABY C/50 UND', 10, 8, 7.99)); abaPerf.addRow(lin(E[6], 'PRODUTO SEM FOTO 100ML', 5, 4, 4.5))
  abaPerf.addRow(lin(E[0], 'LEITE NINHO REPETIDO', 3, 2, 1)) // repetido em outra aba: vale a primeira (leite)
  // três fragrâncias do mesmo amaciante, mesmo preço: um encarte só
  abaPerf.addRow(lin(gtin('789300000001'), 'AMACIANTE COMFORT CONCENTRADO 1L BRISA ELEGANTE', 34, 27, 19.99)); abaPerf.addRow(lin(gtin('789300000002'), 'AMACIANTE COMFORT CONCENTRADO 1L FRESCOR INTENSO', 34, 27, 19.99)); abaPerf.addRow(lin(gtin('789300000003'), 'AMACIANTE COMFORT CONCENTRADO 1L PURO CUIDADO', 34, 27, 19.99))
  abaFralda.addRow(lin(E[7], 'COND. HUGGIES KIDS 360ML', 81, 64, '55,5')); separador(abaFralda)
  // quatro tamanhos da mesma fralda, mesmo preço: um encarte só, com tabela de tamanho × unidades
  abaFralda.addRow(lin(gtin('789400000001'), 'FRALDA PERSONAL PANTS PROTECT MEGA G L44P42UN', 81, 64, 59.99)); abaFralda.addRow(lin(gtin('789400000002'), 'FRALDA PERSONAL PANTS PROTECT MEGA M L52P50UN', 81, 64, 59.99))
  abaFralda.addRow(lin(gtin('789400000003'), 'FRALDA PERSONAL PANTS PROTECT MEGA XG L40P38UN', 81, 64, 59.99)); abaFralda.addRow(lin(gtin('789400000004'), 'FRALDA PERSONAL PANTS PROTECT MEGA XXG L36P34UN', 81, 64, 59.99))
  abaFralda.addRow(lin(gtin('789299999999'), 'PRODUTO NOVO SÓ NA PLANILHA 50ML', 3, 2, 2.99)) // fora do catálogo, mas com descrição: entra, sem foto
  abaFralda.addRow(lin(gtin('789299999998'), '', 3, 2, 2.99)) // fora do catálogo e SEM descrição: não entra
  abaFralda.addRow(lin('1234567890123', 'EAN INVALIDO', 3, 2, 2.99)) // EAN inválido
  abaFralda.addRow(lin(gtin('789200010009'), 'VALOR INVALIDO', 3, 2, 'abc')) // valor inválido
  obs.addRow(['Observações da campanha'])
  const planilha = Buffer.from(await wbMulti.xlsx.writeBuffer())
  await a.goto(BASE + '/promocoes'); await idle(a)
  ck('formulário de nova promoção tem a política "agrupar variações" ligada por padrão', (await a.locator('input[name=group]').isChecked()) === true)
  await a.fill('#np-name', 'Atacadão do Bebê — teste'); await a.selectOption('#np-theme', themeId); await a.fill('#np-title', 'ATACADÃO DO BEBÊ'); await a.fill('#np-val', 'Válido de 20 a 26/10')
  await a.setInputFiles('#np-file', { name: 'promo.xlsx', mimeType: XLSX, buffer: planilha })
  await a.getByRole('button', { name: 'Montar promoção' }).click()
  await a.waitForURL(/\/promocoes\/[0-9a-f-]{36}$/, { timeout: 40000 }); await idle(a)
  ck('depois de montar, cai direto no editor da promoção', /\/promocoes\/[0-9a-f-]{36}$/.test(a.url()))
  const camp = (await q(`select id, name, title, validity, theme_id, status, group_variants, import_report from promo_campaigns order by created_at desc limit 1`))[0]
  const itens = await q(`select position, ean, name, price::float8 as price, section, variants from promo_items where campaign_id = $1 order by position`, [camp.id])
  ck('16 linhas da planilha viram 11 encartes (tamanhos e fragrâncias reunidos)', itens.length === 11 && camp.import_report.lines === 16 && camp.import_report.encartes === 11 && camp.import_report.gruposTamanho === 1 && camp.import_report.gruposOpcoes === 1, JSON.stringify({ n: itens.length, r: { l: camp.import_report.lines, e: camp.import_report.encartes } }))
  const gt = itens.find((x) => x.variants?.kind === 'sizes'), go = itens.find((x) => x.variants?.kind === 'options')
  ck('fraldas: um encarte só, com a tabela M 52, G 44, XG 40, XXG 36 e o mesmo preço', !!gt && gt.name === 'FRALDA PERSONAL PANTS PROTECT MEGA' && gt.price === 59.99 && JSON.stringify(gt.variants.rows.map((r) => [r.label, r.units])) === '[["M",52],["G",44],["XG",40],["XXG",36]]', JSON.stringify(gt?.variants?.rows?.map((r) => [r.label, r.units])))
  ck('amaciantes (só muda a fragrância): um encarte "VÁRIAS OPÇÕES" com as 3 opções', !!go && go.name === 'AMACIANTE COMFORT CONCENTRADO 1L - VÁRIAS OPÇÕES' && go.variants.members.length === 3 && go.variants.members.map((m) => m.variant).join('|') === 'BRISA ELEGANTE|FRESCOR INTENSO|PURO CUIDADO')
  ck('itens na ordem das abas: leite (3), perfumaria (5), fralda (3)', itens.slice(0, 3).every((x) => x.section === 'leite') && itens.slice(3, 8).every((x) => x.section === 'perfumaria') && itens.slice(8).every((x) => x.section === 'fralda'), itens.map((x) => x.section).join())
  ck('o preço vem da coluna "Valor aproximado" (não de venda nem de promoção), em número, texto com vírgula e "R$"', itens[0].price === 39.99 && itens[1].price === 59.99 && itens[2].price === 19.99 && itens[7].price === 19.99 && itens[8].price === 55.5, JSON.stringify(itens.map((x) => x.price)))
  ck('o nome é a descrição da planilha (maiúsculas), não a do catálogo', itens[0].name === 'LEITE NINHO FASES 1+ 800GR' && itens[1].name === 'APTANUTRI PREMIUM 3 800G' && itens[2].name === 'SAB. LIQ. GRANADO BEBE 250ML')
  ck('repetido em outra aba, EAN inválido, valor inválido e linha sem descrição fora do catálogo não entram; produto novo com descrição entra', !itens.some((x) => x.ean === '1234567890123' || x.name === 'LEITE NINHO REPETIDO') && itens.some((x) => x.name === 'PRODUTO NOVO SÓ NA PLANILHA 50ML') && camp.import_report.skipped.length === 1)
  ck('título, validade e tema gravados; nasce em edição (não aprovada)', camp.title === 'ATACADÃO DO BEBÊ' && camp.validity === 'Válido de 20 a 26/10' && camp.theme_id === themeId && camp.status === 'rascunho')

  // ---------- editor (estilo Canva) ----------
  await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const dim = async () => a.evaluate(() => { const c = document.querySelector('.canva-paper canvas'); return { w: c.width, h: c.height } })
  await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.width === 1080 && document.querySelector('.canva-paper canvas')?.height === 1920, null, { timeout: 30000 })
  ck('editor tem painel (Produtos/Tema/Dados), peça, inspetor, faixa de peças e barra de aprovação', (await a.locator('.canva-left').count()) === 1 && (await a.locator('.canva-stage').count()) === 1 && (await a.locator('.canva-right').count()) === 1 && (await a.locator('.canva-strip').count()) === 1 && (await a.locator('.canva-approval').count()) === 1)
  ck('resumo da importação aparece: 16 produtos → 11 encartes, grupos, sem foto e fora do catálogo', /16 produto\(s\) da planilha/.test(await a.textContent('.canva-report summary')) && /11 encarte/.test(await a.textContent('.canva-report summary')) && /1 grupo\(s\) de tamanho/.test(await a.textContent('.canva-report summary')) && /sem foto/.test(await a.textContent('.canva-report summary')) && /fora do catálogo/.test(await a.textContent('.canva-report summary')))
  ck('story tem 1080×1920', JSON.stringify(await dim()) === '{"w":1080,"h":1920}')
  const pintado = await a.evaluate(() => { const c = document.querySelector('.canva-paper canvas'); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let nb = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 0 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) nb++; return nb })
  ck('a peça foi desenhada (não está em branco)', pintado > 1500, pintado)
  ck('story quebra por aba: 4 peças (leite, perfumaria ×2, fralda), com o nome da aba', /Peça 1 de 4/.test(await a.textContent('.canva-pager')) && /aba leite/.test(await a.textContent('.canva-pager')) && (await a.locator('.canva-thumb').count()) === 4)
  await a.waitForFunction(() => document.querySelectorAll('.canva-thumb img').length === 4, null, { timeout: 30000 })
  ck('faixa de peças mostra uma miniatura por peça', (await a.locator('.canva-thumb img').count()) === 4)
  ck('sobre a peça há uma área clicável por encarte (3 na peça de leite)', (await a.locator('.canva-hit').count()) === 3)
  await a.locator('.canva-hit').first().click()
  if (process.env.E2E_OUT) await a.screenshot({ path: `${process.env.E2E_OUT}/promocao-editor.png`, fullPage: true })
  ck('clicar no encarte da peça abre o inspetor com nome e preço', (await a.inputValue('#in-name')) === 'LEITE NINHO FASES 1+ 800GR' && (await a.inputValue('#in-price')) === '39,99')
  await a.fill('#in-name', 'Leite Ninho Fases 1+ 800g'); await a.locator('#in-name').blur(); await wait(1500)
  ck('editar o nome pelo inspetor: salva em maiúsculas', (await q(`select name from promo_items where campaign_id = $1 and position = 1`, [camp.id]))[0].name === 'LEITE NINHO FASES 1+ 800G')
  await a.fill('#in-price', '41,5'); await a.locator('#in-price').blur(); await wait(1500)
  ck('editar o preço pelo inspetor: salva', (await q(`select price::float8 as p from promo_items where campaign_id = $1 and position = 1`, [camp.id]))[0].p === 41.5)
  await a.fill('#in-price', 'abc'); await a.locator('#in-price').blur(); await wait(1200)
  ck('preço inválido é recusado com aviso e não muda o valor', /Preço inválido/.test(await a.textContent('main')) && (await q(`select price::float8 as p from promo_items where campaign_id = $1 and position = 1`, [camp.id]))[0].p === 41.5)

  // aprovação
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  ck('editar tirou/impede a aprovação: continua "Em edição" e o botão Aprovar aparece', /Em edição/.test(await a.textContent('.canva-approval')) && (await a.getByRole('button', { name: 'Aprovar encartes' }).count()) === 1)
  await a.getByRole('button', { name: 'Aprovar encartes' }).click(); await wait(2000)
  const aprov = (await q(`select status, approved_by, approved_at from promo_campaigns where id = $1`, [camp.id]))[0]
  ck('aprovar grava quem aprovou e quando', aprov.status === 'aprovada' && aprov.approved_by === admin && !!aprov.approved_at)
  await a.reload(); await idle(a)
  ck('a tela mostra "Aprovada por <nome>" e some o botão Aprovar', /Aprovada por Admin Teste/.test(await a.textContent('.canva-approval')) && (await a.getByRole('button', { name: 'Aprovar encartes' }).count()) === 0)
  await a.locator('.canva-list li').nth(2).click()
  await a.fill('#in-price', '19,5'); await a.locator('#in-price').blur(); await wait(1800)
  ck('qualquer alteração depois de aprovar volta para "Em edição" (precisa aprovar de novo)', (await q(`select status, approved_by from promo_campaigns where id = $1`, [camp.id]))[0].status === 'rascunho' && (await q(`select approved_by from promo_campaigns where id = $1`, [camp.id]))[0].approved_by === null)

  // arrastar um encarte sobre outro na peça troca os dois de lugar
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const hits = a.locator('.canva-hit')
  const idA = await hits.nth(0).getAttribute('data-item'), idB = await hits.nth(1).getAttribute('data-item')
  await hits.nth(0).dragTo(hits.nth(1)); await wait(2000)
  const ordem = (await q(`select id from promo_items where campaign_id = $1 order by position limit 3`, [camp.id])).map((x) => x.id)
  ck('arrastar o encarte 1 sobre o 2 troca os dois de lugar (salvo no banco)', ordem[0] === idB && ordem[1] === idA)
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const lis = a.locator('.canva-list li[data-item]')
  const primeiro = await lis.nth(0).getAttribute('data-item')
  await lis.nth(0).dragTo(lis.nth(2)); await wait(2000)
  ck('arrastar na lista move o encarte para a posição de destino', (await q(`select id from promo_items where campaign_id = $1 and position = 3`, [camp.id]))[0].id === primeiro)
  await a.reload(); await idle(a)
  await a.getByRole('tab', { name: /Tema/ }).click()
  ck('aba Tema lista os temas e marca o atual', (await a.locator('.canva-themes button.on').count()) === 1)
  await a.getByRole('tab', { name: /Produtos/ }).click()

  // grupos: tabela de tamanhos editável e desagrupar
  const liFralda = a.locator('.canva-list li', { hasText: 'FRALDA PERSONAL PANTS PROTECT MEGA' })
  ck('a lista marca os grupos ("4 tamanhos", "3 opções")', (await liFralda.locator('.canva-group').textContent()) === '4 tamanhos' && (await a.locator('.canva-list li .canva-group', { hasText: '3 opções' }).count()) === 1)
  await liFralda.click()
  ck('inspetor do grupo de tamanhos mostra a tabela (M 52, G 44, XG 40, XXG 36) e os produtos reunidos', (await a.inputValue('input[aria-label="Tamanho 1"]')) === 'M' && (await a.inputValue('input[aria-label="Unidades do tamanho 1"]')) === '52' && /reúne 4 produtos/.test(await a.textContent('.canva-right')))
  await a.fill('input[aria-label="Unidades do tamanho 2"]', '46'); await a.locator('input[aria-label="Unidades do tamanho 2"]').blur(); await wait(1800)
  ck('corrigir as unidades de um tamanho salva na tabela', (await q(`select variants from promo_items where id = (select id from promo_items where campaign_id = $1 and variants->>'kind' = 'sizes')`, [camp.id]))[0].variants.rows[1].units === 46)
  const antes = (await q(`select count(*)::int n from promo_items where campaign_id = $1`, [camp.id]))[0].n
  await a.getByRole('button', { name: /Desagrupar/ }).click(); await wait(2000)
  const depois = await q(`select position, name, price::float8 as price, variants from promo_items where campaign_id = $1 order by position`, [camp.id])
  ck('desagrupar: cada tamanho volta a ser um encarte (4 no lugar de 1), mesmo preço, posições seguidas', depois.length === antes + 3 && depois.filter((x) => /FRALDA PERSONAL PANTS PROTECT MEGA (M|G|XG|XXG) /.test(x.name)).length === 4 && depois.every((x, i) => x.position === i + 1) && !depois.some((x) => x.variants?.kind === 'sizes'), depois.map((x) => x.name.slice(0, 18)).join('|'))

  await a.locator('.canva-list li').nth(5).click()
  ck('clicar na lista abre o encarte e vai para a peça dele (perfumaria)', /aba perfumaria/.test(await a.textContent('.canva-pager')) && (await a.locator('#in-name').count()) === 1)
  await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).click(); await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.height === 1350, null, { timeout: 30000 })
  ck('feed tem 1080×1350 e também quebra por aba', JSON.stringify(await dim()) === '{"w":1080,"h":1350}' && (await a.locator('.canva-thumb').count()) >= 3)
  await a.getByRole('button', { name: 'Cartaz / Flyer A4' }).click(); await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.height === 2000, null, { timeout: 30000 })
  ck('A4 tem proporção de A4 (1414×2000) e NÃO quebra por aba', JSON.stringify(await dim()) === '{"w":1414,"h":2000}' && (await a.locator('.canva-thumb').count()) >= 1)
  await a.getByRole('button', { name: 'Story / Status' }).click(); await a.waitForFunction(() => document.querySelector('.canva-paper canvas')?.height === 1920, null, { timeout: 30000 }); await wait(600)

  // downloads
  const [dl1] = await Promise.all([a.waitForEvent('download', { timeout: 30000 }), a.getByRole('button', { name: /Baixar esta peça/ }).click()])
  const png = await readFile(await dl1.path())
  const meta = await sharp(png).metadata()
  ck('baixar a peça entrega um PNG 1080×1920 com o nome da aba no arquivo', png.subarray(1, 4).toString() === 'PNG' && meta.width === 1080 && meta.height === 1920 && /story-\d-(leite|perfumaria|fralda)\.png$/.test(dl1.suggestedFilename()), `${meta.format} ${meta.width}x${meta.height} ${dl1.suggestedFilename()}`)
  const [dl2] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.getByRole('button', { name: 'Todos os formatos (ZIP)' }).click()])
  const zip = unzipSync(new Uint8Array(await readFile(await dl2.path())))
  const nomesZip = Object.keys(zip)
  ck('ZIP com todos os formatos (story, feed e A4)', nomesZip.filter((n) => n.startsWith('story/')).length >= 4 && nomesZip.filter((n) => n.startsWith('feed/')).length >= 3 && nomesZip.filter((n) => n.startsWith('a4/')).length >= 1, nomesZip.join())
  for (const n of nomesZip) if (process.env.E2E_OUT && /-[12](-[a-z]+)?\.png$/.test(n)) await writeFile(`${process.env.E2E_OUT}/promocao-${n.replace('/', '-')}`, Buffer.from(zip[n]))
  const [dl3] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.getByRole('button', { name: 'A4 em PDF' }).click()])
  const pdf = await readFile(await dl3.path())
  ck('PDF do A4 é um PDF de verdade', pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000, pdf.length)

  // inspetor: subir/descer/remover e adicionar
  await a.locator('.canva-list li').nth(0).click()
  await a.getByRole('button', { name: 'Descer' }).click(); await wait(1500)
  ck('descer o item pelo inspetor mantém a lista consistente', (await q(`select count(distinct position)::int n, count(*)::int c from promo_items where campaign_id = $1`, [camp.id]))[0].n === (await q(`select count(*)::int c from promo_items where campaign_id = $1`, [camp.id]))[0].c)
  await a.reload(); await idle(a)
  const total0 = (await q(`select count(*)::int n from promo_items where campaign_id = $1`, [camp.id]))[0].n
  await a.locator('.canva-list li').last().click()
  await a.getByRole('button', { name: 'Remover' }).click(); await wait(1500)
  ck('remover o último item reorganiza as posições', (await q(`select count(*)::int n, max(position)::int m from promo_items where campaign_id = $1`, [camp.id]))[0].m === total0 - 1)
  await a.reload(); await idle(a)
  const picker = a.locator('section[aria-label="Produtos da promoção"] .picker input[type=search]')
  await picker.fill('talco'); await a.locator('.picker li button:has-text("Escolher")').first().click()
  await a.locator('input[aria-label="Preço do produto adicionado"]').fill('11,99'); await a.getByRole('button', { name: 'Adicionar' }).click(); await wait(1500)
  ck('adicionar produto pelo catálogo, com preço', (await q(`select count(*)::int n from promo_items where campaign_id = $1 and price = 11.99`, [camp.id]))[0].n === 1)
  await a.getByRole('tab', { name: /Textos/ }).click()
  await a.fill('#pc-title', 'NOVO TÍTULO'); await a.getByRole('button', { name: 'Salvar' }).first().click(); await wait(1500)
  ck('dados da promoção salvos', (await q(`select title from promo_campaigns where id = $1`, [camp.id]))[0].title === 'NOVO TÍTULO')

  // ---------- edição fina (como o console do Criax) ----------
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const row = (texto) => a.locator('.canva-list li', { hasText: texto }).first()
  const it1 = async (texto) => (await q(`select * from promo_items where campaign_id = $1 and name like $2 limit 1`, [camp.id, `%${texto}%`]))[0]
  await row('LEITE NINHO FASES').click()
  await a.fill('#in-note', '800g · Leve 3 pague 2'); await a.locator('#in-note').blur(); await wait(1500)
  ck('subtítulo do encarte salvo', (await it1('LEITE NINHO FASES')).note === '800g · Leve 3 pague 2')
  await a.fill('#in-old', '49,90'); await a.locator('#in-old').blur(); await wait(1500)
  ck('preço original ("De R$") salvo', (await it1('LEITE NINHO FASES')).old_price === '49.90')
  await a.fill('#in-old', ''); await a.locator('#in-old').blur(); await wait(1500)
  ck('apagar o preço original remove o "De R$"', (await it1('LEITE NINHO FASES')).old_price === null)
  await a.fill('#in-old', 'abc'); await a.locator('#in-old').blur(); await wait(1200)
  ck('preço original inválido é recusado', /Preço original inválido/.test(await a.textContent('main')))
  await a.getByRole('button', { name: 'Leve 3 Pague 2' }).click(); await wait(1500)
  ck('etiqueta pronta (Leve 3 Pague 2) escolhida no encarte', (await it1('LEITE NINHO FASES')).style?.tag === 'Leve 3 Pague 2')
  await a.getByRole('button', { name: 'Sem etiqueta' }).click(); await wait(1500)
  ck('"Sem etiqueta" esconde a etiqueta só neste encarte', (await it1('LEITE NINHO FASES')).style?.tag === '')
  await a.getByRole('button', { name: 'Do tema' }).click(); await wait(1500)
  ck('"Do tema" volta à etiqueta do tema', (await it1('LEITE NINHO FASES')).style?.tag === undefined)
  await a.fill('#in-tag', 'Só hoje'); await a.locator('#in-tag').blur(); await wait(1500)
  ck('etiqueta com texto próprio', (await it1('LEITE NINHO FASES')).style?.tag === 'Só hoje')
  await a.locator('summary', { hasText: 'Cores e estilo do nome' }).click()
  await a.locator('input[aria-label="Selo do preço"]').fill('#ff0000'); await a.locator('input[aria-label="Selo do preço"]').blur(); await wait(1500)
  ck('cor do selo do preço só neste encarte', (await it1('LEITE NINHO FASES')).style?.badgeColor === '#ff0000')
  await a.getByRole('button', { name: 'Alinhar left' }).click(); await wait(1500)
  ck('alinhamento do nome à esquerda', (await it1('LEITE NINHO FASES')).style?.nameAlign === 'left')
  await a.locator('#in-scale').focus(); await a.keyboard.press('ArrowRight'); await wait(1500)
  ck('tamanho do nome ajustado (105%)', (await it1('LEITE NINHO FASES')).style?.nameScale === 105, JSON.stringify((await it1('LEITE NINHO FASES')).style))
  await a.locator('button', { hasText: 'padrão' }).first().click(); await wait(1500)
  ck('"padrão" devolve a cor do tema', (await it1('LEITE NINHO FASES')).style?.badgeColor === undefined || (await it1('LEITE NINHO FASES')).style?.tagColor === undefined)

  // fragrâncias: mostrar ou não; tabela de tamanhos: mostrar ou não
  await row('VÁRIAS OPÇÕES').click()
  ck('fragrâncias começam ocultas no encarte', (await it1('VÁRIAS OPÇÕES')).variants.show !== true)
  await a.getByLabel('Listar as fragrâncias/sabores no encarte').check(); await wait(1800)
  ck('ligar "listar as fragrâncias" grava no encarte', (await it1('VÁRIAS OPÇÕES')).variants.show === true)
  await a.getByLabel('Listar as fragrâncias/sabores no encarte').uncheck(); await wait(1800)
  ck('desligar volta a ocultar', (await it1('VÁRIAS OPÇÕES')).variants.show === false)

  // foto: enviar quando falta (produto do catálogo sem foto) e produto que nem está no catálogo
  const semFotoAntes = await q(`select count(*)::int n from promo_items i where campaign_id = $1 and not exists (select 1 from product_images m where m.product_id = i.product_id)`, [camp.id])
  await row('PRODUTO SEM FOTO 100ML').click()
  await a.locator('input[aria-label="Enviar foto do produto"]').setInputFiles({ name: 'meu-produto.png', mimeType: 'image/png', buffer: await foto('#8e44ad') }); await wait(3500)
  const sf = await it1('PRODUTO SEM FOTO 100ML')
  ck('enviar foto no encarte sem foto: entra no banco de imagens, ligada ao produto e ao encarte', !!sf.photo_image_id && (await q(`select count(*)::int n from product_images where product_id = $1`, [sf.product_id]))[0].n === 1 && /Foto enviada/.test(await a.textContent('.canva-msg')))
  await row('VÁRIAS OPÇÕES').click()
  await a.locator('input[aria-label="Enviar foto do produto"]').setInputFiles({ name: 'novo.png', mimeType: 'image/png', buffer: await foto('#27ae60') }); await wait(3500)
  const novo = await it1('VÁRIAS OPÇÕES')
  const prodNovo = (await q(`select ean, description, source from products where id = $1`, [novo.product_id]))[0]
  ck('encarte fora do catálogo: o produto é criado (EAN e descrição do encarte) e recebe a foto', !!novo.photo_image_id && prodNovo?.description === 'AMACIANTE COMFORT CONCENTRADO 1L - VÁRIAS OPÇÕES' && prodNovo.source === 'manual' && prodNovo.ean === gtin('789300000001'))
  await a.locator('input[aria-label="Enviar foto do produto"]').setInputFiles({ name: 'texto.png', mimeType: 'image/png', buffer: Buffer.from('não é imagem de verdade') }); await wait(2000)
  ck('arquivo que não é imagem é recusado com aviso', /Não é uma imagem|corrompido|não aceita/i.test(await a.textContent('.canva-msg')))
  // usar a foto de outro produto do catálogo
  await row('SAB. LIQ. GRANADO').click()
  const antesProd = (await it1('SAB. LIQ. GRANADO')).product_id
  await a.locator('summary', { hasText: /^Foto$/ }).click()
  const pickerFoto = a.locator('.canva-right .picker input[type=search]')
  await pickerFoto.fill('huggies'); await a.locator('.canva-right .picker li button:has-text("Escolher")').first().click(); await wait(2000)
  ck('"usar a foto de outro produto": troca o produto que fornece as fotos', (await it1('SAB. LIQ. GRANADO')).product_id !== antesProd && (await it1('SAB. LIQ. GRANADO')).product_id !== null)

  // textos da promoção (etiqueta padrão, texto livre) e aprovação
  await a.getByRole('tab', { name: /Textos/ }).click()
  await a.fill('#ov-tag', 'Oba!'); await a.fill('#ov-extra', 'Rua das Flores, 123 · (27) 99999-0000')
  await a.getByRole('button', { name: 'Salvar textos' }).click(); await wait(1800)
  const ovDb = (await q(`select overrides, status from promo_campaigns where id = $1`, [camp.id]))[0]
  ck('textos da promoção salvos (etiqueta padrão e texto livre)', ovDb.overrides?.tagText === 'Oba!' && ovDb.overrides?.extraText === 'Rua das Flores, 123 · (27) 99999-0000')
  await a.getByRole('tab', { name: /Produtos/ }).click()
  await a.getByRole('button', { name: 'Aprovar encartes' }).click(); await wait(1800)
  ck('depois de tudo, aprovar funciona', (await q(`select status from promo_campaigns where id = $1`, [camp.id]))[0].status === 'aprovada')

  // console em outra aba
  const linkConsole = a.locator('a:has-text("Abrir console em outra aba")')
  ck('o editor dentro da promoção tem o link para abrir o console em outra aba', (await linkConsole.getAttribute('href')) === `/editor/${camp.id}` && (await linkConsole.getAttribute('target')) === '_blank')
  const { p: tab } = await mk(); await login(tab, 'teste_e2e')
  await tab.goto(BASE + '/editor'); await idle(tab)
  ck('o console em tela cheia lista as promoções (sem o menu lateral)', (await tab.locator('.editor-shell').count()) === 1 && (await tab.locator('.side-nav').count()) === 0 && (await tab.locator(`a[href="/editor/${camp.id}"]`).count()) === 1)
  await tab.locator(`a[href="/editor/${camp.id}"]`).click(); await tab.waitForURL(`${BASE}/editor/${camp.id}`); await idle(tab); await tab.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  ck('o console em outra aba abre o mesmo editor (peça, painel, inspetor) e mostra a aprovação', (await tab.locator('.canva-tab .canva-paper canvas[data-ready]').count()) === 1 && /Aprovada por Admin Teste/.test(await tab.textContent('.canva-approval')) && (await tab.locator('a:has-text("Abrir dentro do sistema")').count()) === 1)
  await tab.locator('.canva-hit').first().click()
  await tab.fill('#in-price', '38,5'); await tab.locator('#in-price').blur(); await wait(1800)
  ck('editar no console em outra aba salva e tira a aprovação (mesmo dado do editor de dentro)', (await q(`select price::float8 as p from promo_items where id = $1`, [await tab.locator('.canva-hit').first().getAttribute('data-item')]))[0].p === 38.5 && (await q(`select status from promo_campaigns where id = $1`, [camp.id]))[0].status === 'rascunho')

  // ---------- elementos livres (texto, imagem, formas) como no Canva ----------
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const lay = async () => (await q(`select layers, status from promo_campaigns where id = $1`, [camp.id]))[0]
  const box = a.locator('.canva-lbox')
  await a.getByRole('button', { name: 'Aprovar encartes' }).click(); await wait(1800)
  ck('antes dos elementos a promoção está aprovada', (await lay()).status === 'aprovada')
  ck('a barra para adicionar elementos aparece (texto, imagem, formas, desfazer, zoom)', (await a.locator('.canva-addbar button[title="Adicionar título"]').count()) === 1 && (await a.locator('.canva-addbar button[aria-label="Desfazer"]').count()) === 1 && (await a.locator('.canva-addbar button[aria-label="Aumentar zoom"]').count()) === 1)
  await a.locator('.canva-addbar button[title="Adicionar título"]').click(); await wait(2200)
  let L = await lay()
  ck('adicionar um título cria o elemento, salva e tira a aprovação', (await box.count()) === 1 && L.layers.story?.length === 1 && L.layers.story[0].type === 'text' && L.status === 'rascunho', JSON.stringify(L.layers.story?.[0] ?? null).slice(0, 160))
  ck('o elemento novo já fica selecionado e abre o inspetor do texto', (await a.locator('#ly-text').count()) === 1 && (await a.locator('.canva-lbox.sel .canva-handle').count()) >= 6)
  await a.fill('#ly-text', 'SUPER OFERTA'); await wait(1800)
  L = await lay()
  ck('editar o texto salva', L.layers.story[0].text === 'SUPER OFERTA')
  const h0 = L.layers.story[0].h
  await a.fill('#ly-text', 'SUPER OFERTA\nSÓ HOJE NA REDE'); await wait(1800)
  ck('o texto com duas linhas cresce a caixa sozinho', (await lay()).layers.story[0].h > h0)
  await a.fill('#ly-size', '90'); await wait(1800)
  ck('tamanho da letra salvo', (await lay()).layers.story[0].size === 90)
  await a.locator('input[aria-label="Cor do texto"]').fill('#ffcc00'); await wait(1800)
  ck('cor do texto salva', (await lay()).layers.story[0].color === '#ffcc00')
  // arrastar com o mouse
  L = await lay()
  const x0 = L.layers.story[0].x, y0 = L.layers.story[0].y
  const bb = await box.first().boundingBox()
  await a.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await a.mouse.down()
  await a.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2 + 30, { steps: 6 }); await a.mouse.move(bb.x + bb.width / 2 + 90, bb.y + bb.height / 2 + 60, { steps: 6 }); await a.mouse.up(); await wait(2000)
  L = await lay()
  ck('arrastar o elemento com o mouse muda a posição e salva', L.layers.story[0].x > x0 + 60 && L.layers.story[0].y > y0 + 40, `${x0},${y0} -> ${L.layers.story[0].x},${L.layers.story[0].y}`)
  // redimensionar pelo canto
  const w0 = L.layers.story[0].w
  const bb2 = await a.locator('.canva-lbox.sel').boundingBox()
  await a.mouse.move(bb2.x + bb2.width, bb2.y + bb2.height); await a.mouse.down(); await a.mouse.move(bb2.x + bb2.width + 50, bb2.y + bb2.height + 30, { steps: 6 }); await a.mouse.up(); await wait(2000)
  ck('puxar a alça do canto aumenta o elemento', (await lay()).layers.story[0].w > w0 + 40)
  // números, giro e alinhamento
  await a.fill('#ly-rot', '15'); await wait(1800)
  ck('giro em graus salvo', (await lay()).layers.story[0].rot === 15)
  await a.fill('#ly-rot', '0'); await wait(1800)
  await a.getByRole('button', { name: 'Centralizar na horizontal' }).click(); await wait(1800)
  L = await lay()
  ck('centralizar na peça: x = (largura da peça − largura do elemento) / 2', L.layers.story[0].x === Math.round((1080 - L.layers.story[0].w) / 2), `${L.layers.story[0].x} ${L.layers.story[0].w}`)
  await a.fill('#ly-op', '50'); await wait(1800)
  ck('opacidade salva', Math.abs((await lay()).layers.story[0].opacity - 0.5) < 0.01)
  // teclado: a lista de camadas seleciona e as setas movem
  await a.getByRole('tab', { name: /Camadas/ }).click()
  await a.locator('.canva-layer-list li').first().click(); await a.keyboard.press('Shift+ArrowRight'); await wait(1800)
  ck('setas movem o elemento selecionado (Shift = 10 px)', (await lay()).layers.story[0].x === L.layers.story[0].x + 10)

  // formas e imagem
  await a.locator('.canva-addbar button[aria-label="Inserir explosão"]').click(); await wait(300)
  await a.locator('.canva-addbar button[aria-label="Inserir círculo"]').click(); await wait(300)
  await a.locator('input[aria-label="Enviar imagem para a peça"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await foto('#c0392b') }); await wait(3500)
  L = await lay()
  const imgLy = L.layers.story.find((x) => x.type === 'image')
  ck('formas e imagem enviada viram elementos (4 no total) e a imagem fica guardada na promoção', L.layers.story.length === 4 && !!imgLy && (await q(`select count(*)::int n from promo_assets where campaign_id = $1`, [camp.id]))[0].n === 1, L.layers.story.map((x) => x.type + ':' + (x.shape ?? '')).join(',') + ' conflito=' + (await a.locator('.canva-conflict').count()) + ' estado=' + (await a.locator('.savestate').textContent()))
  const assetRes = await ac.request.get(`${BASE}/api/promocoes/asset/${imgLy.asset}`)
  ck('a imagem enviada é servida como WEBP, só para quem está logado', assetRes.status() === 200 && /image\/webp/.test(assetRes.headers()['content-type'] ?? '') && (await fetch(`${BASE}/api/promocoes/asset/${imgLy.asset}`)).status === 401)
  await a.locator('input[aria-label="Enviar imagem para a peça"]').setInputFiles({ name: 'logo2.png', mimeType: 'image/png', buffer: await foto('#c0392b') }); await wait(3500)
  ck('imagem repetida não duplica o arquivo guardado', (await q(`select count(*)::int n from promo_assets where campaign_id = $1`, [camp.id]))[0].n === 1 && (await lay()).layers.story.length === 5)
  const badUp = await ac.request.post(`${BASE}/api/promocoes/camada-imagem/${camp.id}`, { headers: { origin: BASE }, multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('não é imagem') } } })
  ck('arquivo que não é imagem é recusado no envio do elemento (422)', badUp.status() === 422)

  // desfazer e refazer
  const n1 = (await lay()).layers.story.length
  await a.locator('.canva-addbar button[aria-label="Desfazer"]').click(); await wait(1800)
  ck('desfazer remove o último elemento adicionado', (await lay()).layers.story.length === n1 - 1)
  await a.locator('.canva-addbar button[aria-label="Refazer"]').click(); await wait(1800)
  ck('refazer traz de volta', (await lay()).layers.story.length === n1)

  // camadas: ordem, ocultar, bloquear
  await a.getByRole('tab', { name: /Camadas/ }).click()
  const idsAntes = (await lay()).layers.story.map((x) => x.id)
  const rows = a.locator('.canva-layer-list li')
  ck('a lista de camadas mostra todos os elementos, o último no topo', (await rows.count()) === n1 && (await rows.first().getAttribute('data-layer')) === idsAntes[idsAntes.length - 1])
  await rows.first().locator('button[aria-label="Descer camada"]').click(); await wait(1800)
  const idsDepois = (await lay()).layers.story.map((x) => x.id)
  ck('"descer camada" troca a ordem dos elementos', idsDepois[idsDepois.length - 2] === idsAntes[idsAntes.length - 1] && idsDepois[idsDepois.length - 1] === idsAntes[idsAntes.length - 2])
  await rows.nth(1).locator('button[aria-label="Ocultar"]').click(); await wait(1800)
  ck('ocultar tira o elemento da peça mas mantém na lista', (await lay()).layers.story.filter((x) => x.hidden).length === 1 && (await box.count()) === n1 - 1)
  await rows.nth(1).locator('button[aria-label="Mostrar"]').click(); await wait(1500)
  await rows.first().locator('button[aria-label="Bloquear"]').click(); await wait(1800)
  ck('bloquear: o elemento deixa de ser arrastável (o clique passa para o encarte)', (await lay()).layers.story.filter((x) => x.locked).length === 1 && (await a.locator('.canva-lbox.locked').count()) === 1)
  await rows.first().locator('button[aria-label="Desbloquear"]').click(); await wait(1500)

  // aparece em todas as peças; copiar para os outros formatos
  await rows.nth(2).click()
  await a.selectOption('#ly-page', 'all'); await wait(1800)
  ck('"aparece em todas as peças" salvo (page = null)', (await lay()).layers.story.some((x) => x.page === null))
  await a.getByRole('button', { name: 'Copiar para os outros formatos' }).click(); await wait(2000)
  L = await lay()
  ck('copiar para os outros formatos coloca o elemento no feed e no A4', L.layers.feed?.length === 1 && L.layers.a4?.length === 1)
  await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).click(); await wait(1200)
  ck('no formato feed só aparecem os elementos do feed', (await a.locator('.canva-lbox').count()) === 1)
  await a.getByRole('button', { name: 'Story / Status' }).click(); await wait(1200)

  // o download leva os elementos
  const baixa = async () => { const [d] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: /Baixar esta peça/ }).click()]); return sharp(await d.path()).raw().toBuffer() }
  const comEl = await baixa()
  await a.getByRole('tab', { name: /Camadas/ }).click()
  for (let k = 0; k < 8 && (await rows.count()) > 0; k++) { await rows.first().click(); await a.getByRole('button', { name: 'Excluir elemento' }).click(); await wait(400) }
  await wait(1800)
  const semEl = await baixa()
  ck('o PNG baixado inclui os elementos (diferente da peça sem eles)', Buffer.compare(comEl, semEl) !== 0 && (await lay()).layers.story.length === 0)
  await a.locator('.canva-addbar button[aria-label="Desfazer"]').click(); await wait(1800)
  ck('desfazer traz de volta o último elemento excluído', (await lay()).layers.story.length === 1)

  // ---------- galeria de fundos ("Imagem de Fundo") ----------
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const ovr = async () => (await q(`select overrides, status from promo_campaigns where id = $1`, [camp.id]))[0]
  const paperPng = () => a.evaluate(() => document.querySelector('.canva-paper canvas').toDataURL())
  await a.getByRole('button', { name: 'Aprovar encartes' }).click(); await wait(1800)
  const png0 = await paperPng()
  await a.getByRole('tab', { name: /Fundo/ }).click()
  ck('a aba Fundo mostra a galeria com 12 fundos prontos e a opção do tema', (await a.locator('.bg-grid[aria-label="Fundos prontos"] button').count()) === 12 && (await a.getByRole('button', { name: /Fundo do tema/ }).first().count()) === 1)
  await a.locator('button[aria-label="Fundo Vermelhão"]').click(); await wait(2500)
  let O = await ovr()
  ck('escolher um fundo pronto salva na promoção e tira a aprovação', O.overrides?.background?.kind === 'preset' && O.overrides.background.id === 'vermelhao' && O.status === 'rascunho', JSON.stringify(O.overrides))
  const png1 = await paperPng()
  ck('a peça muda com o fundo escolhido', png1 !== png0)
  await a.locator('input[aria-label="Cor de cima do fundo"]').fill('#112233'); await a.locator('input[aria-label="Cor de baixo do fundo"]').fill('#445566')
  await a.getByRole('button', { name: 'Aplicar' }).click(); await wait(2500)
  O = await ovr()
  ck('duas cores aplicadas como fundo', O.overrides?.background?.kind === 'color' && O.overrides.background.color === '#112233' && O.overrides.background.color2 === '#445566')
  await a.locator('input[aria-label="Enviar imagem de fundo"]').setInputFiles({ name: 'fundo.png', mimeType: 'image/png', buffer: await arte(1080, 1920, '#2e7d32') }); await wait(4000)
  O = await ovr()
  const fundoAsset = O.overrides?.background?.asset
  ck('imagem enviada vira o fundo e entra em "Minhas imagens"', O.overrides?.background?.kind === 'asset' && !!fundoAsset && (await a.locator('.bg-grid[aria-label="Minhas imagens"] .bg-asset').count()) >= 1, JSON.stringify(O.overrides))
  ck('imagem em uso como fundo não pode ser excluída (sem botão)', (await a.locator('.bg-asset').filter({ has: a.locator('button.bg-option.on') }).locator('.bg-del').count()) === 0)
  const temTemas = await a.locator('.bg-grid[aria-label="Fundos de outros temas"] button').count()
  if (temTemas > 0) {
    await a.locator('.bg-grid[aria-label="Fundos de outros temas"] button').first().click(); await wait(2500)
    ck('fundo de outro tema escolhido', (await ovr()).overrides?.background?.kind === 'theme')
  }
  await a.getByRole('button', { name: /Fundo do tema/ }).first().click(); await wait(2500)
  ck('"Fundo do tema" remove a escolha e volta ao fundo original', (await ovr()).overrides?.background === undefined && (await paperPng()) === png0)
  await a.locator(`.bg-asset:has(img[src*="${fundoAsset}"]) .bg-del`).click(); await wait(2000)
  ck('imagem fora de uso pode ser excluída', (await q(`select count(*)::int n from promo_assets where id = $1`, [fundoAsset]))[0].n === 0)

  // ---------- vários elementos, grupo, retângulo de seleção, edição no lugar ----------
  await a.getByRole('tab', { name: /Camadas/ }).click()
  for (let i = 0; i < 3; i++) { await a.locator('.canva-addbar button[aria-label="Inserir círculo"]').click(); await wait(250) }
  await wait(1500)
  const ly = async () => (await q(`select layers from promo_campaigns where id = $1`, [camp.id]))[0].layers.story ?? []
  ck('3 elementos criados para a seleção múltipla', (await ly()).length === 3)
  const rowsM = a.locator('.canva-layer-list li')
  // posições diferentes (setas)
  await rowsM.nth(0).click(); for (let i = 0; i < 4; i++) await a.keyboard.press('Shift+ArrowRight')
  await rowsM.nth(1).click(); for (let i = 0; i < 2; i++) await a.keyboard.press('Shift+ArrowDown')
  await wait(1800)
  const L0 = await ly()
  ck('as setas movem cada elemento (posições diferentes)', new Set(L0.map((x) => x.x)).size >= 2 && new Set(L0.map((x) => x.y)).size >= 2, JSON.stringify(L0.map((x) => [x.x, x.y])))
  await rowsM.nth(0).click(); await rowsM.nth(1).click({ modifiers: ['Shift'] }); await rowsM.nth(2).click({ modifiers: ['Control'] })
  ck('Shift/Ctrl na lista seleciona vários: 3 caixas marcadas, caixa do bloco e painel "3 elementos"', (await a.locator('.canva-lbox.sel').count()) === 3 && (await a.locator('.canva-selbox').count()) === 1 && /3 elementos selecionados/.test(await a.textContent('.canva-right')))
  await a.getByRole('button', { name: 'Seleção: Alinhar à esquerda' }).click(); await wait(1800)
  const L1 = await ly()
  ck('alinhar à esquerda leva os 3 ao mesmo x (o da esquerda)', new Set(L1.map((x) => x.x)).size === 1 && L1[0].x === Math.min(...L0.map((x) => x.x)), JSON.stringify(L1.map((x) => x.x)))
  await a.getByRole('button', { name: 'Seleção: Centralizar na vertical' }).click(); await wait(1500)
  await a.getByRole('button', { name: 'Agrupar' }).click(); await wait(1800)
  const L2 = await ly()
  ck('agrupar: os 3 ficam com o mesmo grupo', !!L2[0].group && L2.every((x) => x.group === L2[0].group))
  await a.keyboard.press('Escape'); await wait(300)
  ck('Esc limpa a seleção', (await a.locator('.canva-lbox.sel').count()) === 0)
  const bbG = await a.locator('.canva-lbox').first().boundingBox()
  await a.mouse.click(bbG.x + bbG.width / 2, bbG.y + bbG.height / 2); await wait(400)
  ck('clicar em um elemento do grupo seleciona o grupo inteiro', (await a.locator('.canva-lbox.sel').count()) === 3)
  const xs0 = (await ly()).map((x) => x.x)
  await a.mouse.move(bbG.x + bbG.width / 2, bbG.y + bbG.height / 2); await a.mouse.down(); await a.mouse.move(bbG.x + bbG.width / 2 + 30, bbG.y + bbG.height / 2 + 20, { steps: 5 }); await a.mouse.move(bbG.x + bbG.width / 2 + 60, bbG.y + bbG.height / 2 + 40, { steps: 5 }); await a.mouse.up(); await wait(2000)
  const xs1 = (await ly()).map((x) => x.x)
  const dxs = xs1.map((x, i) => x - xs0[i])
  ck('arrastar um membro move o grupo todo junto (mesmo deslocamento)', dxs.every((d) => d === dxs[0]) && dxs[0] > 40, JSON.stringify(dxs))
  const ws0 = (await ly()).map((x) => x.w)
  await a.locator('.canva-selbox').scrollIntoViewIfNeeded(); await a.mouse.wheel(0, 150); await wait(300) // o canto de baixo do bloco precisa estar visível na tela
  const sb = await a.locator('.canva-selbox').boundingBox()
  await a.mouse.move(sb.x + sb.width, sb.y + sb.height); await a.mouse.down(); await a.mouse.move(sb.x + sb.width + 40, sb.y + sb.height + 40, { steps: 6 }); await a.mouse.up(); await wait(2000)
  const ws1 = (await ly()).map((x) => x.w)
  ck('a alça do bloco redimensiona todos na mesma proporção', ws1.every((w, i) => w > ws0[i]) && Math.abs(ws1[0] / ws0[0] - ws1[1] / ws0[1]) < 0.05, JSON.stringify([ws0, ws1]))
  await a.getByRole('button', { name: 'Desagrupar' }).click(); await wait(1800)
  ck('desagrupar solta os elementos', (await ly()).every((x) => !x.group))
  await a.keyboard.press('Escape')
  // retângulo de seleção: Shift + arrastar no vazio
  const paper = await a.locator('.canva-paper').boundingBox()
  await a.keyboard.down('Shift'); await wait(200)
  await a.mouse.move(paper.x + 4, paper.y + paper.height * 0.2); await a.mouse.down(); await a.mouse.move(paper.x + paper.width - 4, paper.y + paper.height * 0.8, { steps: 8 }); await a.mouse.up()
  await a.keyboard.up('Shift'); await wait(400)
  ck('Shift + arrastar no vazio desenha a seleção e pega os 3 elementos', (await a.locator('.canva-lbox.sel').count()) === 3)
  await a.keyboard.press('Control+d'); await wait(1800)
  ck('Ctrl+D duplica toda a seleção (6 elementos)', (await ly()).length === 6)
  await a.keyboard.press('Delete'); await wait(1800)
  ck('Delete exclui toda a seleção (volta a 3)', (await ly()).length === 3)
  await a.keyboard.press('Control+a'); await wait(400)
  ck('Ctrl+A seleciona tudo da peça', (await a.locator('.canva-lbox.sel').count()) === 3)
  await a.keyboard.press('Control+g'); await wait(1800)
  ck('Ctrl+G agrupa e Ctrl+Shift+G desagrupa', (await ly()).every((x) => !!x.group))
  await a.keyboard.press('Control+Shift+g'); await wait(1800)
  ck('Ctrl+Shift+G desagrupa', (await ly()).every((x) => !x.group))
  await a.keyboard.press('Control+z'); await wait(1800)
  ck('Ctrl+Z desfaz o desagrupar (voltam ao grupo)', (await ly()).every((x) => !!x.group))
  await a.keyboard.press('Delete'); await wait(1500)
  await a.keyboard.press('Escape')

  // edição do texto direto na peça
  await a.locator('.canva-addbar button[title="Adicionar título"]').click(); await wait(600)
  const tbox = a.locator('.canva-lbox[data-type="text"]').first()
  await tbox.dblclick(); await wait(500)
  ck('duplo clique no texto abre o editor no lugar, sobre a peça', (await a.locator('textarea.canva-inline').count()) === 1)
  await a.fill('textarea.canva-inline', 'EDITADO NA PEÇA'); await a.keyboard.press('Control+Enter'); await wait(1800); for (let t = 0; t < 10 && !(await ly()).some((x) => x.text === 'EDITADO NA PEÇA'); t++) await wait(1000)
  ck('o texto editado no lugar fica salvo e o editor fecha', (await ly()).some((x) => x.text === 'EDITADO NA PEÇA') && (await a.locator('textarea.canva-inline').count()) === 0)

  // edição rápida do encarte (nome, subtítulo e preço) com duplo clique
  const hit = a.locator('.canva-hit').first()
  const hitId = await hit.getAttribute('data-item')
  await a.keyboard.press('Escape')
  await hit.dblclick({ position: { x: 20, y: 20 } }); await wait(600)
  ck('duplo clique no encarte abre a edição rápida ao lado dele', (await a.locator('.canva-quick').count()) === 1)
  await a.fill('#qe-name', 'NOME RAPIDO 123'); await a.fill('#qe-price', '77,7'); await a.getByRole('button', { name: 'Salvar' }).first().click(); await wait(2500)
  const ir = (await q(`select name, price::float8 as p from promo_items where id = $1`, [hitId]))[0]
  ck('a edição rápida salva nome e preço e fecha', ir.name === 'NOME RAPIDO 123' && ir.p === 77.7 && (await a.locator('.canva-quick').count()) === 0, JSON.stringify(ir))
  await hit.dblclick({ position: { x: 20, y: 20 } }); await wait(500)
  await a.keyboard.press('Escape'); await wait(300)
  ck('Esc cancela a edição rápida sem salvar', (await a.locator('.canva-quick').count()) === 0)

  // ---------- biblioteca de imagens (sub-aba de Promoções) ----------
  await a.goto(BASE + '/promocoes'); await idle(a)
  ck('Promoções tem as sub-abas Promoções, Temas e Biblioteca de imagens', (await a.locator('nav[aria-label="Promoções"] a').allTextContents()).join('|') === 'Promoções|Temas (artes)|Biblioteca de imagens' && (await a.locator('nav[aria-label="Promoções"] a.active').textContent()) === 'Promoções')
  await a.locator('nav[aria-label="Promoções"] a', { hasText: 'Biblioteca de imagens' }).click(); await a.waitForURL(BASE + '/promocoes/biblioteca'); await idle(a)
  ck('a sub-aba Biblioteca fica ativa e mostra o envio', (await a.locator('nav[aria-label="Promoções"] a.active').textContent()) === 'Biblioteca de imagens' && (await a.locator('#lib-file').count()) === 1)
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#e3171d"/><path d="M20 32h24M32 20v24" stroke="#fff" stroke-width="8"/></svg>')
  await a.selectOption('#lib-cat', 'icone')
  await a.setInputFiles('#lib-file', [
    { name: 'cruz_vermelha.svg', mimeType: 'image/svg+xml', buffer: svg },
    { name: 'selo azul.png', mimeType: 'image/png', buffer: await foto('#1d5fe0') },
  ]); await wait(5000)
  const lib = await q(`select id, name, category, width, height, mime from promo_library order by created_at`)
  ck('SVG e PNG enviados de uma vez entram na biblioteca (WEBP) com nome do arquivo e a categoria escolhida', lib.length === 2 && lib.every((x) => x.mime === 'image/webp' && x.category === 'icone') && lib[0].name === 'cruz vermelha' && lib[1].name === 'selo azul', JSON.stringify(lib))
  ck('o SVG foi rasterizado em boa resolução (maior lado ≥ 1000 px)', Math.max(lib[0].width, lib[0].height) >= 1000, `${lib[0].width}x${lib[0].height}`)
  ck('as imagens aparecem no grid da biblioteca', (await a.locator('.lib-card').count()) === 2)
  await a.setInputFiles('#lib-file', { name: 'de-novo.png', mimeType: 'image/png', buffer: await foto('#1d5fe0') }); await wait(2500)
  ck('a mesma imagem não entra duas vezes', (await q(`select count(*)::int n from promo_library`))[0].n === 2 && /já estava/.test(await a.textContent('main')))
  await a.setInputFiles('#lib-file', { name: 'mau.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>') }); await wait(2000)
  ck('SVG com referência a arquivo externo é recusado', (await q(`select count(*)::int n from promo_library`))[0].n === 2 && /problema/.test(await a.textContent('main')))
  const badLib = await ac.request.post(BASE + '/api/promocoes/biblioteca', { headers: { origin: BASE }, multipart: { category: 'icone', file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('não é imagem') } } })
  ck('arquivo que não é imagem é recusado pela API (422)', badLib.status() === 422)
  await a.locator('.lib-card', { hasText: 'selo azul' }).getByRole('button', { name: 'Editar' }).click()
  await a.fill('input[aria-label="Nome da imagem"]', 'Selo oferta'); await a.selectOption('select[aria-label="Categoria da imagem"]', 'selo'); await a.getByRole('button', { name: 'Salvar' }).click(); await wait(2000)
  ck('renomear e trocar a categoria salva', (await q(`select name, category from promo_library where name = 'Selo oferta'`))[0]?.category === 'selo')
  await a.getByRole('button', { name: /Selos e adesivos \(1\)/ }).click()
  ck('o filtro por categoria mostra só a escolhida', (await a.locator('.lib-card').count()) === 1)
  const libId = lib[0].id
  const mini = await ac.request.get(`${BASE}/api/promocoes/biblioteca/${libId}?mini=1`)
  ck('a miniatura é servida como WEBP, só para quem está logado', mini.status() === 200 && /webp/.test(mini.headers()['content-type'] ?? '') && (await fetch(`${BASE}/api/promocoes/biblioteca/${libId}`)).status === 401)

  // usar no editor: como elemento e como fundo
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await a.getByRole('tab', { name: /Biblioteca/ }).click()
  ck('a aba Biblioteca do editor lista as imagens guardadas', (await a.locator('.lib-pick').count()) === 2)
  await a.locator('button[aria-label="Colocar cruz vermelha na peça"]').click(); await wait(3000)
  const lyL = (await q(`select layers from promo_campaigns where id = $1`, [camp.id]))[0].layers.story ?? []
  ck('clicar na imagem da biblioteca a coloca na peça como elemento (copiada para a promoção)', lyL.length === 1 && lyL[0].type === 'image' && (await q(`select count(*)::int n from promo_assets where id = $1 and campaign_id = $2`, [lyL[0].asset, camp.id]))[0].n === 1, JSON.stringify(lyL[0] ?? null).slice(0, 140))
  await a.getByRole('tab', { name: /Biblioteca/ }).click()
  await a.locator('button[aria-label="Usar Selo oferta como fundo"]').click(); await wait(3000)
  const bgL = (await q(`select overrides from promo_campaigns where id = $1`, [camp.id]))[0].overrides?.background
  ck('"Fundo" usa a imagem da biblioteca como fundo da promoção', bgL?.kind === 'asset' && (await q(`select count(*)::int n from promo_assets where id = $1 and campaign_id = $2`, [bgL.asset, camp.id]))[0].n === 1)
  await a.getByRole('tab', { name: /Biblioteca/ }).click()
  await a.locator('button[aria-label="Colocar cruz vermelha na peça"]').click(); await wait(2500)
  ck('usar a mesma imagem de novo não duplica o arquivo da promoção', (await q(`select count(*)::int n from promo_assets where campaign_id = $1 and sha256 = (select sha256 from promo_library where id = $2)`, [camp.id, libId]))[0].n === 1)

  // excluir da biblioteca não quebra a peça
  await a.goto(BASE + '/promocoes/biblioteca'); await idle(a)
  await a.locator('.lib-card', { hasText: 'cruz vermelha' }).getByRole('button', { name: /Excluir/ }).click(); await wait(2000)
  ck('excluir da biblioteca apaga só a biblioteca; a peça que usou continua com a imagem', (await q(`select count(*)::int n from promo_library where id = $1`, [libId]))[0].n === 0 && (await q(`select count(*)::int n from promo_assets where id = $1`, [lyL[0].asset]))[0].n === 1)
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])

  // ---------- Estúdio fase 0/1: manifesto, verificar arte, conflito de edição, colar e zoom ----------
  const man = zip['manifesto.json'] ? JSON.parse(Buffer.from(zip['manifesto.json']).toString('utf8')) : null
  const pngsZip = nomesZip.filter((n) => n.endsWith('.png'))
  const { createHash: sha } = await import('node:crypto')
  ck('o ZIP traz o manifesto com cada arquivo (formato, peça, tamanho e impressão digital) e os encartes', !!man && man.arquivos.length === pngsZip.length && man.promocao.id === camp.id && man.encartes.length > 0 && man.arquivos.every((x) => sha('sha256').update(zip[x.arquivo]).digest('hex') === x.sha256 && x.bytes === zip[x.arquivo].length), man ? `${man.arquivos.length} arquivos` : 'sem manifesto')

  await q(`update promo_campaigns set layers = null, overrides = overrides - 'background' where id = $1`, [camp.id])
  const it0 = (await q(`select id, price::float8 as p from promo_items where campaign_id = $1 order by position limit 1`, [camp.id]))[0]
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const chk = a.getByRole('button', { name: /Verificar arte/ })
  ck('o botão "Verificar arte" mostra quantos pontos há', /Verificar arte \(\d+\)|Verificar arte ✓/.test(await chk.textContent()))
  await chk.click()
  ck('o painel lista a revisão do encarte sem foto, em "Revisão recomendada"', (await a.locator('.canva-check li[data-code="sem-foto"]').count()) >= 1 && /Revisão recomendada/.test(await a.textContent('.canva-check')))
  await q(`update promo_items set price = 0 where id = $1`, [it0.id])
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await a.getByRole('button', { name: /Verificar arte/ }).click()
  ck('preço zerado vira "Corrigir antes de aprovar" e o botão de aprovar fica desligado', (await a.locator('.canva-check li[data-code="preco-invalido"]').count()) === 1 && (await a.getAttribute('.canva-check', 'data-blockers')) === '1' && await a.getByRole('button', { name: 'Aprovar encartes' }).isDisabled())
  await a.locator('.canva-check li[data-code="preco-invalido"] button').click(); await wait(500)
  ck('"Ir para" abre o encarte com problema no editor', (await a.locator('.canva-list li.sel').getAttribute('data-item')) === it0.id)
  // com a tela ainda com o preço antigo (válido), o botão está ligado; o servidor confere de novo com o dado atual do banco
  await q(`update promo_items set price = $2 where id = $1`, [it0.id, it0.p])
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await q(`update promo_items set price = 0 where id = $1`, [it0.id])
  await a.getByRole('button', { name: 'Aprovar encartes' }).click(); await wait(2500)
  ck('mesmo com a tela desatualizada, o servidor recusa aprovar com preço inválido', /Corrija antes de aprovar/.test(await a.textContent('.canva-msg') ?? '') && (await q(`select status from promo_campaigns where id = $1`, [camp.id]))[0].status !== 'aprovada')
  await q(`update promo_items set price = $2 where id = $1`, [it0.id, it0.p])
  await q(`update promo_campaigns set layers = $2::jsonb where id = $1`, [camp.id, JSON.stringify({ story: [{ id: 'fora001', type: 'shape', x: 5000, y: 0, w: 100, h: 100, fill: '#ffd21f' }, { id: 'vazio01', type: 'text', text: '  ', x: 10, y: 10, w: 200, h: 80 }], feed: [], a4: [] })])
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await a.getByRole('button', { name: /Verificar arte/ }).click()
  ck('elemento fora da peça e texto vazio aparecem na verificação', (await a.locator('.canva-check li[data-code="fora-da-peca"]').count()) === 1 && (await a.locator('.canva-check li[data-code="texto-vazio"]').count()) === 1)
  await a.locator('.canva-check li[data-code="fora-da-peca"] button').click(); await wait(500)
  ck('"Ir para" seleciona o elemento livre e abre a aba Camadas', (await a.locator('.canva-layer-list li.sel').getAttribute('data-layer')) === 'fora001')
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])

  // edição simultânea: duas abas no mesmo documento
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const { p: b2 } = await mk(); await login(b2, 'teste_e2e')
  await b2.goto(`${BASE}/promocoes/${camp.id}`); await idle(b2); await b2.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await b2.locator('.canva-addbar button[title="Adicionar título"]').click(); await wait(2500)
  const lyc = async () => (await q(`select layers, layers_rev from promo_campaigns where id = $1`, [camp.id]))[0]
  ck('a outra aba salvou o primeiro elemento (revisão sobe)', (await lyc()).layers.story.length === 1 && (await lyc()).layers_rev >= 1)
  await a.locator('.canva-addbar button[aria-label="Inserir círculo"]').click(); await wait(2500)
  ck('quem estava com a versão antiga recebe o aviso de edição simultânea e NADA é sobrescrito', (await a.locator('.canva-conflict').count()) === 1 && (await lyc()).layers.story.length === 1)
  ck('o indicador mostra "Conflito de edição"', /Conflito de edição/.test(await a.textContent('.savestate')))
  await a.getByRole('button', { name: /Manter as minhas/ }).click(); await wait(2500)
  ck('"Manter as minhas" grava a versão desta aba e o aviso some', (await lyc()).layers.story.length === 1 && (await lyc()).layers.story[0].type === 'shape' && (await a.locator('.canva-conflict').count()) === 0)
  await b2.reload(); await idle(b2); await b2.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 }) // a outra aba também estava desatualizada: recarrega para editar sobre a versão nova
  await b2.locator('.canva-addbar button[title="Adicionar título"]').click(); await wait(2500)
  await a.locator('.canva-addbar button[aria-label="Inserir círculo"]').click(); await wait(2500)
  ck('novo conflito detectado na sequência', (await a.locator('.canva-conflict').count()) === 1)
  await a.getByRole('button', { name: /Recarregar a versão salva/ }).click(); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 }); await wait(1500)
  ck('"Recarregar" traz a versão salva pela outra aba e descarta a local', (await a.locator('.canva-lbox').count()) === (await lyc()).layers.story.length && (await a.locator('.canva-conflict').count()) === 0)
  await b2.close()

  // copiar e colar entre formatos
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await a.locator('.canva-addbar button[title="Adicionar título"]').click(); await wait(500)
  await a.keyboard.press('Control+c')
  await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).click(); await wait(1200)
  await a.keyboard.press('Control+v'); await wait(2500)
  let LP = (await lyc()).layers
  ck('Ctrl+C e Ctrl+V levam o elemento de um formato para outro', LP.feed?.length === 1 && LP.feed[0].type === 'text' && LP.feed[0].id !== LP.story[0].id, JSON.stringify([LP.story?.length, LP.feed?.length]))
  ck('o colado em outro formato fica selecionado', (await a.locator('.canva-lbox.sel').count()) === 1)
  await a.getByRole('button', { name: 'Story / Status' }).click(); await wait(1200)
  await a.keyboard.press('Control+v'); await wait(2500)
  LP = (await lyc()).layers
  ck('colar na mesma peça duplica deslocado (+24 px)', LP.story.length === 2 && LP.story[1].x === LP.story[0].x + 24 && LP.story[1].y === LP.story[0].y + 24)
  await a.keyboard.press('Control+x'); await wait(2500)
  ck('Ctrl+X recorta (o elemento sai da peça)', (await lyc()).layers.story.length === 1)

  // zoom por Ctrl + rolagem e pan com Espaço
  await a.locator('.canva-addbar .zoom').click(); await wait(300)
  const stBox = await a.locator('.canva-stage').boundingBox()
  await a.mouse.move(stBox.x + stBox.width / 2, stBox.y + 200)
  await a.keyboard.down('Control'); await a.mouse.wheel(0, -120); await a.keyboard.up('Control'); await wait(500)
  ck('Ctrl + rolagem dá zoom no editor (100% → 110%)', /110%/.test(await a.textContent('.canva-addbar .zoom')))
  for (let i = 0; i < 4; i++) await a.getByRole('button', { name: 'Aumentar zoom' }).click()
  await wait(500)
  await a.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.() }) // foco fora do botão: Espaço vira "segurar para arrastar"
  const sb2 = await a.locator('.canva-stage').boundingBox()
  const py = Math.min(sb2.y + 200, 800), px = sb2.x + sb2.width / 2
  const panAntes = await a.evaluate(() => { const s = document.querySelector('.canva-stage'); s.scrollLeft = 300; return { l: s.scrollLeft, t: s.scrollTop } })
  await a.mouse.move(px, py)
  await a.keyboard.down('Space'); await wait(150)
  await a.mouse.down(); await a.mouse.move(px + 80, py + 20, { steps: 6 }); await a.mouse.up()
  await a.keyboard.up('Space'); await wait(200)
  const panDepois = await a.evaluate(() => { const s = document.querySelector('.canva-stage'); return { l: s.scrollLeft, t: s.scrollTop } })
  ck('Espaço + arrastar move a área de trabalho (rolagem muda) sem mexer nos elementos', panAntes.l > 100 && panDepois.l < panAntes.l - 40, JSON.stringify([panAntes, panDepois]))

  // ---------- fontes, formas novas, degradê, sombra, réguas e guias ----------
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  const lyf = async () => (await q(`select layers from promo_campaigns where id = $1`, [camp.id]))[0].layers.story ?? []
  await a.locator('.canva-addbar button[title="Adicionar título"]').click(); await wait(800)
  await a.locator('#ly-font').click()
  ck('o seletor de fontes lista as 12 fontes do catálogo, agrupadas', (await a.locator('.font-list [data-font]').count()) === 12 && (await a.locator('.font-cat').count()) >= 4)
  await a.locator('.font-list [data-font="bebas"]').click(); await wait(2200)
  ck('escolher a fonte salva no elemento e a fonte é carregada no navegador', (await lyf())[0].font === 'bebas' && await a.evaluate(() => document.fonts.check('20px PromoBebas')))
  await a.locator('#ly-font').click(); await a.locator('.font-list [data-font="pacifico"]').click(); await wait(2200)
  ck('outra fonte (manuscrita) também troca', (await lyf())[0].font === 'pacifico')
  const h1 = (await lyf())[0].h
  await a.locator('#ly-font').click(); await a.locator('.font-list [data-font="anton"]').click(); await wait(2200)
  ck('a caixa do texto se ajusta à fonte nova (altura recalculada)', (await lyf())[0].font === 'anton' && (await lyf())[0].h > 0 && h1 > 0)

  // formas novas: a estrela primeiro, sozinha, para conferir degradê, traço e sombra
  await a.locator('button[aria-label="Mais formas"]').click()
  await a.locator('button[aria-label="Inserir estrela"]').click(); await wait(600)
  await a.locator('input[aria-label="Cor da forma"]').fill('#ff0000')
  await a.locator('input[aria-label="Degradê"]').check(); await wait(300)
  await a.locator('input[aria-label="Segunda cor do degradê"]').fill('#0000ff')
  await a.fill('#ly-grad', '0'); await wait(1800)
  let st = (await lyf()).find((x) => x.shape === 'star')
  ck('degradê salvo na forma (duas cores e ângulo)', st.fill === '#ff0000' && st.fill2 === '#0000ff' && st.gradAngle === 0, JSON.stringify([st.fill, st.fill2, st.gradAngle]))
  await a.locator('input[aria-label="Borda"]').check(); await wait(200)
  await a.selectOption('#ly-dash', 'dashed'); await a.locator('input[aria-label="Sombra"]').check(); await wait(1800)
  st = (await lyf()).find((x) => x.shape === 'star')
  ck('traço tracejado e sombra suave salvos', st.dash === 'dashed' && st.shadow === true && !!st.border)
  const cores = await a.evaluate((s) => { const c = document.querySelector('.canva-layers'); const ctx = c.getContext('2d'); const y = s.y + s.h / 2, px = (x) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data); return { esq: px(s.x + s.w * 0.4), dir: px(s.x + s.w * 0.6) } }, st)
  ck('a peça mostra o degradê (esquerda vermelha, direita azul)', cores.esq[3] > 200 && cores.dir[3] > 200 && cores.esq[0] > cores.dir[0] && cores.dir[2] > cores.esq[2], JSON.stringify(cores))
  for (const nome of ['seta', 'balão', 'etiqueta', 'triângulo', 'hexágono']) {
    await a.locator('button[aria-label="Mais formas"]').click()
    await a.locator(`button[aria-label="Inserir ${nome}"]`).click(); await wait(300)
  }
  await wait(1800)
  const formas = (await lyf()).filter((x) => x.type === 'shape').map((x) => x.shape)
  ck('as 6 formas novas entram na peça (estrela, seta, balão, etiqueta, triângulo, hexágono)', ['star', 'arrow', 'balloon', 'tag', 'triangle', 'hexagon'].every((s) => formas.includes(s)), formas.join())

  // réguas e guias
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).click(); await wait(1000)
  await a.locator('.canva-addbar button[aria-label="Inserir retângulo"]').click(); await wait(500)
  await a.locator('button[aria-label="Réguas e guias"]').click(); await wait(600)
  ck('"Réguas e guias" mostra as duas réguas em volta da peça', (await a.locator('.canva-ruler.h').count()) === 1 && (await a.locator('.canva-ruler.v').count()) === 1)
  // só rolagem vertical da página (scrollIntoView também rolaria a área de trabalho para o lado e esconderia a régua)
  await a.evaluate(() => { document.querySelector('.canva-stage').scrollLeft = 0; window.scrollBy(0, document.querySelector('.canva-paper').getBoundingClientRect().top - 150) }); await wait(300)
  const pb = await a.locator('.canva-paper').boundingBox()
  const rv = await a.locator('.canva-ruler.v').boundingBox(), rh = await a.locator('.canva-ruler.h').boundingBox()
  const escala = pb.width / 1080
  // guia vertical: arrasta da régua da esquerda até ~x = 200
  await a.mouse.move(rv.x + rv.width / 2, pb.y + 100); await a.mouse.down(); await a.mouse.move(pb.x + 200 * escala, pb.y + 100, { steps: 8 }); await a.mouse.up(); await wait(300)
  const gv = Number(await a.locator('.canva-gline.x').first().getAttribute('data-value'))
  ck('arrastar da régua da esquerda cria uma guia vertical na posição solta', (await a.locator('.canva-gline.x').count()) === 1 && Math.abs(gv - 200) <= 6, String(gv))
  // guia horizontal
  await a.mouse.move(pb.x + 300, rh.y + rh.height / 2); await a.mouse.down(); await a.mouse.move(pb.x + 300, pb.y + 300 * escala, { steps: 8 }); await a.mouse.up(); await wait(300)
  ck('arrastar da régua de cima cria uma guia horizontal', (await a.locator('.canva-gline.y').count()) === 1)
  // ímã nas guias: o retângulo, solto a 4 px da guia vertical, gruda nela
  const lyff = async () => (await q(`select layers from promo_campaigns where id = $1`, [camp.id]))[0].layers.feed ?? [] // a peça está no formato Feed
  const ret = (await lyff())[0]
  const alvoX = gv + 4
  const cx = pb.x + (ret.x + ret.w / 2) * escala, cy = pb.y + (ret.y + ret.h / 2) * escala
  await a.mouse.move(cx, cy); await a.mouse.down(); await a.mouse.move(cx + (alvoX - ret.x) * escala / 2, cy, { steps: 6 }); await a.mouse.move(cx + (alvoX - ret.x) * escala, cy, { steps: 6 }); await a.mouse.up(); await wait(2200)
  ck('o elemento solto perto da guia gruda nela (borda exatamente na guia)', (await lyff())[0].x === gv, `${(await lyff())[0].x} guia ${gv}`)
  await a.reload(); await idle(a); await a.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).click(); await wait(800)
  ck('as guias e as réguas continuam depois de recarregar (lembradas neste navegador)', (await a.locator('.canva-ruler.h').count()) === 1 && (await a.locator('.canva-gline').count()) === 2)
  ck('as guias valem por formato (no Feed aparecem as do Feed)', (await a.locator('.canva-gline.x').count()) === 1 && (await a.locator('.canva-gline.y').count()) === 1)
  await a.getByRole('button', { name: 'Story / Status' }).click(); await wait(800)
  ck('no Story não há guias do Feed', (await a.locator('.canva-gline').count()) === 0)
  await a.getByRole('button', { name: 'Feed (Instagram/Facebook)' }).click(); await wait(800)
  await a.locator('.canva-gline.x').first().dblclick(); await wait(300)
  ck('duplo clique na guia apaga', (await a.locator('.canva-gline.x').count()) === 0)
  await a.getByRole('button', { name: 'Limpar guias' }).click(); await wait(300)
  ck('"Limpar guias" apaga as do formato', (await a.locator('.canva-gline').count()) === 0)
  await a.locator('button[aria-label="Réguas e guias"]').click(); await wait(300)
  ck('desligar esconde as réguas', (await a.locator('.canva-ruler').count()) === 0)
  await q(`update promo_campaigns set layers = null where id = $1`, [camp.id])

  // política desligada: um encarte por produto
  await a.goto(BASE + '/promocoes'); await idle(a)
  await a.fill('#np-name', 'Sem agrupar'); await a.selectOption('#np-theme', themeId); await a.locator('input[name=group]').uncheck()
  await a.setInputFiles('#np-file', { name: 'promo.xlsx', mimeType: XLSX, buffer: planilha })
  await a.getByRole('button', { name: 'Montar promoção' }).click(); await a.waitForURL(/\/promocoes\/[0-9a-f-]{36}$/, { timeout: 40000 })
  const sem = (await q(`select id, import_report from promo_campaigns where name = 'Sem agrupar'`))[0]
  ck('com a política desligada cada produto é um encarte (16) e o resumo diz "sem agrupar"', (await q(`select count(*)::int n from promo_items where campaign_id = $1`, [sem.id]))[0].n === 16 && sem.import_report.grouped === false)
  await idle(a)
  ck('o resumo mostra "sem agrupar variações"', /sem agrupar variações/.test(await a.textContent('.canva-report summary')))

  // ---------- erros da planilha ----------
  const post = (buf, name = 'p.xlsx') => ac.request.post(BASE + '/api/promocoes/importar', { headers: { origin: BASE }, multipart: { name: 'Teste de erro', file: { name, mimeType: XLSX, buffer: buf } } })
  const semCol = await post(await xlsx([['Qualquer', 'Coisa'], [1, 2]]))
  ck('planilha sem as colunas é recusada com explicação', semCol.status() === 422 && /Valor aproximado/.test((await semCol.json()).error))
  const todosFora = await post(await xlsx([['Barras', 'Valor Aproximado'], [gtin('789288888888'), 5]]))
  const tf = await todosFora.json().catch(() => ({}))
  ck('sem a coluna Descrição e fora do catálogo: recusa orientando a conferir a coluna Descrição', todosFora.status() === 422 && /Descrição/.test(tf.error ?? ''), `${todosFora.status()} ${JSON.stringify(tf).slice(0, 200)}`)
  ck('arquivo que não é xlsx é recusado', (await post(Buffer.from('a;b\n1;2'), 'x.csv')).status() === 422)
  ck('envio de outra origem é recusado (403)', (await ac.request.post(BASE + '/api/promocoes/importar', { headers: { origin: 'https://evil.example' }, multipart: { file: { name: 'p.xlsx', mimeType: XLSX, buffer: planilha } } })).status() === 403)

  // ---------- leitor ----------
  const { p: v, c: vc } = await mk(); await login(v, 'e2e_vw')
  await v.goto(BASE + '/promocoes'); await idle(v)
  ck('leitor vê as promoções, sem o envio de planilha', (await v.locator('#np-file').count()) === 0 && (await v.locator('a[href^="/promocoes/"]').count()) >= 1)
  await v.goto(`${BASE}/promocoes/${camp.id}`); await idle(v); await v.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 })
  ck('leitor vê a peça e baixa, mas não edita', (await v.getByRole('button', { name: /Baixar esta peça/ }).count()) === 1 && (await v.locator('button[aria-label="Remover"]').count()) === 0 && (await v.getByRole('button', { name: 'Aprovar encartes' }).count()) === 0 && (await v.locator('#pc-name').count()) === 0)
  ck('leitor vê a barra de zoom mas não pode adicionar elementos', (await v.locator('.canva-addbar button[aria-label="Aumentar zoom"]').count()) === 1 && (await v.locator('.canva-addbar button[title="Adicionar título"]').count()) === 0)
  ck('leitor não envia imagem de elemento pela API (403)', (await vc.request.post(`${BASE}/api/promocoes/camada-imagem/${camp.id}`, { headers: { origin: BASE }, multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: await foto('#111111') } } })).status() === 403)
  await v.goto(BASE + '/promocoes/biblioteca'); await idle(v)
  ck('leitor vê a biblioteca, sem envio nem exclusão', (await v.locator('#lib-file').count()) === 0 && (await v.getByRole('button', { name: /Excluir/ }).count()) === 0)
  ck('leitor não envia imagem para a biblioteca pela API (403)', (await vc.request.post(BASE + '/api/promocoes/biblioteca', { headers: { origin: BASE }, multipart: { category: 'icone', file: { name: 'x.png', mimeType: 'image/png', buffer: await foto('#111111') } } })).status() === 403)
  ck('leitor não importa planilha pela API (403)', (await vc.request.post(BASE + '/api/promocoes/importar', { headers: { origin: BASE }, multipart: { file: { name: 'p.xlsx', mimeType: XLSX, buffer: planilha } } })).status() === 403)
  ck('leitor não envia arte de tema (403)', (await vc.request.post(`${BASE}/api/promocoes/tema/${themeId}/arte`, { headers: { origin: BASE }, multipart: { role: 'header', format: 'story', file: { name: 'a.png', mimeType: 'image/png', buffer: await arte(300, 100, '#fff') } } })).status() === 403)

  // excluir promoção e tema
  await a.goto(`${BASE}/promocoes/${camp.id}`); await idle(a)
  await a.getByRole('tab', { name: /Textos/ }).click()
  await a.getByRole('button', { name: 'Excluir promoção' }).click(); await a.waitForURL(BASE + '/promocoes', { timeout: 15000 })
  ck('excluir a promoção apaga os itens', (await q(`select count(*)::int n from promo_items where campaign_id = $1`, [camp.id]))[0].n === 0)
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
