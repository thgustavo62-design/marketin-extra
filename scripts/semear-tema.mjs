// Cria (ou atualiza) um tema de promoção a partir de peças prontas: o cabeçalho e o rodapé são recortados das imagens (sem produtos nem preços no recorte).
//   node --env-file=.env --experimental-strip-types scripts/semear-tema.mjs --nome "Chamou, Chegou" --story story.png --feed feed.png --a4 a4.png [--gravar]
// Alturas padrão (em pixels de cima e de baixo): story 385/178, feed 385/162, a4 440/0. Mude com --story-cab/--story-rod/--feed-cab/--feed-rod/--a4-cab/--a4-rod.
// Sem --gravar grava as peças recortadas em ./tema-recortes para conferência e não mexe no banco.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const args = process.argv.slice(2)
const one = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] }
const NOME = one('nome'), GRAVAR = args.includes('--gravar')
if (!NOME) { console.error('Informe --nome "Nome do tema"'); process.exit(2) }
const DEF = { story: [385, 178], feed: [385, 162], a4: [440, 0] }
const formatos = ['story', 'feed', 'a4'].filter((f) => one(f))
if (!formatos.length) { console.error('Informe ao menos uma imagem: --story / --feed / --a4'); process.exit(2) }

const cortes = {}
for (const f of formatos) {
  const buf = await readFile(one(f))
  const m = await sharp(buf).metadata()
  const hp = Number(one(`${f}-cab`, DEF[f][0])), fp = Number(one(`${f}-rod`, DEF[f][1]))
  const png = await sharp(buf).png().toBuffer()
  cortes[f] = { header: await sharp(png).extract({ left: 0, top: 0, width: m.width, height: hp }).png().toBuffer(), footer: fp ? await sharp(png).extract({ left: 0, top: m.height - fp, width: m.width, height: fp }).png().toBuffer() : null, w: m.width, h: m.height, hp, fp }
  console.log(`${f}: ${m.width}×${m.height} → cabeçalho ${hp} px${fp ? `, rodapé ${fp} px` : ', sem rodapé'}`)
}

const config = {
  colors: { skyTop: '#008ed9', skyBottom: '#6cc0f2', panel: '#fcf5f9', badge: '#0755bf', badgeEdge: '#1d1d1b', badgeText: '#ffffff', name: '#111111', tag: '#f20f0f', tagText: '#ffffff', title: '#fedf02', footer: '#014769', footerText: '#ffffff' },
  title: '', tagText: 'Uaau! 😲', showTag: true, stack: true, footerLines: [],
  grid: { story: { cols: 2, rows: 3 }, feed: { cols: 3, rows: 2 }, a4: { cols: 4, rows: 4 } },
  panel: { story: true, feed: true, a4: true },
  panelMargin: { story: 5, feed: 3.3, a4: 0 },
  panelTuck: true,
}

if (!GRAVAR) {
  await mkdir('tema-recortes', { recursive: true })
  for (const f of formatos) { await writeFile(`tema-recortes/${f}-cabecalho.png`, cortes[f].header); if (cortes[f].footer) await writeFile(`tema-recortes/${f}-rodape.png`, cortes[f].footer) }
  console.log('(simulação: recortes salvos em ./tema-recortes; nada foi gravado no banco)')
  process.exit(0)
}
if (!process.env.DATABASE_URL) { console.error('Sem DATABASE_URL: rode com --env-file=.env'); process.exit(2) }
const { pool } = await import('../src/lib/db.ts')
const { createTheme, saveThemeConfig, setThemeAsset } = await import('../src/lib/promo/store.ts')
let id = (await pool.query(`select id from promo_themes where name = $1`, [NOME])).rows[0]?.id
if (!id) { const r = await createTheme(NOME, (await pool.query(`select id from users where role = 'admin' order by created_at limit 1`)).rows[0]?.id ?? null); if (!r.ok) { console.error(r.error); process.exit(1) } id = r.id }
console.log((await saveThemeConfig(id, NOME, config)).ok ? 'configuração gravada' : 'falha ao gravar a configuração')
for (const f of formatos) {
  const a = await setThemeAsset(id, 'header', f, cortes[f].header); console.log(f, 'cabeçalho', a.ok ? 'ok' : a.error)
  if (cortes[f].footer) { const b = await setThemeAsset(id, 'footer', f, cortes[f].footer); console.log(f, 'rodapé', b.ok ? 'ok' : b.error) }
}
console.log('Tema pronto:', id)
await pool.end()
