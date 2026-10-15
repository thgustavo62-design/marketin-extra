// Imagens de produto pelo código de barras (EAN) nos bancos abertos Open Beauty / Products / Pet Food / Food Facts (imagens CC BY-SA 3.0).
// Medicamentos ficam de fora. Em vez de consultar 27 mil códigos um a um, lê os arquivos públicos completos (dumps) e guarda só os códigos que a rede tem.
//
//   Fase 1 (achar): node --env-file=.env --experimental-strip-types scripts/imagens-abertas.mjs --erp a.xlsx --erp b.xlsx --pasta <dir>
//        grava <dir>/achados.json  (não escreve no banco; lê só a lista da CMED, se houver DATABASE_URL, para excluir medicamentos)
//   Fase 2 (gravar): node --env-file=.env --experimental-strip-types scripts/imagens-abertas.mjs --pasta <dir> --gravar [--limite N]
//        baixa as imagens achadas (≤ 1 por segundo por servidor) e grava nos produtos já importados, com fonte, licença e crédito.
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { join } from 'node:path'

const args = process.argv.slice(2)
const all = (k) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []))
const one = (k, d) => all(k)[0] ?? d
const PASTA = one('pasta'), GRAVAR = args.includes('--gravar'), LIMITE = Number(one('limite', 0))
if (!PASTA) { console.error('Informe --pasta <diretório de trabalho>'); process.exit(2) }
await mkdir(PASTA, { recursive: true })

const SOURCES = [
  { key: 'open_beauty_facts', label: 'Open Beauty Facts', url: 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz', page: 'https://world.openbeautyfacts.org/product' },
  { key: 'open_products_facts', label: 'Open Products Facts', url: 'https://static.openproductsfacts.org/data/en.openproductsfacts.org.products.csv.gz', page: 'https://world.openproductsfacts.org/product' },
  { key: 'open_pet_food_facts', label: 'Open Pet Food Facts', url: 'https://static.openpetfoodfacts.org/data/en.openpetfoodfacts.org.products.csv.gz', page: 'https://world.openpetfoodfacts.org/product' },
  { key: 'open_food_facts', label: 'Open Food Facts', url: 'https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz', page: 'https://world.openfoodfacts.org/product' },
]
const ACHADOS = join(PASTA, 'achados.json')

if (!GRAVAR) {
  // ---------- fase 1: EANs da rede (sem medicamentos) ----------
  const erp = all('erp')
  if (!erp.length) { console.error('Informe --erp "planilha.xlsx"'); process.exit(2) }
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgres://simulacao:x@127.0.0.1:1/x'
  const { parseErpXlsx, mergeErpRows } = await import('../src/lib/catalog/erp.ts')
  const { isMedicine } = await import('../src/lib/domain/catalog.ts')
  const rows = []
  for (const f of erp) { const p = await parseErpXlsx(await readFile(f)); if (!p.ok) { console.error(`${f}: ${p.error}`); process.exit(1) } rows.push(...p.rows) }
  let cmed = new Map()
  if (!process.env.DATABASE_URL.includes('simulacao')) {
    const { pool } = await import('../src/lib/db.ts')
    cmed = new Map((await pool.query(`select e, c.tarja from cmed_products c, unnest(c.eans) e`)).rows.map((r) => [r.e, r.tarja]))
    await pool.end()
    console.log(`Lista da CMED: ${cmed.size} códigos de medicamentos`)
  } else console.log('Sem DATABASE_URL: medicamentos excluídos só por registro MS e grupo do ERP (use --env-file=.env para incluir a CMED).')
  const merged = mergeErpRows(rows).filter((m) => m.ean && (m.stock == null || m.stock > 0)) // só o que tem saldo em estoque
  const keep = merged.filter((m) => !isMedicine({ ean: m.ean, registroMs: m.registroMs, group: m.group }, cmed))
  console.log(`${merged.length} produtos com código de barras → ${keep.length} sem medicamentos (${merged.length - keep.length} medicamentos fora)`)
  const wanted = new Map(keep.map((m) => [m.ean, m.description]))

  // ---------- fase 1b: ler os arquivos públicos e guardar os códigos da rede ----------
  const hits = {}
  for (const src of SOURCES) {
    const res = await fetch(src.url, { headers: { 'User-Agent': 'ExtraMarketing/1.0 (uso interno; dados abertos)' } })
    if (!res.ok || !res.body) { console.log(`${src.label}: indisponível (${res.status})`); continue }
    const rl = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity })
    let header = null, idx = {}, lines = 0, found = 0
    for await (const line of rl) {
      if (!header) { header = line.split('\t'); header.forEach((h, i) => (idx[h] = i)); continue }
      lines++
      const tab = line.indexOf('\t')
      const code = line.slice(0, tab)
      if (!wanted.has(code)) continue
      const c = line.split('\t')
      const url = c[idx.image_front_url] || c[idx.image_url]
      if (!url || !/^https:\/\/images\.open(beauty|food|products|petfood)facts\.org\//.test(url)) continue
      ;(hits[code] ??= []).push({ source: src.key, label: src.label, name: c[idx.product_name] || null, brands: c[idx.brands] || null, url, page: `${src.page}/${code}` })
      found++
    }
    console.log(`${src.label}: ${lines.toLocaleString('pt-BR')} produtos lidos, ${found} com foto na rede`)
  }
  await writeFile(ACHADOS, JSON.stringify({ geradoEm: new Date().toISOString(), total: wanted.size, hits }, null, 1))
  console.log(`\n${Object.keys(hits).length} códigos da rede têm foto em bancos abertos (de ${wanted.size}). Gravado em ${ACHADOS}`)
  process.exit(0)
}

// ---------- fase 2: baixar e gravar ----------
if (!process.env.DATABASE_URL) { console.error('Sem DATABASE_URL: rode com --env-file=.env'); process.exit(2) }
if (!existsSync(ACHADOS)) { console.error('Rode a fase 1 antes (sem --gravar).'); process.exit(2) }
const { hits } = JSON.parse(await readFile(ACHADOS, 'utf8'))
const { pool } = await import('../src/lib/db.ts')
const { ingestImage } = await import('../src/lib/catalog/store.ts')
const { OPEN_LICENSE } = await import('../src/lib/catalog/open-data.ts')
const prods = new Map((await pool.query(`select ean, id from products where ean = any($1::text[]) and active`, [Object.keys(hits)])).rows.map((r) => [r.ean, r.id]))
const have = new Set((await pool.query(`select p.ean from products p join product_images i on i.product_id = p.id where i.source like 'open_%' or i.source = 'proprio' or i.source = 'upload'`)).rows.map((r) => r.ean))
const todo = Object.entries(hits).filter(([ean]) => prods.has(ean) && !have.has(ean))
console.log(`${Object.keys(hits).length} achados · ${prods.size} já estão no catálogo · ${have.size} produtos já têm imagem · ${todo.length} a baixar`)
const stat = { ligada: 0, duplicada: 0, invalida: 0, semFoto: 0 }
const last = {}
let n = 0
const UA = { 'User-Agent': 'ExtraMarketing/1.0 (uso interno; dados abertos)' }
for (const [ean, list] of todo) {
  if (LIMITE && n >= LIMITE) break
  n++
  let done = false
  for (const h of list) {
    const host = new URL(h.url).host
    const wait = 1000 - (Date.now() - (last[host] ?? 0)); if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    last[host] = Date.now()
    const big = h.url.replace(/\.(\d+)\.jpg$/, '.full.jpg')
    let buf = null
    for (const u of big !== h.url ? [big, h.url] : [h.url]) {
      try { const r = await fetch(u, { headers: UA }); if (r.ok && Number(r.headers.get('content-length') ?? 0) < 8e6) { buf = Buffer.from(await r.arrayBuffer()); break } } catch { /* tenta a próxima */ }
    }
    if (!buf) continue
    const r = await ingestImage({ buf, fileName: `${ean}.jpg`, userId: null, source: h.source, productId: prods.get(ean), method: 'ean', license: OPEN_LICENSE, attribution: `${h.label} — colaboradores${h.brands ? ` (${h.brands})` : ''}`, sourceUrl: h.page })
    stat[r.status === 'ligada' ? 'ligada' : r.status === 'duplicada' ? 'duplicada' : 'invalida']++
    done = true
    break
  }
  if (!done) stat.semFoto++
  if (n % 50 === 0) console.log(`  ${n}/${todo.length}…`, JSON.stringify(stat))
}
console.log('Concluído:', JSON.stringify(stat))
await pool.end()
