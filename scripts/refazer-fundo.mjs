// Refaz o fundo transparente das imagens que já estão no banco, com o recorte atual (src/lib/catalog/background.ts), a partir da foto ORIGINAL.
//   node --env-file=.env --experimental-strip-types scripts/refazer-fundo.mjs --criax "<pasta de fotos do Criax nomeadas pelo EAN>"           (simulação)
//   node --env-file=.env --experimental-strip-types scripts/refazer-fundo.mjs --criax "<pasta>" --gravar
// - foto do Criax: usa o arquivo original da pasta (pelo EAN); as demais usam a original guardada no banco (coluna original)
// - placeholder do Criax ("PRODUTO SEM IMAGEM": o mesmo arquivo repetido em vários produtos) é removido
// - recorte novo bem-sucedido substitui o antigo; se o novo não for possível, o antigo fica (menos quando veio de recorte por IA, que é descartado)
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const args = process.argv.slice(2)
const one = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] }
const GRAVAR = args.includes('--gravar'), PASTA = one('criax')
if (!process.env.DATABASE_URL) { console.error('Sem DATABASE_URL: rode com --env-file=.env'); process.exit(2) }
const { pool } = await import('../src/lib/db.ts')
const { makeTransparent } = await import('../src/lib/catalog/background.ts')
const { processImage } = await import('../src/lib/catalog/images.ts')

// arquivos do Criax por EAN + deteção de placeholder (mesmo conteúdo em 3+ produtos)
const arquivos = new Map()
const porHash = new Map()
if (PASTA) {
  for (const f of await readdir(PASTA)) {
    const ean = f.replace(/\.\w+$/, '')
    const buf = await readFile(join(PASTA, f))
    arquivos.set(ean, join(PASTA, f))
    const h = createHash('sha256').update(buf).digest('hex')
    ;(porHash.get(h) ?? porHash.set(h, []).get(h)).push(ean)
  }
}
const placeholders = new Set([...porHash.values()].filter((l) => l.length >= 3).flat())
console.log(`${arquivos.size} arquivos do Criax · ${placeholders.size} são placeholder (mesmo arquivo repetido em vários produtos)`)

const rows = (await pool.query(`select i.id, i.product_id, i.attribution, i.fundo, p.ean from product_images i join products p on p.id = i.product_id where i.product_id is not null order by i.created_at`)).rows
console.log(`${rows.length} imagens ligadas a produtos`)
const stat = { refeita: 0, mantida: 0, placeholderRemovida: 0, descartadaIA: 0, duplicada: 0, erro: 0 }
const motivos = {}
let n = 0
for (const r of rows) {
  n++
  const criax = (r.attribution ?? '').startsWith('Criax')
  const deIA = (r.attribution ?? '').includes('por IA')
  try {
    if (criax && placeholders.has(r.ean)) { stat.placeholderRemovida++; if (GRAVAR) await del(r); continue }
    let src
    if (criax && arquivos.has(r.ean)) src = await readFile(arquivos.get(r.ean))
    else { const x = (await pool.query(`select original, data from product_images where id = $1`, [r.id])).rows[0]; src = x.original ?? x.data }
    const cut = await makeTransparent(src)
    if (!cut.ok) {
      motivos[cut.reason] = (motivos[cut.reason] ?? 0) + 1
      if (deIA) { stat.descartadaIA++; if (GRAVAR) await del(r) } else stat.mantida++
      continue
    }
    const novo = await processImage(cut.png), fonte = await processImage(src)
    if (!novo.ok || !fonte.ok) { stat.erro++; continue }
    stat.refeita++
    if (GRAVAR) {
      try {
        await pool.query(`update product_images set data = $2, thumb = $3, width = $4, height = $5, size_bytes = $6, sha256 = $7, original = $8, fundo = 'transparente' where id = $1`,
          [r.id, novo.image.data, novo.image.thumb, novo.image.width, novo.image.height, novo.image.data.length, novo.image.sha256, fonte.image.data])
      } catch (e) { if (e.code === '23505') { stat.duplicada++; await del(r) } else throw e }
    }
  } catch (e) { stat.erro++ }
  if (n % 200 === 0) console.log(`  ${n}/${rows.length}`, JSON.stringify(stat))
}
async function del(r) {
  await pool.query(`delete from product_images where id = $1`, [r.id])
  if (r.product_id) await pool.query(`update product_images set is_primary = true where id = (select id from product_images where product_id = $1 order by created_at limit 1) and not exists (select 1 from product_images where product_id = $1 and is_primary)`, [r.product_id])
}
console.log(GRAVAR ? 'Gravado:' : 'Simulação:', JSON.stringify(stat), JSON.stringify(motivos))
await pool.end()
