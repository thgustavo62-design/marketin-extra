// @title: Apresentações (PPTX/PDF enviados em partes, visualizador, tela cheia, permissões)
// @needs:
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
const req = createRequire(new URL('../../package.json', import.meta.url))
const pg = req('pg'), sharp = req('sharp'), { PDFDocument } = req('pdf-lib')

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

// PDF de 3 páginas com uma imagem de ruído (~6 MB): obriga o envio em mais de uma parte
async function pdfGrande() {
  const noise = await sharp(Buffer.alloc(1500 * 1500 * 3).map(() => Math.floor(Math.random() * 256)), { raw: { width: 1500, height: 1500, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer()
  const doc = await PDFDocument.create()
  const img = await doc.embedPng(noise)
  for (let i = 1; i <= 3; i++) {
    const p = doc.addPage([960, 540])
    p.drawText(`Slide ${i}`, { x: 60, y: 460, size: 48 })
    if (i === 1) p.drawImage(img, { x: 500, y: 100, width: 300, height: 300 })
  }
  return Buffer.from(await doc.save())
}

try {
  const { p: a, c: ac } = await mk(); await login(a, 'teste_e2e')
  ck('menu tem "Apresentações"', (await a.textContent('.side-nav')).includes('Apresentações'))
  await a.goto(BASE + '/resultados/apresentacoes'); await idle(a)
  ck('tela de apresentações tem o envio', (await a.locator('#ap-file').count()) === 1)

  // ---------- envio de PDF grande (várias partes) ----------
  const pdf = await pdfGrande()
  ck('o PDF de teste passa de 3,5 MB (mais de uma parte)', pdf.length > 3.5 * 1024 * 1024, pdf.length)
  await a.setInputFiles('#ap-file', { name: 'Relatorio_de_Teste.pdf', mimeType: 'application/pdf', buffer: pdf })
  ck('o título vem do nome do arquivo', (await a.inputValue('#ap-title')) === 'Relatorio de Teste')
  await a.getByRole('button', { name: /Enviar apresentação/ }).click()
  await a.waitForSelector('.pres-card', { timeout: 60000 })
  const row = (await q(`select id, kind, status, chunk_count, size_bytes::float8 as size, sha256 from presentations where title = 'Relatorio de Teste'`))[0]
  ck('a apresentação ficou pronta, tipo pdf, com as partes e a impressão digital', row?.status === 'ready' && row.kind === 'pdf' && row.chunk_count >= 2 && !!row.sha256 && row.size === pdf.length, JSON.stringify(row))
  ck('todas as partes estão guardadas', (await q(`select count(*)::int n, sum(length(data))::float8 s from presentation_chunks where presentation_id = $1`, [row.id]))[0].s === pdf.length)

  // ---------- visualizador ----------
  await a.locator('.pres-card a:has-text("Apresentar")').first().click()
  await a.waitForSelector('.pres[data-status="ready"]', { timeout: 60000 })
  ck('o visualizador abre o PDF e mostra "1 / 3"', /1 \/ 3/.test(await a.textContent('.pres-count')) && (await a.locator('.pres-host canvas').count()) === 1)
  await a.waitForFunction(() => { const c = document.querySelector('.pres-host canvas'); return !!c && c.width > 100 })
  await a.keyboard.press('ArrowRight'); await wait(800)
  ck('seta para a direita passa o slide', (await a.getAttribute('.pres', 'data-index')) === '1' && /2 \/ 3/.test(await a.textContent('.pres-count')))
  await a.keyboard.press('End'); await wait(500)
  ck('End vai ao último e não passa dele', (await a.getAttribute('.pres', 'data-index')) === '2')
  await a.keyboard.press('ArrowRight'); await wait(300)
  ck('no último slide a seta não avança', (await a.getAttribute('.pres', 'data-index')) === '2')
  await a.keyboard.press('Home'); await wait(500)
  await a.locator('.pres-rail button[aria-label="Ir para o slide 3"]').click(); await wait(500)
  ck('as bolinhas numeradas pulam para o slide', (await a.getAttribute('.pres', 'data-index')) === '2')
  const pixels = await a.evaluate(() => { const c = document.querySelector('.pres-host canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++; return dark })
  ck('o slide foi realmente desenhado (tem texto escuro sobre o fundo)', pixels > 200, pixels)
  const [dl] = await Promise.all([a.waitForEvent('download'), a.locator('button[aria-label="Baixar o arquivo original"]').click()])
  ck('baixar devolve o arquivo original, byte a byte', Buffer.compare(await readFile(await dl.path()), pdf) === 0 && dl.suggestedFilename() === 'Relatorio_de_Teste.pdf')
  await a.getByRole('button', { name: /Apresentar/ }).first().click(); await wait(1200)
  const full = await a.evaluate(() => !!document.fullscreenElement)
  ck('"Apresentar" entra em tela cheia', full && (await a.locator('.pres.full').count()) === 1)
  if (full) {
    await a.keyboard.press('ArrowLeft'); await wait(500)
    ck('em tela cheia o teclado continua passando os slides', (await a.getAttribute('.pres', 'data-index')) === '1')
    await a.getByRole('button', { name: /Sair da tela cheia/ }).click(); await wait(800)
    ck('o botão "Sair da tela cheia" volta à janela normal', (await a.locator('.pres.full').count()) === 0 && !(await a.evaluate(() => !!document.fullscreenElement)))
  }

  // ---------- PPTX real (se existir na máquina) ----------
  const pptxPath = 'C:/Users/Admin/Downloads/Farma_e_Farma_Analise_Geral.pptx'
  if (existsSync(pptxPath)) {
    const pptx = await readFile(pptxPath)
    await a.goto(BASE + '/resultados/apresentacoes'); await idle(a)
    await a.locator('summary', { hasText: 'Enviar apresentação' }).click()
    await a.setInputFiles('#ap-file', { name: 'Analise Geral.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx })
    await a.getByRole('button', { name: /Enviar apresentação/ }).click()
    await a.waitForFunction(() => document.querySelectorAll('.pres-card').length >= 2, null, { timeout: 60000 })
    const pr = (await q(`select id, kind from presentations where title = 'Analise Geral'`))[0]
    ck('PPTX enviado e reconhecido pelo conteúdo', pr?.kind === 'pptx')
    await a.goto(`${BASE}/resultados/apresentacoes/${pr.id}`); await a.waitForSelector('.pres[data-status="ready"]', { timeout: 60000 })
    ck('o PPTX abre com todos os slides (15) e o primeiro desenhado', /1 \/ 15/.test(await a.textContent('.pres-count')) && (await a.locator('.pres-host .pptx-preview-slide-wrapper').count()) === 1)
    ck('o texto do slide aparece', /Análise Geral Integrada/.test(await a.textContent('.pres-host')))
    await a.keyboard.press('ArrowRight'); await wait(600)
    ck('passa para o segundo slide do PPTX', (await a.getAttribute('.pres', 'data-index')) === '1' && (await a.locator('.pres-host .pptx-preview-slide-wrapper').count()) === 1)
    const dim = await a.evaluate(() => { const s = document.querySelector('.pres-host .pptx-preview-slide-wrapper').getBoundingClientRect(); const st = document.querySelector('.pres-stage').getBoundingClientRect(); return { sw: s.width, sh: s.height, tw: st.width, th: st.height } })
    ck('o slide é escalado para caber na tela mantendo a proporção 16:9', dim.sw <= dim.tw + 1 && dim.sh <= dim.th + 1 && Math.abs(dim.sw / dim.sh - 16 / 9) < 0.03, JSON.stringify(dim))
  } else console.log('SKIP  PPTX real não encontrado nesta máquina')

  // ---------- recusas e permissões ----------
  const ok = { origin: BASE, 'content-type': 'application/json' }
  const bad = await ac.request.post(BASE + '/api/apresentacoes', { headers: ok, data: { title: 'Falso', fileName: 'falso.pdf', kind: 'pdf', size: 20, chunks: 1 } })
  const badId = (await bad.json()).id
  ck('início de envio válido cria o registro', bad.status() === 200 && !!badId)
  const wrongSize = await ac.request.put(`${BASE}/api/apresentacoes/${badId}/parte/0`, { headers: { origin: BASE }, data: Buffer.from('curto') })
  ck('parte com tamanho diferente do combinado é recusada (400)', wrongSize.status() === 400)
  await ac.request.put(`${BASE}/api/apresentacoes/${badId}/parte/0`, { headers: { origin: BASE, 'content-type': 'application/octet-stream' }, data: Buffer.from('isto nao e um pdf!!!') })
  const fin = await ac.request.post(`${BASE}/api/apresentacoes/${badId}/concluir`, { headers: { origin: BASE } })
  ck('arquivo que não é PDF/PPTX de verdade é recusado ao concluir (422) e o envio é apagado', fin.status() === 422 && (await q(`select count(*)::int n from presentations where id = $1`, [badId]))[0].n === 0)
  ck('tamanho incoerente com as partes é recusado', (await ac.request.post(BASE + '/api/apresentacoes', { headers: ok, data: { title: 'X1', fileName: 'x.pdf', kind: 'pdf', size: 99999999999, chunks: 1 } })).status() === 422)
  ck('tipo que não é PPTX/PDF é recusado', (await ac.request.post(BASE + '/api/apresentacoes', { headers: ok, data: { title: 'X2', fileName: 'x.docx', kind: 'docx', size: 10, chunks: 1 } })).status() === 422)
  ck('envio de outra origem é recusado (403)', (await ac.request.post(BASE + '/api/apresentacoes', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, data: { title: 'X3', fileName: 'x.pdf', kind: 'pdf', size: 10, chunks: 1 } })).status() === 403)
  ck('sem login a parte do arquivo não sai (401)', (await fetch(`${BASE}/api/apresentacoes/${row.id}/parte/0`)).status === 401)

  const { p: v, c: vc } = await mk(); await login(v, 'e2e_vw')
  await v.goto(BASE + '/resultados/apresentacoes'); await idle(v)
  ck('leitor vê a biblioteca e abre, mas sem envio nem exclusão', (await v.locator('.pres-card').count()) >= 1 && (await v.locator('#ap-file').count()) === 0 && (await v.getByRole('button', { name: 'Excluir' }).count()) === 0)
  ck('leitor não inicia envio pela API (403)', (await vc.request.post(BASE + '/api/apresentacoes', { headers: ok, data: { title: 'Leitor', fileName: 'l.pdf', kind: 'pdf', size: 10, chunks: 1 } })).status() === 403)
  const vr = await vc.request.get(`${BASE}/api/apresentacoes/${row.id}/parte/0`)
  ck('leitor consegue ler a apresentação (parte do arquivo)', vr.status() === 200)

  // ---------- excluir ----------
  await a.goto(BASE + '/resultados/apresentacoes'); await idle(a)
  const antes = await a.locator('.pres-card').count()
  await a.locator(`.pres-card[data-id="${row.id}"]`).getByRole('button', { name: 'Excluir' }).click()
  await a.waitForFunction((n) => document.querySelectorAll('.pres-card').length === n - 1, antes, { timeout: 15000 })
  ck('excluir apaga a apresentação e todas as partes do arquivo', (await q(`select count(*)::int n from presentations where id = $1`, [row.id]))[0].n === 0 && (await q(`select count(*)::int n from presentation_chunks where presentation_id = $1`, [row.id]))[0].n === 0)
  await q(`delete from presentations where title = 'Analise Geral'`)
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
