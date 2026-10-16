// Cria (ou atualiza) um tema de promoção a partir de peças prontas: o cabeçalho e o rodapé são recortados das imagens, o resto (produtos, nomes, preços) o sistema desenha.
//   node --env-file=.env --experimental-strip-types scripts/semear-tema.mjs --preset chamou-chegou --nome "Chamou, Chegou" --story story.png --feed feed.png --a4 a4.png [--gravar]
//   Presets: chamou-chegou (painel claro único) · fim-de-semana-limpeza (cartão por produto sobre fundo azul-escuro, A4 com painel cinza)
// Alturas (pixels de cima e de baixo) podem ser mudadas com --story-cab/--story-rod/--feed-cab/--feed-rod/--a4-cab/--a4-rod.
// Sem --gravar grava os recortes em ./tema-recortes para conferência e não mexe no banco.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const args = process.argv.slice(2)
const one = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] }
const GRAVAR = args.includes('--gravar')
const base = {
  colors: { skyTop: '#008ed9', skyBottom: '#6cc0f2', panel: '#fcf5f9', badge: '#0755bf', badgeEdge: '#1d1d1b', badgeText: '#ffffff', name: '#111111', tag: '#f20f0f', tagText: '#ffffff', title: '#fedf02', footer: '#014769', footerText: '#ffffff' },
  title: '', tagText: 'Uaau! 😲', showTag: true, stack: true, clouds: true, footerLines: [], cardGap: 1.2,
}
const gradiente = (w, h, a, b) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`)).png().toBuffer()
const PRESETS = {
  'chamou-chegou': {
    nome: 'Chamou, Chegou — Atacadão do Bebê',
    cortes: { story: [385, 178], feed: [385, 162], a4: [440, 0] },
    config: { ...base, grid: { story: { cols: 2, rows: 3 }, feed: { cols: 3, rows: 2 }, a4: { cols: 4, rows: 4 } }, panel: { story: true, feed: true, a4: true }, panelMargin: { story: 5, feed: 3.3, a4: 0 }, panelTuck: true, cards: { story: null, feed: null, a4: null }, gridArea: { story: null, feed: null, a4: null } },
    fundos: {},
  },
  'fim-de-semana-limpeza': {
    nome: 'Fim de Semana da Limpeza',
    cortes: { story: [437, 257], feed: [385, 238], a4: [392, 0] },
    config: {
      ...base, colors: { ...base.colors, panel: '#e2e2e2', skyTop: '#0e2d80', skyBottom: '#0a2268' }, clouds: false, cardGap: 2.2,
      grid: { story: { cols: 2, rows: 3 }, feed: { cols: 3, rows: 2 }, a4: { cols: 4, rows: 5 } },
      panel: { story: false, feed: false, a4: true }, panelMargin: { story: 7.6, feed: 1.4, a4: 0 }, panelTuck: true,
      cards: { story: '#ececec', feed: '#ffffff', a4: null },
      gridArea: { story: { top: 374, bottom: 1693 }, feed: { top: 388, bottom: 1103 }, a4: { top: 328, bottom: 2000 } },
    },
    fundos: 'auto', // degradê entre a cor da borda de baixo do cabeçalho e a da borda de cima do rodapé
  },
}
const preset = PRESETS[one('preset', 'chamou-chegou')]
if (!preset) { console.error('Preset inválido. Use: ' + Object.keys(PRESETS).join(', ')); process.exit(2) }
const NOME = one('nome', preset.nome)
const formatos = ['story', 'feed', 'a4'].filter((f) => one(f))
if (!formatos.length) { console.error('Informe ao menos uma imagem: --story / --feed / --a4'); process.exit(2) }

const cortes = {}
for (const f of formatos) {
  const buf = await readFile(one(f))
  const m = await sharp(buf).metadata()
  const hp = Number(one(`${f}-cab`, preset.cortes[f][0])), fp = Number(one(`${f}-rod`, preset.cortes[f][1]))
  const png = await sharp(buf).png().toBuffer()
  cortes[f] = {
    header: await sharp(png).extract({ left: 0, top: 0, width: m.width, height: hp }).png().toBuffer(),
    footer: fp ? await sharp(png).extract({ left: 0, top: m.height - fp, width: m.width, height: fp }).png().toBuffer() : null,
    background: null,
  }
  if (preset.fundos === 'auto' && fp) {
    // cor das laterais (30 px de cada lado; mediana, para ignorar adesivos e brilhos) na última linha do cabeçalho e na primeira do rodapé
    const lateral = async (b, y) => {
      const { data, info } = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const mediana = (x0) => [0, 1, 2].map((k) => { const v = []; for (let x = x0; x < x0 + 30; x++) v.push(data[(y * info.width + x) * 3 + k]); return v.sort((p, q) => p - q)[15] })
      const e = mediana(0), d = mediana(info.width - 30)
      return '#' + [0, 1, 2].map((k) => Math.round((e[k] + d[k]) / 2).toString(16).padStart(2, '0')).join('')
    }
    const topo = await lateral(cortes[f].header, hp - 2), base2 = await lateral(cortes[f].footer, 2)
    cortes[f].background = await gradiente(m.width, m.height, topo, base2)
  }
  console.log(`${f}: ${m.width}×${m.height} → cabeçalho ${hp} px${fp ? `, rodapé ${fp} px` : ', sem rodapé'}${cortes[f].background ? ', fundo em degradê' : ''}`)
}

if (!GRAVAR) {
  await mkdir('tema-recortes', { recursive: true })
  for (const f of formatos) { await writeFile(`tema-recortes/${f}-cabecalho.png`, cortes[f].header); if (cortes[f].footer) await writeFile(`tema-recortes/${f}-rodape.png`, cortes[f].footer); if (cortes[f].background) await writeFile(`tema-recortes/${f}-fundo.png`, cortes[f].background) }
  await writeFile('tema-recortes/config.json', JSON.stringify(preset.config, null, 1))
  console.log('(simulação: recortes salvos em ./tema-recortes; nada foi gravado no banco)')
  process.exit(0)
}
if (!process.env.DATABASE_URL) { console.error('Sem DATABASE_URL: rode com --env-file=.env'); process.exit(2) }
const { pool } = await import('../src/lib/db.ts')
const { createTheme, saveThemeConfig, setThemeAsset } = await import('../src/lib/promo/store.ts')
let id = (await pool.query(`select id from promo_themes where name = $1`, [NOME])).rows[0]?.id
if (!id) { const r = await createTheme(NOME, (await pool.query(`select id from users where role = 'admin' order by created_at limit 1`)).rows[0]?.id ?? null); if (!r.ok) { console.error(r.error); process.exit(1) } id = r.id }
console.log((await saveThemeConfig(id, NOME, preset.config)).ok ? 'configuração gravada' : 'falha ao gravar a configuração')
for (const f of formatos) {
  const a = await setThemeAsset(id, 'header', f, cortes[f].header); console.log(f, 'cabeçalho', a.ok ? 'ok' : a.error)
  if (cortes[f].footer) { const b = await setThemeAsset(id, 'footer', f, cortes[f].footer); console.log(f, 'rodapé', b.ok ? 'ok' : b.error) }
  if (cortes[f].background) { const c = await setThemeAsset(id, 'background', f, cortes[f].background); console.log(f, 'fundo', c.ok ? 'ok' : c.error) }
}
console.log('Tema pronto:', id)
await pool.end()
