// Importa uma pasta de imagens NOMEADAS PELO CÓDIGO DE BARRAS (ex.: 7896512939609.png), como as que vêm de um banco de imagens de fabricante/plataforma.
//   node --env-file=.env --experimental-strip-types scripts/importar-pasta-ean.mjs --pasta "C:\pasta" --origem "Criax (franquia Farma e Farma)"            (simulação)
//   node --env-file=.env --experimental-strip-types scripts/importar-pasta-ean.mjs --pasta "C:\pasta" --origem "..." --gravar
// Só entra imagem de produto que já está no catálogo (pelo EAN) e ainda não tem foto, e só se o fundo for liso (vira transparente). O resto é descartado.
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const args = process.argv.slice(2)
const one = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] }
const PASTA = one('pasta'), ORIGEM = one('origem', 'Importação em lote'), GRAVAR = args.includes('--gravar')
if (!PASTA) { console.error('Informe --pasta "<pasta com imagens nomeadas pelo EAN>"'); process.exit(2) }
if (!process.env.DATABASE_URL) { console.error('Sem DATABASE_URL: rode com --env-file=.env'); process.exit(2) }

const { pool } = await import('../src/lib/db.ts')
const { parseEan } = await import('../src/lib/domain/catalog.ts')
const { makeTransparent } = await import('../src/lib/catalog/background.ts')
const { ingestImage } = await import('../src/lib/catalog/store.ts')

const files = (await readdir(PASTA)).filter((f) => /^\.(png|jpe?g|webp|gif)$/i.test(extname(f)))
const byEan = new Map()
for (const f of files) { const ean = parseEan(f.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/\s*\(\d+\)\s*$/, '')); if (ean && !byEan.has(ean)) byEan.set(ean, f) }
console.log(`${files.length} arquivos, ${byEan.size} com código de barras válido no nome`)
const sem = new Set((await pool.query(`select p.ean from products p where p.active and p.ean = any($1::text[]) and not exists (select 1 from product_images i where i.product_id = p.id)`, [[...byEan.keys()]])).rows.map((r) => r.ean))
console.log(`${sem.size} são produtos do catálogo que ainda estão sem foto`)
const stat = { ligada: 0, duplicada: 0, semFundoLiso: 0, invalida: 0 }
let n = 0
for (const [ean, f] of byEan) {
  if (!sem.has(ean)) continue
  const buf = await readFile(join(PASTA, f))
  if (!GRAVAR) { const c = await makeTransparent(buf); stat[c.ok ? 'ligada' : 'semFundoLiso']++; continue }
  const r = await ingestImage({ buf, fileName: f, userId: null, source: 'upload', method: 'ean', requireTransparent: true, license: `Imagem de uso interno (${ORIGEM})`, attribution: ORIGEM, productId: (await pool.query(`select id from products where ean = $1`, [ean])).rows[0]?.id })
  if (r.status === 'ligada') stat.ligada++
  else if (r.status === 'duplicada') stat.duplicada++
  else if (/fundo liso/.test(r.error ?? '')) stat.semFundoLiso++
  else stat.invalida++
  if (++n % 100 === 0) console.log(`  ${n}…`, JSON.stringify(stat))
}
console.log(GRAVAR ? 'Gravado:' : 'Simulação (nada gravado) — entrariam:', JSON.stringify(stat))
await pool.end()
