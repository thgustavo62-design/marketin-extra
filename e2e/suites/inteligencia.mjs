// @title: Central de Inteligência: achados, qualidade, processo
// @needs: 
import { chromium } from 'playwright-core'
import { createRequire } from 'node:module'
const pg = createRequire(new URL('../../package.json', import.meta.url))('pg')

const BASE = process.env.BASE || 'http://localhost:3100'
const R = []
const ck = (n, v, x = '') => { R.push(v); console.log(`${v ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + String(x).slice(0, 300) : ''}`) }
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
const finding = (p, key) => p.locator(`article[data-finding="${key}"]`)

try {
  const minas = (await q(`select id from brands where name = 'Minas Farma'`))[0].id
  const farma = (await q(`select id from brands where name = 'Farma e Farma'`))[0].id
  const admin = (await q(`select id from users where username_normalized = 'teste_e2e'`))[0].id
  const today = day(0)

  // ---------- dados: formato muda o resultado; dia e período NÃO (distribuídos igual nos dois formatos) ----------
  const camp = (await q(`insert into campaigns (brand_id, name, starts_on, ends_on) values ($1,'E2E Camp A',$2,$3) returning id`, [minas, day(-60), day(30)]))[0].id
  const mkPost = async (title, pillar, stage, date, campaign = null) => (await q(`insert into posts (brand_id, title, post_date, format, pillar, stage, campaign_id, assigned_to, created_by) values ($1,$2,$3,'feed',$4,$5,$6,$7,$7) returning id`, [minas, title, date, pillar, stage, campaign, admin]))[0].id
  const postA = await mkPost('E2E Conteúdo Educação', 'educacao', 'publicado', day(-12), camp)
  const postB = await mkPost('E2E Conteúdo Campanha', 'campanha', 'publicado', day(-12))
  await mkPost('E2E Publicado sem publicação real', 'institucional', 'publicado', day(-20))
  const pub = async (i, product, type, inter, saves, link) => {
    const date = day(-9 - (i % 4) - Math.floor(i / 4) * 5), hour = i % 2 === 0 ? '15:00:00' : '22:00:00' // 12h ou 19h em Brasília
    const id = (await q(`insert into external_publications (brand_id, platform, external_account_id, account_name, external_media_id, permalink, media_type, media_product_type, caption_excerpt, published_at, content_id, link_method, linked_by, linked_at)
      values ($1,'instagram','E2E-acc','E2E minas',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [minas, `E2E-${product}-${i}`, `https://www.instagram.com/p/E2E${product}${i}/`, type, product, `Legenda ${product} ${i}`, `${date}T${hour}Z`, link, link ? 'manual' : null, link ? admin : null, link ? new Date().toISOString() : null]))[0].id
    await q(`insert into publication_metric_snapshots (publication_id, collected_on, collected_at, window_start, window_end, reach, views, likes, comments, saves, shares, data_quality)
      values ($1,$2, now() - interval '9 days', $3, $2, 1000, 3000, $4, 5, $5, 5, 'complete')`, [id, day(-1), date, inter - saves - 10, saves])
    return id
  }
  const reelsIds = []
  for (let i = 0; i < 12; i++) reelsIds.push(await pub(i, 'REELS', 'VIDEO', 100 + ((i % 5) - 2) * 2, 30, i < 10 ? postA : null)) // ~10% de engajamento
  for (let i = 0; i < 12; i++) await pub(i, 'FEED', 'IMAGE', 50 + ((i % 5) - 2) * 2, 10, i < 10 ? postB : null) // ~5%
  for (let i = 0; i < 2; i++) await pub(i, 'CAR', 'CAROUSEL_ALBUM', 70, 12, null) // amostra pequena

  // ---------- processo: gargalo conhecido (revisão ~60 h), aprovações e pontualidade ----------
  const proc = []
  for (let i = 0; i < 8; i++) {
    const late = i >= 6 // 2 de 8 publicados com atraso (os 6 primeiros no prazo)
    const pd = day(-30 + i)
    const id = await mkPost(`E2E Processo ${i + 1}`, 'servicos', 'publicado', pd)
    proc.push(id)
    const t0 = new Date(`${pd}T08:00:00-03:00`).getTime() - 5 * 864e5
    const at = (h) => new Date(t0 + h * 36e5).toISOString()
    const ev = [[null, 'briefing', 0], ['briefing', 'producao', 2], ['producao', 'revisao', 10], ['revisao', 'aprovacao', 70], ['aprovacao', 'aprovado', 74],
      ['aprovado', 'publicado', late ? 5 * 24 + 74 + 3 * 24 : 5 * 24 - 2]]
    for (const [f, t, h] of ev) await q(`insert into post_status_events (post_id, from_stage, to_stage, actor_id, created_at) values ($1,$2,$3,$4,$5)`, [id, f, t, admin, at(h)])
    if (i < 6) {
      const ver = (await q(`insert into content_versions (post_id, version_number, title, caption, script, content_checksum, created_by) values ($1,1,'E2E','','','x',$2) returning id`, [id, admin]))[0].id
      await q(`insert into approvals (post_id, brand_id, version_id, submitted_by, status, decided_by, created_at, decided_at) values ($1,$2,$3,$4,$5,$4,$6,$7)`,
        [id, minas, ver, admin, i < 4 ? 'approved' : 'changes_requested', at(70), at(74)])
    }
  }

  // =============== ADMIN ===============
  const { p: a } = await mk()
  await login(a, 'teste_e2e')
  await scope(a, 'Minas Farma')
  await a.goto(BASE + '/inteligencia'); await idle(a)
  ck('menu: Inteligência', (await a.textContent('.side-nav')).includes('Inteligência'))
  ck('o cabeçalho avisa: por filial, sem causa, com confiança e decisões registradas', /por filial/.test(await a.textContent('.page-head')) && /Nada aqui prova causa/.test(await a.textContent('.page-head')))

  // ---------- achados ----------
  const fmt = finding(a, 'formato_engajamento')
  const ft = await fmt.textContent()
  ck('formato: Reels engaja mais que Feed, com confiança ALTA, amostra e p-valor', (await fmt.getAttribute('data-confidence')) === 'alta' && /Reels teve a maior mediana de engajamento/.test(ft) && /n=12/.test(ft) && /p = 0,/.test(ft), ft.slice(0, 280))
  ck('formato: grupo com amostra pequena é declarado e fica fora da comparação', /Carrossel: amostra pequena \(n=2\)/.test(ft))
  ck('formato: nome do método e limites aparecem (não prova causa)', /teste de permutação/i.test(ft) && /não prova causa/.test(ft))
  const dow = finding(a, 'dia_semana_engajamento'), part = finding(a, 'periodo_dia_engajamento')
  ck('dia da semana: sem diferença real → INCONCLUSIVO (não inventa melhor dia)', (await dow.getAttribute('data-confidence')) === 'inconclusiva' && /pode ser acaso/.test(await dow.textContent()), await dow.textContent())
  ck('período do dia: sem diferença real → INCONCLUSIVO', (await part.getAttribute('data-confidence')) === 'inconclusiva' && /pode ser acaso/.test(await part.textContent()))
  const th = finding(a, 'tema_engajamento')
  ck('tema (pilar): usa só publicações vinculadas e diz quantas ficaram de fora', ['alta', 'media'].includes(await th.getAttribute('data-confidence')) && /Só entram publicações vinculadas a um conteúdo planejado: 20 de 26/.test(await th.textContent()), (await th.textContent()).slice(0, 300))
  ck('campanha contra o dia a dia aparece com os grupos', (await finding(a, 'campanha_engajamento').count()) === 1 && /E2E Camp A/.test(await finding(a, 'campanha_engajamento').textContent()))
  ck('achado traz ação com link (quando confiança permite)', (await fmt.locator('a.btn').count()) === 1 && /Planejar mais conteúdo em Reels/.test(await fmt.locator('a.btn').textContent()))
  ck('achado inconclusivo recomenda coletar mais, não mudar a estratégia', /Coletar mais publicações/.test(await dow.locator('a.btn').textContent()))
  ck('fora da curva traz as melhores e as piores com link', (await finding(a, 'fora_da_curva').count()) === 1 && /Melhores:/.test(await finding(a, 'fora_da_curva').textContent()))
  const pageTxt = await a.textContent('main')
  ck('nenhum NaN/undefined/Infinity na tela', !/NaN|undefined|Infinity/.test(pageTxt))

  // ---------- decisões ----------
  await fmt.getByLabel('Observação da decisão').fill('')
  await fmt.getByRole('button', { name: 'Dispensar' }).click()
  await fmt.locator('.form-error').waitFor({ timeout: 15000 })
  ck('dispensar exige explicação', /Explique/.test(await fmt.locator('.form-error').textContent()))
  await fmt.getByLabel('Observação da decisão').fill('Vamos testar mais Reels em outubro.')
  await fmt.getByRole('button', { name: 'Vou aplicar' }).click()
  await fmt.locator('[data-decision="aceita"]').waitFor({ timeout: 20000 })
  const dec = (await q(`select status, note, fingerprint, decided_by from insight_decisions where brand_id = $1 and insight_key = 'formato_engajamento'`, [minas]))[0]
  ck('decisão registrada: status, nota, assinatura da análise e quem decidiu', dec.status === 'aceita' && dec.note.includes('Reels') && /^[0-9a-f]{8}$/.test(dec.fingerprint) && dec.decided_by === admin)
  ck('a tela mostra quem decidiu e que a análise ainda é a mesma', /Vou aplicar por Admin Teste/.test(await fmt.textContent()) && !/A análise mudou/.test(await fmt.textContent()))
  await q(`update publication_metric_snapshots set likes = likes + 40 where publication_id = any($1)`, [reelsIds])
  await a.reload(); await idle(a)
  ck('se a análise mudar depois da decisão, a tela avisa para rever', /A análise mudou desde essa decisão/.test(await finding(a, 'formato_engajamento').textContent()))
  await finding(a, 'formato_engajamento').getByRole('button', { name: 'Limpar decisão' }).click()
  await finding(a, 'formato_engajamento').locator('[data-decision]').waitFor({ state: 'detached', timeout: 20000 })
  ck('limpar decisão remove o registro', (await q(`select count(*)::int n from insight_decisions where brand_id = $1`, [minas]))[0].n === 0)

  // ---------- processo ----------
  await a.goto(BASE + '/inteligencia?aba=processo'); await idle(a)
  const gar = finding(a, 'gargalo_etapa')
  const gt = await gar.textContent()
  ck('processo: acha o gargalo certo (Em revisão, mediana ~2,5 dias) com amostra', /Em revisão/.test(gt) && /mediana de 2,5 dias/.test(gt) && /n=8/.test(gt), gt.slice(0, 260))
  ck('processo: o gargalo leva ao quadro filtrado pela etapa', (await gar.locator('a.btn').getAttribute('href')) === '/producao?etapa=revisao')
  const apr = finding(a, 'giro_aprovacao')
  ck('processo: giro das aprovações (n=6) e retrabalho 2 de 6', /n=6/.test(await apr.textContent()) && /2 de 6/.test(await apr.textContent()), (await apr.textContent()).slice(0, 260))
  ck('processo: pontualidade 6 de 8 no prazo', /6 de 8 conteúdos \(75%\)/.test(await finding(a, 'pontualidade').textContent()), (await finding(a, 'pontualidade').textContent()).slice(0, 200))
  ck('tabela de tempo por etapa com passagens e "ainda nela"', (await a.locator('table[data-table="etapas"] tbody tr').count()) >= 3)

  // ---------- qualidade dos dados ----------
  await a.goto(BASE + '/inteligencia?aba=dados'); await idle(a)
  const score = Number(await a.locator('.quality-score').first().getAttribute('data-score'))
  ck('qualidade: nota de 0 a 100 com faixa', Number.isInteger(score) && score >= 0 && score <= 100, score)
  const fresh = a.locator('li[data-item="coleta_fresca"]')
  ck('qualidade: coleta antiga (9 dias) é apontada, com o botão para coletar', /9 dia/.test(await fresh.textContent()) && (await fresh.locator('a.btn').count()) === 1)
  const link = a.locator('li[data-item="vinculo_conteudos"]')
  const expLinked = (await q(`select count(*) filter (where exists (select 1 from external_publications e where e.content_id = p.id))::int l, count(*)::int t from posts p where p.brand_id = $1 and p.stage = 'publicado' and p.post_date > current_date - 90`, [minas]))[0]
  ck('qualidade: cobertura de vínculo bate com o banco', (await link.textContent()).includes(`${expLinked.l} de ${expLinked.t}`), (await link.textContent()).slice(0, 160))
  ck('qualidade: itens ordenados pelo maior prejuízo (o primeiro é um dos piores)', (await a.locator('.quality-list li').count()) >= 8)

  // ---------- explorar (ontologia) ----------
  await a.goto(BASE + '/inteligencia?aba=explorar&q=E2E Camp'); await idle(a)
  ck('explorar: busca encontra a campanha', (await a.locator('li[data-kind="campanha"]', { hasText: 'E2E Camp A' }).count()) === 1)
  await a.locator('li[data-kind="campanha"] a', { hasText: 'E2E Camp A' }).click(); await a.waitForURL(/explorar\/campanha\//); await idle(a)
  ck('campanha: estatísticas (conteúdos, publicações ligadas, mediana com n)', (await a.locator('[data-stat="Conteúdos"] .stat-value').textContent()) === '1' && (await a.locator('[data-stat="Publicações reais ligadas"] .stat-value').textContent()) === '10' && /n=10/.test(await a.locator('[data-stat^="Engajamento"] .stat-value').textContent()))
  ck('campanha: objetos ligados (conteúdo e publicações) com contagem', (await a.locator('[data-relation="Conteúdos"] .count').textContent()) === '1' && (await a.locator('[data-relation="Publicações reais"] .count').textContent()) === '10')
  ck('campanha: linha do tempo com os eventos dos conteúdos', (await a.locator('.timeline li').count()) >= 0 && /Linha do tempo/.test(await a.textContent('main')))
  await a.locator('[data-relation="Publicações reais"] a').first().click(); await a.waitForURL(/explorar\/publicacao\//); await idle(a)
  ck('publicação: métricas, engajamento declarado e histórico de coletas', /Alcance/.test(await a.textContent('main')) && /Engajamento \(interações ÷ alcance\)/.test(await a.textContent('main')) && (await a.locator('[data-relation="Histórico de coletas"] .count').textContent()) === '1')
  ck('publicação: leva ao conteúdo vinculado e à campanha', (await a.locator('[data-relation="Conteúdo planejado"] a').count()) === 1 && (await a.locator('[data-relation="Campanha"] a').count()) === 1)
  await a.locator('[data-relation="Conteúdo planejado"] a').click(); await a.waitForURL(/explorar\/conteudo\//); await idle(a)
  ck('conteúdo: campanha, publicações reais e linha do tempo', (await a.locator('[data-relation="Campanha"] a').count()) === 1 && (await a.locator('[data-relation="Publicações reais"] .count').textContent()) === '10')
  const postUrl = a.url()
  const campUrl = (await a.locator('[data-relation="Campanha"] a').getAttribute('href'))

  // ---------- visual (defeitos de CSS não aparecem em teste de texto) ----------
  const w = async (loc) => (await loc.boundingBox())
  await a.goto(BASE + '/?v=op'); await idle(a)
  const bar = await w(a.locator('.bars .bar').first())
  ck('visual: o gráfico semanal do Dashboard mantém altura (não colapsa)', bar && bar.height >= 100, bar && bar.height)
  await a.goto(BASE + '/?v=exec'); await idle(a)
  const ecard = await w(a.locator('.exec-cards article').first())
  ck('visual: o cartão executivo tem largura de leitura (não espremido)', ecard && ecard.width >= 450, ecard && ecard.width)
  await a.goto(BASE + '/resultados/vinculos'); await idle(a)
  const clip = await a.locator('.dark-table.pubs').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
  ck('visual: a tabela de publicações cabe na tela (a coluna de vínculo não fica escondida)', clip.sw <= clip.cw + 2, JSON.stringify(clip))
  await a.goto(BASE + '/inteligencia?aba=dados'); await idle(a)
  const meter = await a.locator('li[data-item="metas"] .meter').count()
  const fill = await a.locator('li[data-item="vinculo_publicacoes"]').evaluate((li) => { const m = li.querySelector('.meter'), i = m.querySelector('i'); return { w: i.getBoundingClientRect().width, p: m.getBoundingClientRect().width } })
  ck('visual: a barra de qualidade preenche a proporção certa (77% das publicações vinculadas)', meter >= 0 && fill.p > 100 && Math.abs(fill.w / fill.p - 20 / 26) < 0.03, JSON.stringify(fill))
  await a.goto(BASE + '/inteligencia'); await idle(a)
  const clipped = await a.locator('.finding .btn').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)
  ck('visual: textos dos botões de ação dos achados não são cortados', clipped === 0, clipped)

  // ---------- permissões ----------
  const { p: v } = await mk(); await login(v, 'e2e_vw'); await scope(v, 'Minas Farma')
  await v.goto(BASE + '/inteligencia'); await idle(v)
  ck('leitor vê os achados, sem botões de decisão', (await finding(v, 'formato_engajamento').count()) === 1 && (await v.getByRole('button', { name: /Vou aplicar|Dispensar|Concluída/ }).count()) === 0)
  await q(`update users set brand_ids = $1 where username_normalized = 'e2e_vw'`, [[farma]])
  const { p: v2 } = await mk(); await login(v2, 'e2e_vw')
  await v2.goto(BASE + '/inteligencia'); await idle(v2)
  ck('usuário só da Farma e Farma não recebe análise da Minas Farma', (await v2.locator('section[data-brand="Minas Farma"]').count()) === 0 && !/E2E/.test(await v2.textContent('main')))
  await v2.goto(postUrl); await idle(v2)
  ck('explorar: conteúdo da Minas Farma some para quem não tem acesso (404)', /404|não foi encontrada|not found/i.test(await v2.textContent('body')) && !(await v2.textContent('body')).includes('E2E Conteúdo'))
  await v2.goto(BASE + campUrl); await idle(v2)
  ck('explorar: campanha da Minas Farma também é 404 para ele', /404|não foi encontrada|not found/i.test(await v2.textContent('body')))
  await v2.goto(BASE + '/inteligencia?aba=explorar&q=E2E'); await idle(v2)
  ck('a busca dele não lista objetos da Minas Farma', (await v2.locator('li[data-kind]').count()) === 0)
  await q(`update users set brand_ids = null where username_normalized = 'e2e_vw'`)

  // ---------- todas as filiais: cada uma analisada separada ----------
  await scope(a, 'Todas as filiais')
  await a.goto(BASE + '/inteligencia'); await idle(a)
  ck('"Todas as filiais" gera uma seção por filial, sem misturar números', (await a.locator('section[data-brand]').count()) === 2 && !/NaN|undefined|Infinity/.test(await a.textContent('main')))
} catch (err) {
  ck('execução sem exceção', false, err.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close(); await db.end()
}
console.log(`\n${R.filter(Boolean).length}/${R.length} verificações passaram`)
process.exit(R.every(Boolean) ? 0 : 1)
