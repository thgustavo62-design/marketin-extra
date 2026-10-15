// @title: Botão de coleta do Windsor nas telas de resultados
// @needs: windsor
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
const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1500, height: 950 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); return p }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }
const scope = async (p, name) => { await p.selectOption('select[aria-label="Filial"]', { label: name }); await p.waitForLoadState('networkidle'); await wait(300) }
const PAGES = [['/', 'Dashboard'], ['/?v=exec', 'Dashboard executivo'], ['/resultados', 'Insights'], ['/resultados/instagram', 'Instagram'], ['/resultados/meta-ads', 'Meta Ads'], ['/resultados/vinculos', 'Publicações vinculadas']]
try {
  const a = await mk(); await login(a, 'teste_e2e'); await scope(a, 'Farma e Farma')
  for (const [path, name] of PAGES) {
    await a.goto(BASE + path); await idle(a)
    const hasBtn = (await a.getByRole('button', { name: /Coletar métricas agora/ }).count()) === 1
    const panel = path === '/resultados/vinculos' ? true : (await a.locator('[data-collect-panel]').count()) === 1
    ck(`${name}: editor/admin vê o botão de coletar (um só) ${path === '/resultados/vinculos' ? '' : 'e a faixa da última coleta'}`, hasBtn && panel)
  }

  // visual: botão e texto dentro do painel, sem estourar
  await a.goto(BASE + '/resultados'); await idle(a)
  const pb = await a.locator('[data-collect-panel]').boundingBox()
  const btn = await a.getByRole('button', { name: /Coletar métricas agora/ }).boundingBox()
  ck('visual: botão cabe dentro da faixa', btn.x >= pb.x && btn.x + btn.width <= pb.x + pb.width + 1 && btn.y >= pb.y && btn.y + btn.height <= pb.y + pb.height + 1, JSON.stringify({ pb, btn }))
  await a.screenshot({ path: (process.env.E2E_OUT || '.') + '/f10-insights.png' })

  // coleta real
  const lastBefore = (await q(`select greatest((select max(s.collected_at) from publication_metric_snapshots s join external_publications e on e.id = s.publication_id join brands b on b.id = e.brand_id where b.name = 'Farma e Farma'), (select max(a.collected_at) from account_metric_snapshots a join brands b on b.id = a.brand_id where b.name = 'Farma e Farma'))::text as m`))[0].m
  const t0 = Date.now()
  await a.getByRole('button', { name: /Coletar métricas agora/ }).click()
  await a.locator('.collect-button .form-ok, .collect-button .form-error').first().waitFor({ timeout: 90000 })
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  const msg = await a.locator('.collect-button .form-ok, .collect-button .form-error').first().textContent()
  const rateLimited = /menos de 5 minutos/.test(msg)
  const lastAfter = (await q(`select greatest((select max(s.collected_at) from publication_metric_snapshots s join external_publications e on e.id = s.publication_id join brands b on b.id = e.brand_id where b.name = 'Farma e Farma'), (select max(a.collected_at) from account_metric_snapshots a join brands b on b.id = a.brand_id where b.name = 'Farma e Farma'))::text as m`))[0].m
  console.log(`coleta: ${secs}s | ${msg.slice(0, 220)}`)
  ck('a coleta termina com mensagem clara ', /Coleta concluída/.test(msg), msg)
  if (/Coleta concluída/.test(msg)) {
    ck('a coleta gravou no banco (data da última coleta avançou)', lastAfter !== lastBefore, `${lastBefore} -> ${lastAfter}`)
    const expected = new Date(lastAfter.replace(' ', 'T').replace(/\+00$/, 'Z')).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    const fresh = await a.waitForFunction((d) => (document.querySelector('[data-collect-panel] > p')?.textContent ?? '').includes('Última coleta guardada no sistema: ' + d), expected, { timeout: 20000 }).then(() => true).catch(() => false)
    ck('a faixa passa a mostrar o horário exato da coleta de agora sem recarregar a página', fresh, expected + ' | ' + (await a.locator('[data-collect-panel] > p').textContent()).slice(0, 110))
  }
  // segunda coleta logo em seguida: sem limite de intervalo, funciona e não duplica o retrato do dia
  await a.reload(); await idle(a)
  await a.getByRole('button', { name: /Coletar métricas agora/ }).click()
  await a.locator('.collect-button .form-ok, .collect-button .form-error').first().waitFor({ timeout: 90000 })
  ck('segunda coleta seguida também funciona (sem limite de intervalo)', /Coleta concluída/.test(await a.locator('.collect-button .form-ok, .collect-button .form-error').first().textContent()))
  ck('nenhum retrato duplicado no mesmo dia', (await q('select count(*)::int n from (select publication_id, collected_on from publication_metric_snapshots group by 1,2 having count(*) > 1) x'))[0].n === 0)

  // leitor: vê a faixa e a data, mas não o botão
  const v = await mk(); await login(v, 'e2e_vw'); await scope(v, 'Farma e Farma')
  for (const [path, name] of PAGES.slice(0, 5)) {
    await v.goto(BASE + path); await idle(v)
    ck(`${name}: leitor vê a última coleta, mas não o botão`, (await v.locator('[data-collect-panel]').count()) === 1 && (await v.getByRole('button', { name: /Coletar métricas agora/ }).count()) === 0 && /Peça a um editor/.test(await v.locator('[data-collect-panel]').textContent()))
  }
} catch (e) { console.log('FAIL  execução sem exceção  ->', String(e).slice(0, 300)); R.push(false) }
finally { await browser.close(); await db.end(); console.log(`${R.filter(Boolean).length}/${R.length} verificações passaram`) }
