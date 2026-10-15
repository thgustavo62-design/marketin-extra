// @title: Alertas, relatórios (tela/PDF/CSV) e Dashboard executivo
// @needs: 
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
const req = createRequire(new URL('../../package.json', import.meta.url))
const pg = req('pg'), { PDFDocument } = req('pdf-lib')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 260) : ''}`) }
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
const item = (p, text) => p.locator('.alert-list li', { hasText: text })
const bell = async (p) => { const t = await p.locator('a.bell').getAttribute('aria-label'); const m = /(\d+) não lidos/.exec(t ?? ''); return m ? Number(m[1]) : 0 }
const reevaluate = async (p) => {
  await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/alertas'), { timeout: 60000 }), p.getByRole('button', { name: 'Reavaliar agora' }).click()])
  await wait(800); await p.reload(); await idle(p)
}

try {
  const minas = (await q(`select id from brands where name = 'Minas Farma'`))[0].id
  const farma = (await q(`select id from brands where name = 'Farma e Farma'`))[0].id
  const admin = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id
  const today = day(0)

  // ---------- dados de teste ----------
  const mkPost = async (title, date, stage, owner = null, format = 'feed') =>
    (await q(`insert into posts (brand_id, title, post_date, format, pillar, stage, assigned_to, created_by) values ($1,$2,$3,$4,'institucional',$5,$6,$7) returning id`, [minas, title, date, format, stage, owner, admin]))[0].id
  const pLate = await mkPost('E2E Atrasado', day(-6), 'producao', admin)
  const pNoOwner = await mkPost('E2E Sem dono', day(3), 'briefing')
  const pStale = await mkPost('E2E Aprov parada', day(5), 'aprovacao', admin)
  const ver = (await q(`insert into content_versions (post_id, version_number, title, caption, script, content_checksum, created_by) values ($1,1,'E2E','','','x',$2) returning id`, [pStale, admin]))[0].id
  await q(`insert into approvals (post_id, brand_id, version_id, submitted_by, status, created_at) values ($1,$2,$3,$4,'pending', now() - interval '100 hours')`, [pStale, minas, ver, admin])
  const pNoArt = await mkPost('E2E Sem arte', day(1), 'aprovado', admin)
  const pArt = await mkPost('E2E Com arte', day(1), 'aprovado', admin)
  const asset = (await q(`insert into media_assets (brand_id, kind, title, external_url, uploaded_by) values ($1,'link','E2E arte final','https://example.com/final',$2) returning id`, [minas, admin]))[0].id
  await q(`insert into content_asset_links (post_id, asset_id, brand_id, role, sort_order, linked_by) values ($1,$2,$3,'final',0,$4)`, [pArt, asset, minas, admin])
  await mkPost('E2E Semana publicado', today, 'publicado', admin, 'reels')
  const stalePub = (await q(`insert into external_publications (brand_id, platform, external_account_id, account_name, external_media_id, permalink, media_type, media_product_type, caption_excerpt, published_at)
    values ($1,'instagram','E2E-acc','E2E minas','E2E-r1','https://www.instagram.com/p/E2Er1/','VIDEO','REELS','Legenda r1',$2) returning id`, [minas, `${day(-20)}T15:00:00Z`]))[0].id
  await q(`insert into publication_metric_snapshots (publication_id, collected_on, collected_at, window_start, window_end, reach, views, likes, comments, saves, shares, data_quality) values ($1,$2, now() - interval '10 days', $3,$2, 1000, 3000, 50, null, 20, 10, 'partial')`, [stalePub, day(-10), day(-20)])
  const zeroPub = (await q(`insert into external_publications (brand_id, platform, external_account_id, account_name, external_media_id, permalink, media_type, media_product_type, caption_excerpt, published_at)
    values ($1,'instagram','E2E-acc','E2E minas','E2E-z1','https://www.instagram.com/p/E2Ez1/','IMAGE','FEED','Legenda z1',$2) returning id`, [minas, `${day(-5)}T15:00:00Z`]))[0].id
  await q(`insert into publication_metric_snapshots (publication_id, collected_on, collected_at, window_start, window_end, reach, views, likes, comments, saves, shares, data_quality) values ($1,$2, now() - interval '10 days', $3,$2, 0, 0, 0, 0, 0, 0, 'complete')`, [zeroPub, day(-10), day(-5)])
  const failedRun = (await q(`insert into integration_sync_runs (provider, job_type, brand_id, status, finished_at, error_summary_safe, requested_by) values ('windsor','collect_metrics',$1,'failed',now(),'Não foi possível ler o Windsor agora. E2E',$2) returning id`, [minas, admin]))[0].id
  const elapsed = Number(today.slice(8))
  await q(`insert into brand_targets (brand_id, period_start, period_end, metric_key, target_value, unit, expected_source, notes, created_by) values ($1,$2,$3,'posts_published',500,'count','internal','E2E ritmo',$4)`,
    [minas, `${today.slice(0, 7)}-01`, new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10), admin])

  // =============== ADMIN: alertas ===============
  const { p: a } = await mk()
  await login(a, 'teste_e2e')
  await scope(a, 'Minas Farma')
  await a.goto(BASE + '/alertas'); await idle(a)
  ck('menu tem Alertas e o sino está no cabeçalho', (await a.textContent('.side-nav')).includes('Alertas') && (await a.locator('a.bell').count()) === 1)
  await reevaluate(a)
  const expected = [
    ['Atrasado: E2E Atrasado', 'post_overdue', 'critical'], ['Sem responsável: E2E Sem dono', 'post_no_owner', 'warning'], ['Aprovação parada: E2E Aprov parada', 'approval_stale', 'critical'],
    ['Sem arte final: E2E Sem arte', 'final_missing', 'warning'],
    ['Dados do Windsor desatualizados: Minas Farma', 'integration_stale', 'info'], ['Falha na coleta de métricas', 'collect_failed', 'warning'],
  ]
  for (const [title, type, sev] of expected) {
    const li = item(a, title)
    const ok = (await li.count()) === 1 && (await li.getAttribute('data-type')) === type && (await li.getAttribute('data-severity')) === sev
    ck(`alerta: ${title} (${sev})`, ok, ok ? '' : `count=${await li.count()}`)
  }
  ck('arte final presente não gera alerta (E2E Com arte)', (await item(a, 'E2E Com arte').count()) === 0)
  ck('conteúdo publicado no dia não gera alerta', (await item(a, 'E2E Semana publicado').count()) === 0)
  const paced = await item(a, 'Meta abaixo do ritmo').count()
  ck(elapsed >= 10 ? 'meta fora do ritmo gera alerta (mês com 10+ dias)' : 'meta com poucos dias de mês NÃO gera alerta (dado insuficiente)', elapsed >= 10 ? paced === 1 : paced === 0, `dia ${elapsed}, alertas=${paced}`)
  ck('alerta leva ao registro: link do atrasado abre o cartão', (await item(a, 'Atrasado: E2E Atrasado').locator('a').first().getAttribute('href')) === `/producao?abrir=${pLate}`)

  // ---------- idempotência ----------
  const countKeys = async () => (await q(`select count(*)::int n, count(distinct dedupe_key)::int d from notification_events where title like '%E2E%' or detail like '%E2E%'`))[0]
  const k1 = await countKeys()
  await reevaluate(a); await reevaluate(a)
  const k2 = await countKeys()
  ck('reavaliar de novo não duplica alertas (mesma condição = mesmo alerta)', k1.n === k2.n && k2.n === k2.d, JSON.stringify([k1, k2]))

  // ---------- sino, ler, dispensar, reabrir ----------
  const dbUnread = async (uid) => (await q(`select count(*)::int n from notification_events e left join notification_user_state s on s.event_id = e.id and s.user_id = $1
    where e.resolved_at is null and s.read_at is null and s.dismissed_at is null`, [uid]))[0].n
  const before = await bell(a)
  ck('contador do sino bate com os alertas não lidos do banco', before === (await dbUnread(admin)) && before >= 7, `${before}`)
  await item(a, 'Sem responsável: E2E Sem dono').getByRole('button', { name: 'Marcar como lido' }).click()
  await a.waitForFunction(() => document.querySelectorAll('.alert-list li').length >= 0); await wait(1500); await a.reload(); await idle(a)
  ck('marcar como lido: sai de "Ativos" e o sino diminui', (await item(a, 'Sem responsável: E2E Sem dono').count()) === 0 && (await bell(a)) === before - 1)
  await a.goto(BASE + '/alertas?s=lidos'); await idle(a)
  ck('aparece em "Lidos"', (await item(a, 'Sem responsável: E2E Sem dono').count()) === 1)
  await item(a, 'Sem responsável: E2E Sem dono').getByRole('button', { name: 'Reabrir' }).click(); await wait(1500)
  await a.goto(BASE + '/alertas'); await idle(a)
  ck('reabrir devolve para "Ativos"', (await item(a, 'Sem responsável: E2E Sem dono').count()) === 1 && (await bell(a)) === before)
  await item(a, 'Dados do Windsor desatualizados: Minas Farma').getByRole('button', { name: 'Dispensar' }).click(); await wait(1500)
  await a.goto(BASE + '/alertas?s=dispensados'); await idle(a)
  ck('dispensar move para "Dispensados"', (await item(a, 'Dados do Windsor desatualizados').count()) === 1)
  await a.goto(BASE + '/alertas?sev=critical'); await idle(a)
  ck('filtro por severidade mostra só críticos', (await a.locator('.alert-list li').count()) >= 2 && (await a.locator('.alert-list li[data-severity="warning"]').count()) === 0)
  await a.goto(BASE + '/alertas?tipo=final_missing'); await idle(a)
  ck('filtro por tipo', (await a.locator('.alert-list li').count()) >= 1 && (await a.locator('.alert-list li:not([data-type="final_missing"])').count()) === 0)

  // ---------- resolução automática ----------
  await q(`update posts set stage = 'publicado' where id = $1`, [pLate])
  await q(`insert into integration_sync_runs (provider, job_type, brand_id, status, finished_at, records_processed, requested_by) values ('windsor','collect_metrics',$1,'ok',now() + interval '1 second',3,$2)`, [minas, admin])
  await a.goto(BASE + '/alertas'); await idle(a); await reevaluate(a)
  ck('condição resolvida: o atraso some de "Ativos"', (await item(a, 'Atrasado: E2E Atrasado').count()) === 0)
  ck('coleta bem-sucedida depois da falha resolve o alerta de falha', (await item(a, 'Falha na coleta de métricas').count()) === 0)
  await a.goto(BASE + '/alertas?s=resolvidos'); await idle(a)
  ck('alertas resolvidos ficam consultáveis em "Resolvidos"', (await item(a, 'Atrasado: E2E Atrasado').count()) === 1 && (await item(a, 'Falha na coleta de métricas').count()) === 1)

  // ---------- por pessoa e por filial ----------
  const { p: e } = await mk(); await login(e, 'e2e_ed'); await scope(e, 'Minas Farma')
  await e.goto(BASE + '/alertas'); await idle(e)
  ck('a leitura de uma pessoa não muda a do colega (editor ainda vê o alerta lido pelo admin)', (await item(e, 'Sem responsável: E2E Sem dono').count()) === 1)
  const edId = (await q(`select id from users where username_normalized = 'e2e_ed'`))[0].id
  await q(`update users set brand_ids = $1 where username_normalized = 'e2e_vw'`, [[farma]])
  const { p: v, c: vc } = await mk(); await login(v, 'e2e_vw')
  await v.goto(BASE + '/alertas'); await idle(v)
  const vtxt = await v.textContent('main')
  ck('usuário só da Farma e Farma não vê nenhum alerta da Minas Farma', !vtxt.includes('E2E Sem dono') && !vtxt.includes('E2E Modelo') && !vtxt.includes('E2E Aprov'))
  const vbell = await bell(v)
  ck('o sino dele não conta alertas da Minas Farma', vbell === (await q(`select count(*)::int n from notification_events e where e.resolved_at is null and e.brand_id = $1`, [farma]))[0].n)
  await q(`update users set brand_ids = null where username_normalized = 'e2e_vw'`)

  // =============== DASHBOARD ===============
  await a.goto(BASE + '/'); await idle(a)
  ck('dashboard operacional mostra "Hoje e esta semana" e alertas', (await a.textContent('main')).includes('Hoje e esta semana'))
  await a.getByRole('link', { name: 'Executiva' }).click(); await a.waitForURL(/v=exec/); await idle(a)
  const ex = await a.textContent('main')
  ck('visão executiva: cartão da filial com N/D onde não há dado e aviso de que são dados guardados', ex.includes('Minas Farma') && /dados guardados|coletas guardadas/.test(ex) && ex.includes('N/D'))
  ck('cada cartão da visão executiva abre uma listagem', (await a.locator('.exec-grid a.kpi').count()) === 6 && (await a.locator('.exec-grid a.kpi[href="/planejamento/conteudos?etapa=publicado"]').count()) === 1)
  await a.goto(BASE + '/'); await idle(a); await wait(800)
  ck('a última visão escolhida é lembrada neste navegador', /v=exec/.test(a.url()), a.url())
  await a.getByRole('link', { name: 'Operacional' }).click(); await a.waitForURL(/v=op/); await idle(a)

  // =============== RELATÓRIOS ===============
  const gen = async (p, o) => {
    await p.goto(BASE + '/resultados/relatorios'); await idle(p)
    await p.selectOption('#rp-type', o.type); await p.selectOption('#rp-preset', 'custom')
    await p.fill('#rp-from', o.from ?? day(-10)); await p.fill('#rp-to', o.to ?? day(0))
    if (o.format) await p.selectOption('#rp-format', o.format)
    await p.click('form button.primary')
    await p.waitForURL(/\/resultados\/relatorios\/[0-9a-f-]{36}/, { timeout: 60000 }); await idle(p)
    return p.url().match(/relatorios\/([0-9a-f-]{36})/)[1]
  }
  const opId = await gen(a, { type: 'operacional' })
  const opTxt = await a.textContent('main')
  ck('relatório operacional: retrato com data, período, filial e legenda N/D', /Retrato de/.test(opTxt) && opTxt.includes('Minas Farma') && /N\/D = a rede ou o sistema não informou/.test(opTxt))
  ck('relatório operacional lista conteúdos do período e atrasados/pendências', opTxt.includes('E2E Semana publicado') && opTxt.includes('Aprovações pendentes') && opTxt.includes('Por etapa'))
  const opId2 = await gen(a, { type: 'operacional' })
  ck('gerar o mesmo relatório no mesmo dia não duplica (mesmo id, uma linha)', opId2 === opId && (await q(`select count(*)::int n from reports where brand_id = $1 and type = 'operacional'`, [minas]))[0].n === 1)
  const genBefore = (await q(`select snapshot->'meta'->>'generatedAt' g from reports where id = $1`, [opId]))[0].g
  await wait(1200)
  await a.getByRole('button', { name: /Gerar de novo/ }).click()
  for (let i = 0; i < 80; i++) { if ((await q(`select snapshot->'meta'->>'generatedAt' g from reports where id = $1`, [opId]))[0].g !== genBefore) break; await wait(500) }
  const after = (await q(`select snapshot->'meta'->>'generatedAt' g, (select count(*)::int from reports where brand_id = $1 and type = 'operacional') n from reports where id = $2`, [minas, opId]))[0]
  ck('regenerar cria retrato novo com data nova, sem duplicar a linha', after.g !== genBefore && after.n === 1)

  const pdfRes = await a.context().request.get(`${BASE}/api/relatorios/${opId}/pdf`)
  const pdfBytes = Buffer.from(await pdfRes.body())
  const pdfDoc = pdfRes.status() === 200 ? await PDFDocument.load(pdfBytes) : null
  ck('PDF baixa, é A4 e abre', pdfRes.status() === 200 && /application\/pdf/.test(pdfRes.headers()['content-type']) && pdfBytes.subarray(0, 5).toString() === '%PDF-' && pdfDoc.getPageCount() >= 1 && Math.abs(pdfDoc.getPage(0).getSize().width - 595.28) < 0.2, `${pdfRes.status()} ${pdfBytes.length}B`)
  const csvOp = await (await a.context().request.get(`${BASE}/api/relatorios/${opId}/csv`)).text()
  ck('CSV traz filial, período, filtros, fonte e legenda no cabeçalho', csvOp.startsWith('\uFEFF') && /Filial;Minas Farma/.test(csvOp) && /Período;/.test(csvOp) && /Filtros;nenhum/.test(csvOp) && /Fonte;/.test(csvOp) && /Legenda;/.test(csvOp))

  const resId = await gen(a, { type: 'resultados', from: day(-30), to: day(0) })
  const csvRes = await (await a.context().request.get(`${BASE}/api/relatorios/${resId}/csv`)).text()
  const lineR1 = csvRes.split('\r\n').find((l) => l.includes('partial') || l.includes('(parcial)') && l.includes('Reels')) ?? ''
  const lineZ1 = csvRes.split('\r\n').find((l) => /;Feed;0;0;0;0;0;0;/.test(l)) ?? ''
  ck('resultados: dado ausente = N/D e zero medido = 0 (comentários, engajamento)', /;1\.000;3\.000;50;N\/D;20;10;N\/D;/.test(lineR1) && /;Feed;0;0;0;0;0;0;N\/D;/.test(lineZ1), `${lineR1.slice(0, 140)} || ${lineZ1.slice(0, 120)}`)
  const resTxt = await (async () => { await a.goto(`${BASE}/resultados/relatorios/${resId}`); await idle(a); return a.textContent('main') })()
  ck('resultados: separa orgânico (Instagram) de pago (Meta Ads) e informa a data do dado', resTxt.includes('Instagram — publicações (orgânico)') && resTxt.includes('Meta Ads (pago)') && /Dados guardados até/.test(resTxt))
  const resReels = await gen(a, { type: 'resultados', from: day(-30), to: day(0), format: 'reels' })
  const csvReels = await (await a.context().request.get(`${BASE}/api/relatorios/${resReels}/csv`)).text()
  ck('filtro de formato vale no relatório e no CSV', /Filtros;formato: Reels/.test(csvReels) && csvReels.includes(';Reels;') && !/;Feed;0;0;0;0;0;0/.test(csvReels))

  const exId = await gen(a, { type: 'executivo' })
  const exTxt = await a.textContent('main')
  ck('executivo: visão rápida, metas, observações e próximos passos (pendências reais)', exTxt.includes('Visão rápida') && exTxt.includes('Metas de') && exTxt.includes('Observações calculadas') && exTxt.includes('Próximos passos'))
  ck('executivo: meta cadastrada aparece com fonte', exTxt.includes('Conteúdos publicados') && /sistema/.test(exTxt))

  // ---------- permissões ----------
  const hist = await (async () => { await a.goto(BASE + '/resultados/relatorios'); await idle(a); return a.locator('table tbody tr').count() })()
  ck('histórico lista os relatórios gerados', hist >= 4)
  const { p: v2, c: vc2 } = await mk()
  await q(`update users set brand_ids = $1 where username_normalized = 'e2e_vw'`, [[farma]])
  await login(v2, 'e2e_vw')
  for (const [kind, ext] of [['pdf', 'pdf'], ['csv', 'csv']]) {
    const r = await vc2.request.get(`${BASE}/api/relatorios/${opId}/${ext}`)
    ck(`usuário só da Farma e Farma NÃO baixa ${kind.toUpperCase()} da Minas Farma por URL direta (404)`, r.status() === 404, r.status())
  }
  await v2.goto(`${BASE}/resultados/relatorios/${opId}`); await idle(v2)
  const vb = await v2.textContent('body')
  ck('nem a página do relatório da Minas Farma abre para ele', !vb.includes('E2E Semana publicado') && /404|não foi encontrada|not found/i.test(vb))
  await v2.goto(BASE + '/resultados/relatorios'); await idle(v2)
  ck('histórico dele não mostra relatórios da Minas Farma', (await v2.locator('table tbody tr').count()) === 0)
  ck('leitor não vê o formulário de gerar', (await v2.locator('.new-request').count()) === 0)
  const anon = await (await browser.newContext()).request.get(`${BASE}/api/relatorios/${opId}/pdf`)
  ck('sem login: 401 no PDF', anon.status() === 401, anon.status())
  await q(`update users set brand_ids = null where username_normalized = 'e2e_vw'`)
  const { p: v3, c: vc3 } = await mk(); await login(v3, 'e2e_vw')
  ck('leitor com acesso à filial baixa o PDF existente (200)', (await vc3.request.get(`${BASE}/api/relatorios/${opId}/pdf`)).status() === 200)
  ck('editor com acesso baixa o CSV (200)', (await (await mk().then(async ({ p, c }) => { await login(p, 'e2e_ed'); return c.request.get(`${BASE}/api/relatorios/${opId}/csv`) })).status()) === 200)
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
