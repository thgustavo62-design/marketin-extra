// Carga em massa do catálogo de produtos: planilhas do ERP + pastas de imagens recortadas.
//   node --experimental-strip-types scripts/importar-catalogo.mjs --erp "a.xlsx" --erp "b.xlsx" --imagens "pasta1" --imagens "pasta2"            (simulação: não grava nada, só mostra como ficaria)
//   node --env-file=.env --experimental-strip-types scripts/importar-catalogo.mjs ... --gravar                                                  (grava no banco do DATABASE_URL)
// Mesmas regras do site: a descrição do ERP manda, o nome do arquivo é comparado à descrição (exata / parecida / dúvida) e o que não for certo vai para a fila de conferência.
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const args = process.argv.slice(2)
const all = (k) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []))
const GRAVAR = args.includes('--gravar')
const erpFiles = all('erp'), dirs = all('imagens')
if (!erpFiles.length) { console.error('Informe ao menos uma planilha: --erp "arquivo.xlsx"'); process.exit(2) }
if (GRAVAR && !process.env.DATABASE_URL) { console.error('Sem DATABASE_URL: rode com --env-file=.env'); process.exit(2) }

if (!GRAVAR) process.env.DATABASE_URL ||= 'postgres://simulacao:x@127.0.0.1:1/x' // a simulação não conecta ao banco
const { parseErpXlsx, mergeErpRows, upsertProducts } = await import('../src/lib/catalog/erp.ts')
const { buildIndex, isMedicine, matchName, nameFromFile } = await import('../src/lib/domain/catalog.ts')

// ---------- 1. produtos do ERP ----------
const allRows = []
for (const f of erpFiles) {
  const p = await parseErpXlsx(await readFile(f))
  if (!p.ok) { console.error(`${f}: ${p.error}`); process.exit(1) }
  console.log(`ERP ${f.split(/[\\/]/).pop()}: ${p.rows.length} linhas`)
  allRows.push(...p.rows)
}
let cmed = new Set()
if (!process.env.DATABASE_URL.includes('simulacao')) { const { pool } = await import('../src/lib/db.ts'); cmed = new Set((await pool.query(`select unnest(eans) e from cmed_products`)).rows.map((r) => r.e)); if (!GRAVAR) await pool.end() }
// só o que tem saldo em estoque
const todos = mergeErpRows(allRows).filter((m) => m.stock == null || m.stock > 0)
// banco de imagens não inclui medicamentos
const merged = todos.filter((m) => !isMedicine({ ean: m.ean, registroMs: m.registroMs, group: m.group }, cmed))
console.log(`→ ${todos.length} produtos únicos com estoque; ${todos.length - merged.length} medicamentos ficam de fora; ${merged.length} no banco de imagens (${merged.filter((m) => m.ean).length} com código de barras)`)
if (GRAVAR) {
  const r = await upsertProducts(allRows, null)
  console.log(`Gravado: ${r.created} novos, ${r.updated} atualizados, ${r.enriched} enriquecidos com a CMED.`)
}

// ---------- 2. imagens ----------
const walk = async (d) => (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])))).flat()
const files = []
for (const d of dirs) files.push(...(await walk(d)).filter((f) => /^\.(png|jpe?g|webp|gif)$/i.test(extname(f))))
if (!files.length) { console.log('Sem pastas de imagens informadas.'); process.exit(0) }
console.log(`\n${files.length} imagens encontradas`)

const stat = { exata: 0, similar: 0, incerto: 0, nenhum: 0, semNome: 0 }
const exemplos = { similar: [], incerto: [], nenhum: [] }
let ingest = null, closePool = null
if (GRAVAR) { ingest = (await import('../src/lib/catalog/store.ts')).ingestImage; closePool = (await import('../src/lib/db.ts')).pool }
const idx = buildIndex(merged.flatMap((m, i) => [m.description, ...m.aliases].map((d) => ({ id: String(i), description: d }))))
const res = { ligada: 0, pendente: 0, duplicada: 0, invalida: 0 }
for (const f of files) {
  const { name } = nameFromFile(f)
  stat.last = null
  if (!name) stat.semNome++
  else {
    const m = matchName(idx, name)
    stat[m.decision]++; stat.last = m.decision
    if (m.decision !== 'exata' && exemplos[m.decision] && exemplos[m.decision].length < 8) exemplos[m.decision].push(`${name}  →  ${m.best ? merged[Number(m.best.id)].description + ` (${Math.round(m.best.score * 100)}%)` : '—'}`)
  }
  // só grava imagem que tem produto (ou dúvida com sugestões); o que não existe no ERP sem medicamento (inclusive embalagem de remédio) não entra
  const keep = name && (stat.last !== 'nenhum')
  if (ingest && keep) {
    const r = await ingest({ buf: await readFile(f), fileName: f.split(/[\\/]/).pop(), userId: null, source: 'proprio' })
    res[r.status === 'ligada' ? 'ligada' : r.status]++
  }
}
console.log(`\nCasamento por nome: ${stat.exata} exatas · ${stat.similar} parecidas (ligam, ficam para conferir) · ${stat.incerto} em dúvida (fila) · ${stat.nenhum} sem produto parecido · ${stat.semNome} sem nome aproveitável`)
for (const k of ['similar', 'incerto', 'nenhum']) if (exemplos[k].length) console.log(`\nExemplos (${k}):\n  ` + exemplos[k].join('\n  '))
if (ingest) console.log(`\nGravado: ${res.ligada} ligadas, ${res.pendente} na fila, ${res.duplicada} repetidas, ${res.invalida} recusadas.`)
else console.log('\n(simulação: nada foi gravado. Acrescente --gravar para gravar.)')
await closePool?.end()
