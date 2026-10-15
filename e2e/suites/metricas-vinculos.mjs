// @title: Publicações reais (Windsor), vínculos, diagnóstico, metas e CSV
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
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160))); p.on('dialog', (d) => d.accept()); return { c, p } }
const idle = (p) => p.waitForLoadState('networkidle')
const login = async (p, u) => { await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', 'Senha-Teste-1'); await p.click('button.primary'); await p.waitForURL(BASE + '/', { timeout: 30000 }); await idle(p) }
const scope = async (p, name) => { await p.selectOption('select[aria-label="Filial"]', { label: name }); await p.waitForLoadState('networkidle'); await wait(300) }
const day = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const row = (p, id) => p.locator(`tr[data-pub="${id}"]`)
const openForm = async (p) => { if (!(await p.locator('.new-request[open]').count())) await p.click('.new-request summary') }
const btn = (loc, name) => loc.getByRole('button', { name, exact: true })

try {
  const minas = (await q(`select id from brands where name = 'Minas Farma'`))[0].id
  const farma = (await q(`select id from brands where name = 'Farma e Farma'`))[0].id
  const admin = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id

  // ---------- dados de teste ----------
  const mkPost = async (brand, title, date, format, stage = 'publicado') =>
    (await q(`insert into posts (brand_id, title, post_date, format, pillar, stage, created_by) values ($1,$2,$3,$4,'institucional',$5,$6) returning id`, [brand, title, date, format, stage, admin]))[0].id
  const mkPub = async (brand, mid, date, product, type, m, link) => {
    const id = (await q(
      `insert into external_publications (brand_id, platform, external_account_id, account_name, external_media_id, permalink, media_type, media_product_type, caption_excerpt, published_at)
       values ($1,'instagram','E2E-acc',$2,$3,$4,$5,$6,$7,$8) returning id`,
      [brand, brand === minas ? 'E2E minas' : 'E2E farma', mid, `https://www.instagram.com/p/${link}/`, type, product, `Legenda ${mid}`, `${date}T15:00:00Z`]))[0].id
    if (m) await q(`insert into publication_metric_snapshots (publication_id, collected_on, collected_at, window_start, window_end, reach, views, likes, comments, saves, shares, data_quality) values ($1,$2, now() - interval '2 days',$3,$2,$4,$5,$6,$7,$8,$9,$10)`,
      [id, day(-1), date, m.reach, m.views, m.likes, m.comments, m.saves, m.shares, m.comments === null ? 'partial' : 'complete'])
    return id
  }
  const dA = day(-20), dB = day(-15), dC = day(-12), dR = day(-2), dAmb = day(-30)
  const pReels = await mkPost(minas, 'E2E Reels dia A', dA, 'reels')
  const pFeed = await mkPost(minas, 'E2E Feed dia B', dB, 'feed')
  await mkPost(minas, 'E2E Amb 1', dAmb, 'feed'); await mkPost(minas, 'E2E Amb 2', dAmb, 'feed')
  const pOther = await mkPost(minas, 'E2E Outro conteúdo', dA, 'carrossel')
  const m1 = await mkPub(minas, 'E2E-m1', dA, 'REELS', 'VIDEO', { reach: 1000, views: 3000, likes: 50, comments: 5, saves: 20, shares: 10 }, 'E2Em1')
  await mkPub(minas, 'E2E-m2', dB, 'FEED', 'IMAGE', { reach: 500, views: 900, likes: 30, comments: null, saves: 4, shares: 1 }, 'E2Em2')
  await mkPub(minas, 'E2E-m3', dC, 'FEED', 'IMAGE', null, 'E2Em3')
  await mkPub(minas, 'E2E-m4', dR, 'REELS', 'VIDEO', { reach: 200, views: 400, likes: 10, comments: 1, saves: 2, shares: 1 }, 'E2Em4')
  await mkPub(minas, 'E2E-m5', dAmb, 'FEED', 'IMAGE', { reach: 800, views: 1000, likes: 40, comments: 2, saves: 8, shares: 2 }, 'E2Em5')
  await mkPub(minas, 'E2E-m6', dAmb, 'FEED', 'IMAGE', { reach: 600, views: 900, likes: 20, comments: 2, saves: 3, shares: 1 }, 'E2Em6')
  await mkPub(minas, 'E2E-m7', day(-22), 'REELS', 'VIDEO', { reach: 1000, views: 2000, likes: 30, comments: 5, saves: 3, shares: 2 }, 'E2Em7')
  await mkPub(minas, 'E2E-m8', day(-24), 'REELS', 'VIDEO', { reach: 1000, views: 5000, likes: 90, comments: 15, saves: 10, shares: 5 }, 'E2Em8')
  await mkPub(farma, 'E2E-f1', dA, 'REELS', 'VIDEO', { reach: 700, views: 1500, likes: 20, comments: 2, saves: 5, shares: 2 }, 'E2Ef1')

  // =============== ADMIN ===============
  const { p: a } = await mk()
  await login(a, 'teste_e2e')
  await scope(a, 'Minas Farma')
  await a.goto(BASE + '/resultados/vinculos'); await idle(a)
  const nav = await a.textContent('.side-nav')
  ck('menu mostra Publicações e Metas (e não tem mais "Por publicação")', nav.includes('Publicações') && nav.includes('Metas') && !nav.includes('Por publicação'))
  ck('aviso diz que são dados guardados, não ao vivo', /dados guardados/.test(await a.textContent('.page-head')))

  // ---------- N/D nunca vira zero ----------
  const r3 = await row(a, 'E2E-m3').textContent()
  ck('publicação sem coleta mostra N/D (e "nunca"), sem zeros inventados', r3.includes('N/D') && r3.includes('nunca') && !/\b0\b/.test(r3.replace(/E2E.*?m3/, '')), r3)
  const r2 = await row(a, 'E2E-m2').textContent()
  ck('comentários ausentes e engajamento = N/D (não 0)', (r2.match(/N\/D/g) ?? []).length >= 2 && r2.includes('parcial'), r2)
  ck('engajamento declarado: m1 = (50+5+20+10)/1000 = 8,50%', (await row(a, 'E2E-m1').textContent()).includes('8,50%'))
  ck('publicação recente (2 dias) vem marcada', (await row(a, 'E2E-m4').textContent()).includes('recente'))

  // ---------- diagnóstico ----------
  const diag = await a.locator('.dark-surface').first().textContent()
  ck('diagnóstico: Reels maduros (n=3) tem mediana 8,50%', /Reels\s*8,50%\s*n=3/.test(diag), diag.slice(0, 400))
  ck('diagnóstico: Feed com amostra pequena não afirma mediana', /Feed\s*amostra pequena\s*n=2/.test(diag), diag.slice(0, 400))
  ck('diagnóstico: peça recente fica de fora e avisa', /1 publicação com menos de 7 dias ficou de fora/.test(diag))
  ck('diagnóstico declara fonte, fórmula e limite de causa', /Fonte: Windsor/.test(diag) && /interações ÷ alcance/.test(diag) && /não prova causa/.test(diag))

  // ---------- sugestões ----------
  ck('sugestão inequívoca aparece (m1 ↔ Reels do dia A)', (await row(a, 'E2E-m1').locator('.suggest').textContent()).includes('E2E Reels dia A'))
  ck('sugestão inequívoca aparece (m2 ↔ Feed do dia B)', (await row(a, 'E2E-m2').locator('.suggest').textContent()).includes('E2E Feed dia B'))
  ck('ambíguo (2 publicações e 2 conteúdos no mesmo dia/formato) não sugere', (await row(a, 'E2E-m5').locator('.suggest').count()) === 0 && (await row(a, 'E2E-m6').locator('.suggest').count()) === 0)
  ck('sem conteúdo no dia, não sugere, mas lista candidatos próximos', (await row(a, 'E2E-m3').locator('.suggest').count()) === 0 && (await row(a, 'E2E-m3').locator('select option').count()) >= 2)

  // ---------- vincular: sugestão confirmada ----------
  const { p: b } = await mk(); await login(b, 'teste_e2e'); await scope(b, 'Minas Farma')
  await b.goto(BASE + '/resultados/vinculos'); await idle(b) // aberta ANTES do vínculo
  await btn(row(a, 'E2E-m1'), 'Confirmar sugestão').click()
  await row(a, 'E2E-m1').locator('text=sugestão confirmada').waitFor({ timeout: 20000 })
  const l1 = (await q(`select content_id, link_method, linked_by from external_publications where external_media_id = 'E2E-m1'`))[0]
  ck('vínculo por sugestão grava método e quem confirmou', l1.content_id === pReels && l1.link_method === 'verified_match' && l1.linked_by === admin)

  // ---------- vincular de novo (outra aba desatualizada) ----------
  await row(b, 'E2E-m1').locator('select').selectOption(pOther)
  await btn(row(b, 'E2E-m1'), 'Vincular').click()
  await row(b, 'E2E-m1').locator('.form-error').waitFor({ timeout: 20000 })
  ck('publicação já vinculada não vai para outro conteúdo (sem sobrescrever)', /já está vinculada a "E2E Reels dia A"/.test(await row(b, 'E2E-m1').locator('.form-error').textContent()) && (await q(`select content_id from external_publications where external_media_id = 'E2E-m1'`))[0].content_id === pReels)

  // ---------- vínculo manual, dois por conteúdo ----------
  await btn(row(a, 'E2E-m2'), 'Confirmar sugestão').click()
  await row(a, 'E2E-m2').locator('text=sugestão confirmada').waitFor({ timeout: 20000 })
  await row(a, 'E2E-m3').locator('select').selectOption(pFeed)
  await btn(row(a, 'E2E-m3'), 'Vincular').click()
  await row(a, 'E2E-m3').locator('text=manual').first().waitFor({ timeout: 20000 })
  const two = await q(`select external_media_id, link_method from external_publications where content_id = $1 order by external_media_id`, [pFeed])
  ck('o mesmo conteúdo aceita duas publicações, cada uma com seu vínculo', two.length === 2 && two[0].link_method === 'verified_match' && two[1].link_method === 'manual', JSON.stringify(two))
  ck('métricas continuam por publicação (nenhum snapshot duplicado)', (await q(`select count(*)::int n from publication_metric_snapshots s join external_publications e on e.id = s.publication_id where e.external_media_id in ('E2E-m2','E2E-m3')`))[0].n === 1)

  // ---------- desvincular ----------
  await btn(row(a, 'E2E-m3'), 'Desvincular').click()
  await btn(row(a, 'E2E-m3'), 'Vincular').waitFor({ timeout: 20000 })
  ck('desvincular limpa método e autor', (await q(`select content_id, link_method, linked_by from external_publications where external_media_id = 'E2E-m3'`))[0].link_method === null)

  // ---------- excluir conteúdo vinculado ----------
  await a.goto(BASE + `/planejamento/conteudos/${pFeed}`); await idle(a)
  await a.getByRole('button', { name: 'Excluir conteúdo' }).click()
  await a.waitForURL(/calendario/, { timeout: 25000 })
  const after = (await q(`select content_id, link_method from external_publications where external_media_id = 'E2E-m2'`))[0]
  ck('excluir o conteúdo mantém a publicação e as métricas, só desfaz o vínculo', after.content_id === null && after.link_method === null && (await q(`select count(*)::int n from publication_metric_snapshots s join external_publications e on e.id = s.publication_id where e.external_media_id = 'E2E-m2'`))[0].n === 1)

  // ---------- CSV: mesmo escopo da tela ----------
  const csv = await (await a.context().request.get(BASE + '/api/export/publicacoes')).text()
  ck('CSV da Minas Farma traz as publicações da Minas Farma e nenhuma da outra filial', csv.includes('E2Em1') && !csv.includes('E2Ef1'))
  const lineM3 = csv.split('\r\n').find((l) => l.includes('E2Em3')) ?? ''
  ck('CSV deixa vazio o que é N/D (não escreve 0)', lineM3.includes(';;;;;') && !/;0;/.test(lineM3), lineM3.slice(0, 160))
  ck('CSV sem login é recusado', (await (await browser.newContext()).request.get(BASE + '/api/export/publicacoes')).status() === 401)

  // ---------- metas ----------
  const month = day(0).slice(0, 7)
  const nPub = (await q(`select count(*) filter (where stage = 'publicado')::int n from posts where brand_id = $1 and to_char(post_date,'YYYY-MM') = $2`, [minas, month]))[0].n
  await mkPost(minas, 'E2E Meta hoje 1', day(0), 'feed'); await mkPost(minas, 'E2E Meta hoje 2', day(0), 'feed'); await mkPost(minas, 'E2E Meta hoje 3', day(0), 'feed', 'producao'); await mkPost(minas, 'E2E Meta hoje 4', day(0), 'feed', 'cancelado')
  const expPub = nPub + 2
  const expPlan = (await q(`select count(*) filter (where stage <> 'cancelado')::int n from posts where brand_id = $1 and to_char(post_date,'YYYY-MM') = $2`, [minas, month]))[0].n
  await a.goto(BASE + '/resultados/metas'); await idle(a)
  await openForm(a)
  await a.selectOption('#tg-metric', 'posts_published'); await a.fill('#tg-value', '10'); await a.fill('#tg-notes', 'E2E meta')
  await a.click('.new-request button.primary')
  await a.locator('.new-request .form-ok').waitFor({ timeout: 20000 })
  const gp = a.locator('article.goal[data-metric="posts_published"]')
  await gp.waitFor({ timeout: 90000 })
  const gt = await gp.textContent()
  ck('meta de publicados: realizado vem do calendário e mostra % da meta', gt.includes(String(expPub)) && gt.includes(`${Math.round((expPub / 10) * 100)}%`) && /dado do próprio sistema/.test(gt), gt.slice(0, 300))
  ck('mês em andamento é identificado e compara com o mês anterior sem afirmar causa', /dia \d+ de \d+/.test(gt) && /Mês anterior/.test(gt) && /não indica o que a causou/.test(gt))
  await openForm(a)
  await a.selectOption('#tg-metric', 'posts_published'); await a.fill('#tg-value', '12'); await a.fill('#tg-notes', 'E2E dup')
  await a.click('.new-request button.primary')
  await a.locator('.new-request .form-error', { hasText: 'Já existe uma meta' }).waitFor({ timeout: 20000 })
  ck('meta repetida (mesmo indicador, mês e escopo) é recusada', true)
  await a.selectOption('#tg-metric', 'posts_planned'); await a.fill('#tg-value', '8,5'); await a.fill('#tg-notes', 'E2E meta')
  await a.click('.new-request button.primary')
  await a.waitForFunction(() => /inteiro/.test(document.querySelector('.new-request .form-error')?.textContent ?? ''), null, { timeout: 15000 })
  ck('contagem aceita só número inteiro', true)
  await a.fill('#tg-value', '20')
  await a.click('.new-request button.primary')
  await a.locator('article.goal[data-metric="posts_planned"]').waitFor({ timeout: 90000 })
  ck('meta de planejados exclui cancelados', (await a.locator('article.goal[data-metric="posts_planned"]').textContent()).includes(String(expPlan)))
  await openForm(a)
  await a.selectOption('#tg-metric', 'ads_cost_per_conversation'); await a.fill('#tg-value', '5,00'); await a.fill('#tg-notes', 'E2E meta')
  await a.click('.new-request button.primary')
  const gc = a.locator('article.goal[data-metric="ads_cost_per_conversation"]')
  await gc.waitFor({ timeout: 120000 })
  const gct = await gc.textContent()
  ck('meta de teto (custo por conversa) mostra "teto" e nunca NaN/0% inventado', /Teto/.test(gct) && !/NaN|undefined/.test(gct) && (/(Dentro do teto|Acima do teto|N\/D)/.test(gct)), gct.slice(0, 260))
  await btn(a.locator('article.goal[data-metric="posts_planned"]'), 'Excluir').click()
  await a.locator('article.goal[data-metric="posts_planned"]').waitFor({ state: 'detached', timeout: 20000 })
  ck('meta excluída', true)

  // ---------- leitor ----------
  const { p: v } = await mk(); await login(v, 'e2e_vw'); await scope(v, 'Minas Farma')
  await v.goto(BASE + '/resultados/vinculos'); await idle(v)
  ck('leitor vê publicações e métricas, sem coletar nem vincular', (await row(v, 'E2E-m1').count()) === 1 && (await v.getByRole('button', { name: /Coletar|Vincular|Desvincular|Confirmar sugestão/ }).count()) === 0)
  await v.goto(BASE + '/resultados/metas'); await idle(v)
  ck('leitor vê metas sem formulário nem exclusão', (await v.locator('article.goal').count()) >= 1 && (await v.locator('.new-request').count()) === 0 && (await v.getByRole('button', { name: 'Excluir' }).count()) === 0)
  const vcsv = await (await v.context().request.get(BASE + '/api/export/publicacoes')).text()
  ck('CSV do leitor segue o mesmo escopo da tela dele', vcsv.includes('E2Em1') && !vcsv.includes('E2Ef1'))

  // ---------- outra filial ----------
  await q(`update users set brand_ids = $1 where username_normalized = 'e2e_vw'`, [[farma]])
  const { p: v2, c: vc2 } = await mk(); await login(v2, 'e2e_vw')
  await v2.goto(BASE + '/resultados/vinculos'); await idle(v2)
  ck('usuário só da Farma e Farma não vê publicações da Minas Farma', (await row(v2, 'E2E-m1').count()) === 0 && (await row(v2, 'E2E-f1').count()) === 1)
  await v2.goto(BASE + '/resultados/metas?mes=' + month); await idle(v2)
  ck('meta da Minas Farma não aparece para quem só tem a Farma e Farma', (await v2.locator('article.goal').count()) === 0)
  const f2csv = await (await vc2.request.get(BASE + '/api/export/publicacoes')).text()
  ck('CSV dele traz só a filial dele', f2csv.includes('E2Ef1') && !f2csv.includes('E2Em1'))

  // ---------- coleta real (Farma e Farma, Windsor de verdade) ----------
  await scope(a, 'Farma e Farma')
  await a.goto(BASE + '/resultados/vinculos'); await idle(a)
  const before = (await q(`select count(*)::int n from external_publications where brand_id = $1 and external_media_id not like 'E2E%'`, [farma]))[0].n
  await a.getByRole('button', { name: /Coletar métricas agora/ }).click()
  await a.locator('.page-head .form-ok, .page-head .form-error').first().waitFor({ timeout: 90000 })
  const cmsg = await a.locator('.page-head .form-ok, .page-head .form-error').first().textContent()
  const afterN = (await q(`select count(*)::int n from external_publications where brand_id = $1 and external_media_id not like 'E2E%'`, [farma]))[0].n
  const limited = false
  ck('coleta real: grava publicações da Farma e Farma ', limited || (/publicações? lidas?/.test(cmsg) && afterN >= 1), cmsg)
  if (!limited) {
    const real = await q(`select e.external_media_id, s.reach, s.views, s.collected_on::text d from external_publications e join publication_metric_snapshots s on s.publication_id = e.id where e.brand_id = $1 and e.external_media_id not like 'E2E%' limit 5`, [farma])
    ck('publicações reais vieram com métricas e data de coleta', real.length >= 1 && real.every((r) => r.reach !== null && r.d), JSON.stringify(real[0]))
    ck('nenhuma publicação real caiu na Minas Farma', (await q(`select count(*)::int n from external_publications where brand_id = $1 and external_media_id not like 'E2E%'`, [minas]))[0].n === 0)
    // sem limite de intervalo: coletar de novo logo em seguida funciona e não duplica o retrato do dia
    await a.reload(); await idle(a)
    await a.getByRole('button', { name: /Coletar métricas agora/ }).click()
    await a.locator('.page-head .form-ok, .page-head .form-error').first().waitFor({ timeout: 90000 })
    ck('segunda coleta seguida funciona (sem limite de intervalo)', /Coleta concluída/.test(await a.locator('.page-head .form-ok, .page-head .form-error').first().textContent()))
    const dup = (await q(`select count(*)::int n from (select publication_id, collected_on from publication_metric_snapshots group by 1,2 having count(*) > 1) x`))[0].n
    ck('nenhum retrato duplicado no mesmo dia', dup === 0)
  }
  await a.reload(); await idle(a)
  ck('depois da coleta o cabeçalho mostra "Histórico — atualizado em"', /Histórico — atualizado em/.test(await a.textContent('.page-head')))
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
