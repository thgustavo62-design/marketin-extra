// Aplica a regra "foto profissional com fundo transparente" às imagens que já estão no banco.
//   node --env-file=.env --experimental-strip-types scripts/fundo-transparente.mjs            (simulação: só conta)
//   node --env-file=.env --experimental-strip-types scripts/fundo-transparente.mjs --gravar
// - fundo liso (estúdio/recorte): vira PNG/WEBP transparente; a original fica guardada em product_images.original
// - foto de banco aberto SEM fundo liso (foto amadora: mão, prateleira, cenário): é excluída
// - recorte próprio sem fundo liso: fica como está, marcada "Fundo original" (lista no final para refazer o recorte)
const GRAVAR = process.argv.includes('--gravar')
const { pool } = await import('../src/lib/db.ts')
const { makeTransparent } = await import('../src/lib/catalog/background.ts')
const { processImage } = await import('../src/lib/catalog/images.ts')

const ids = (await pool.query(`select id from product_images where fundo is null order by created_at`)).rows.map((r) => r.id)
console.log(`${ids.length} imagens a tratar${GRAVAR ? '' : ' (simulação)'}`)
const stat = { transparente: 0, apagadaAmadora: 0, mantidaOriginal: 0, duplicada: 0, erro: 0 }
const manter = []
let n = 0
for (const id of ids) {
  n++
  const r = (await pool.query(`select id, product_id, is_primary, source, original_name, data from product_images where id = $1`, [id])).rows[0]
  if (!r) continue
  const cut = await makeTransparent(r.data)
  const open = r.source.startsWith('open_')
  if (cut.ok) {
    const p = await processImage(cut.png)
    if (!p.ok) { stat.erro++; continue }
    stat.transparente++
    if (GRAVAR) {
      try {
        await pool.query(`update product_images set original = data, data = $2, thumb = $3, width = $4, height = $5, size_bytes = $6, sha256 = $7, fundo = 'transparente' where id = $1`,
          [id, p.image.data, p.image.thumb, p.image.width, p.image.height, p.image.data.length, p.image.sha256])
      } catch (e) {
        if (e.code === '23505') { await pool.query(`delete from product_images where id = $1`, [id]); stat.duplicada++ } else throw e
      }
    }
  } else if (open) {
    stat.apagadaAmadora++
    if (GRAVAR) {
      await pool.query(`delete from product_images where id = $1`, [id])
      // se era a principal, promove outra imagem do mesmo produto
      if (r.product_id && r.is_primary) await pool.query(`update product_images set is_primary = true where id = (select id from product_images where product_id = $1 order by created_at limit 1)`, [r.product_id])
    }
  } else {
    stat.mantidaOriginal++
    manter.push(`${r.original_name ?? id} (${cut.reason})`)
    if (GRAVAR) await pool.query(`update product_images set fundo = 'original' where id = $1`, [id])
  }
  if (n % 100 === 0) console.log(`  ${n}/${ids.length}`, JSON.stringify(stat))
}
console.log('Concluído:', JSON.stringify(stat))
if (manter.length) console.log(`\nRecortes que mantêm o fundo original (${manter.length}):\n  ` + manter.join('\n  '))
await pool.end()
