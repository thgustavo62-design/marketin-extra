import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imagePlacement, panImage, pasteLayers, duplicateLayers, alignSelection, boundsOf, distribute, expandSelection, groupLayers, moveSelection, scaleSelection, ungroupLayers, alignToPage, layersForPage, makeLayer, normalizeLayers, reorderLayer, snap, MAX_LAYERS, type Layer } from '../src/lib/domain/promo-layers.ts'

const ASSET = '3f2b6c1e-8a4d-4c7e-9f10-2b5d6e7a8c90'

test('camadas: só aceita elementos válidos (tipo, id, cor, tamanho, imagem com arquivo) e limita a quantidade', () => {
  const r = normalizeLayers({
    story: [
      { id: 'a1b2c3', type: 'text', x: 10, y: 20, w: 400, h: 100, text: 'Oferta', color: '#FF0000', size: 9999, opacity: 7, align: 'meio' },
      { id: 'a1b2c3', type: 'text' }, // id repetido: descartado
      { id: 'img001', type: 'image', asset: 'nao-e-uuid' }, // imagem sem arquivo válido: descartada
      { id: 'img002', type: 'image', asset: ASSET, w: 300, h: 300 },
      { id: 'sh0001', type: 'shape', shape: 'estrela', fill: 'azul', borderW: 500 },
      { id: 'xx', type: 'text' }, // id curto demais
      { id: 'weird1', type: 'video' },
    ],
    feed: 'lixo',
  })
  assert.equal(r.story.length, 3)
  assert.equal(r.story[0].color, '#ff0000')
  assert.equal(r.story[0].size, 600) // limitado
  assert.equal(r.story[0].opacity, 1) // limitado a 0–1
  assert.equal(r.story[0].align, 'center') // valor inválido volta ao padrão
  assert.equal(r.story[1].asset, ASSET)
  assert.equal(r.story[2].shape, 'rect'); assert.equal(r.story[2].fill, '#ffd21f'); assert.equal(r.story[2].borderW, 80)
  assert.deepEqual(r.feed, [])
  const many = normalizeLayers({ a4: Array.from({ length: 80 }, (_, i) => ({ id: `t${String(i).padStart(4, '0')}`, type: 'text' })) })
  assert.equal(many.a4.length, MAX_LAYERS)
  assert.deepEqual(normalizeLayers(null), { story: [], feed: [], a4: [] })
})

test('camadas por peça: "todas" aparecem sempre; as de uma peça só nela; ocultas não aparecem', () => {
  const l = (id: string, page: number | null, hidden = false): Layer => ({ ...makeLayer('shape', 'story'), id, page, hidden })
  const list = [l('todas', null), l('p0', 0), l('p1', 1), l('oculta', null, true)]
  assert.deepEqual(layersForPage(list, 0).map((x) => x.id), ['todas', 'p0'])
  assert.deepEqual(layersForPage(list, 1).map((x) => x.id), ['todas', 'p1'])
})

test('alinhar à peça e trocar de camada', () => {
  const l = { ...makeLayer('shape', 'story'), x: 100, y: 100, w: 200, h: 100 }
  assert.equal(alignToPage(l, 'hcenter', 1080, 1920).x, 440)
  assert.equal(alignToPage(l, 'right', 1080, 1920).x, 880)
  assert.equal(alignToPage(l, 'vcenter', 1080, 1920).y, 910)
  assert.equal(alignToPage(l, 'bottom', 1080, 1920).y, 1820)
  const ids = (x: Layer[]) => x.map((i) => i.id).join()
  const base = ['a', 'b', 'c'].map((id) => ({ ...makeLayer('shape', 'feed'), id }))
  assert.equal(ids(reorderLayer(base, 'a', 'front')), 'b,c,a')
  assert.equal(ids(reorderLayer(base, 'c', 'back')), 'c,a,b')
  assert.equal(ids(reorderLayer(base, 'a', 'up')), 'b,a,c')
  assert.equal(ids(reorderLayer(base, 'c', 'down')), 'a,c,b')
  assert.equal(ids(reorderLayer(base, 'c', 'up')), 'a,b,c') // já no topo
})

test('ímã do arrasto: encosta no centro da peça e nas bordas dos outros elementos dentro de 8 px', () => {
  const s = snap({ x: 436, y: 100, w: 200, h: 100 }, 1080, 1920, [])
  assert.equal(s.dx, 4); assert.deepEqual(s.guidesX, [540]) // centro do elemento (536) → centro da peça (540)
  assert.equal(s.dy, 0)
  const longe = snap({ x: 300, y: 300, w: 100, h: 100 }, 1080, 1920, [])
  assert.deepEqual([longe.dx, longe.dy, longe.guidesX.length, longe.guidesY.length], [0, 0, 0, 0])
  const outro = snap({ x: 502, y: 700, w: 100, h: 50 }, 1080, 1920, [{ x: 500, y: 100, w: 300, h: 300 }])
  assert.equal(outro.dx, -2) // borda esquerda encosta na do outro elemento
})

test('novo elemento nasce dentro da peça, no meio', () => {
  const t = makeLayer('text', 'feed')
  assert.ok(t.x >= 0 && t.x + t.w <= 1080 && t.y >= 0 && t.y + t.h <= 1350)
  assert.equal(t.type, 'text'); assert.equal(t.page, null); assert.equal(t.hidden, false)
})

const L = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Layer> = {}): Layer => ({ id, type: 'shape', x, y, w, h, rot: 0, opacity: 1, hidden: false, locked: false, page: null, shape: 'rect', fill: '#ffd21f', ...extra })

test('seleção: a caixa que envolve considera o giro e o grupo seleciona todos os membros', () => {
  assert.deepEqual(boundsOf([L('a1111', 0, 0, 100, 50), L('b2222', 200, 100, 100, 100)], ['a1111', 'b2222']), { x: 0, y: 0, w: 300, h: 200 })
  const girado = boundsOf([L('c3333', 100, 100, 100, 100, { rot: 45 })], ['c3333'])!
  assert.ok(Math.abs(girado.w - 141.42) < 0.1)
  assert.equal(boundsOf([], ['x']), null)
  const g = groupLayers([L('a1111', 0, 0, 10, 10), L('b2222', 20, 0, 10, 10), L('c3333', 40, 0, 10, 10)], ['a1111', 'b2222'])
  assert.equal(g[0].group, g[1].group); assert.ok(g[0].group); assert.equal(g[2].group, undefined)
  assert.deepEqual(expandSelection(g, ['a1111']), ['a1111', 'b2222'])
  assert.equal(groupLayers(g, ['c3333']).length, 3) // um só não forma grupo
  assert.ok(groupLayers([L('a1111', 0, 0, 10, 10)], ['a1111'])[0].group === undefined)
  const u = ungroupLayers(g, ['b2222'])
  assert.ok(u.every((l) => l.group === undefined))
  assert.equal(normalizeLayers({ story: [{ id: 'g00001', type: 'shape', group: 'grp-1' }, { id: 'g00002', type: 'shape', group: '!!' }] }).story.map((l) => l.group).join(','), 'grp-1,')
})

test('alinhar e distribuir a seleção; mover e escalar como bloco', () => {
  const base = [L('a1111', 10, 0, 100, 50), L('b2222', 200, 40, 50, 50), L('c3333', 400, 80, 100, 20)]
  assert.deepEqual(alignSelection(base, ['a1111', 'b2222', 'c3333'], 'left', 1080, 1920).map((l) => l.x), [10, 10, 10])
  assert.deepEqual(alignSelection(base, ['a1111', 'b2222', 'c3333'], 'bottom', 1080, 1920).map((l) => l.y + l.h), [100, 100, 100])
  assert.equal(alignSelection(base, ['b2222'], 'hcenter', 1000, 1000)[1].x, 475) // um só: à peça
  const dist = distribute(base, ['a1111', 'b2222', 'c3333'], 'h')
  const gaps = [dist[1].x - (dist[0].x + dist[0].w), dist[2].x - (dist[1].x + dist[1].w)]
  assert.ok(Math.abs(gaps[0] - gaps[1]) <= 1)
  assert.equal(distribute(base, ['a1111', 'b2222'], 'h'), base) // menos de 3: não muda
  assert.deepEqual(moveSelection(base, ['a1111'], 5, -5)[0], { ...base[0], x: 15, y: -5 })
  assert.equal(moveSelection([L('l0000', 0, 0, 10, 10, { locked: true })], ['l0000'], 50, 50)[0].x, 0) // bloqueado não move
  const dobro = scaleSelection([L('a1111', 0, 0, 100, 50), { ...L('t0000', 100, 0, 100, 50), type: 'text', size: 40 }], ['a1111', 't0000'], { x: 0, y: 0, w: 200, h: 50 }, { x: 0, y: 0, w: 400, h: 100 })
  assert.deepEqual([dobro[0].x, dobro[0].w, dobro[1].x, dobro[1].w, dobro[1].size], [0, 200, 200, 200, 80])
})

test('duplicar a seleção: copias novas deslocadas; cada grupo copiado vira um grupo novo', () => {
  const g = groupLayers([L('a1111', 0, 0, 10, 10), L('b2222', 20, 0, 10, 10), L('c3333', 40, 0, 10, 10, { locked: true })], ['a1111', 'b2222'])
  const r = duplicateLayers(g, ['a1111', 'b2222', 'c3333'])
  assert.equal(r.added.length, 3)
  assert.ok(r.added.every((l, i) => l.id !== g[i].id && l.x === g[i].x + 24 && l.y === 24))
  assert.equal(r.added[0].group, r.added[1].group)
  assert.notEqual(r.added[0].group, g[0].group)
  assert.equal(r.added[2].locked, false)
  assert.deepEqual(duplicateLayers(g, ['nao-existe']).ids, [])
})

test('colar: mesma peça desloca; outro formato muda de proporção; grupos viram grupos novos; "todas as peças" continua valendo', () => {
  const g = groupLayers([L('a1111', 100, 200, 300, 100, { page: 0 }), L('b2222', 500, 600, 100, 100, { page: null })], ['a1111', 'b2222'])
  const mesma = pasteLayers({ fmt: 'story', layers: g }, 'story', 3)
  assert.deepEqual(mesma.added.map((l) => [l.x, l.y, l.w]), [[124, 224, 300], [524, 624, 100]])
  assert.deepEqual(mesma.added.map((l) => l.page), [3, null])
  assert.ok(mesma.added[0].group && mesma.added[0].group === mesma.added[1].group && mesma.added[0].group !== g[0].group)
  const feed = pasteLayers({ fmt: 'story', layers: [{ ...L('t0000', 540, 960, 540, 100), type: 'text', size: 80 }] }, 'feed', 0)
  assert.deepEqual([feed.added[0].x, feed.added[0].y, feed.added[0].w, feed.added[0].size], [540, 675, 540, 80]) // story e feed têm a mesma largura (1080)
  const a4 = pasteLayers({ fmt: 'story', layers: [{ ...L('t0000', 540, 960, 540, 100), type: 'text', size: 80 }] }, 'a4', 0)
  assert.equal(a4.added[0].w, Math.round(540 * (1414 / 1080))); assert.equal(a4.added[0].size, Math.round(80 * (1414 / 1080)))
  assert.ok(a4.added[0].id !== 't0000')
})

test('elementos: fontes do catálogo, formas novas, degradê, tracejado e sombra são validados', () => {
  const r = normalizeLayers({ story: [
    { id: 'f00001', type: 'text', font: 'bebas' },
    { id: 'f00002', type: 'text', font: 'Comic Sans' },
    { id: 'f00003', type: 'shape', shape: 'star', fill: '#ff0000', fill2: '#0000ff', gradAngle: 999, dash: 'dashed', shadow: true },
    { id: 'f00004', type: 'shape', shape: 'balloon', fill2: 'azul', dash: 'tracejado', shadow: 'sim' },
    { id: 'f00005', type: 'shape', shape: 'cubo' },
  ] }).story
  assert.deepEqual(r.slice(0, 2).map((l) => l.font), ['bebas', 'text'])
  assert.deepEqual([r[2].shape, r[2].fill2, r[2].gradAngle, r[2].dash, r[2].shadow], ['star', '#0000ff', 360, 'dashed', true])
  assert.deepEqual([r[3].shape, r[3].fill2, r[3].dash, r[3].shadow], ['balloon', undefined, undefined, undefined])
  assert.equal(r[4].shape, 'rect')
})

test('imagem na moldura: inteira, preenchendo, com zoom e foco; reposicionar não sai da moldura', () => {
  const quadro = { w: 400, h: 400 }
  assert.deepEqual(imagePlacement({ ...quadro }, 800, 400), { dx: 0, dy: 100, dw: 400, dh: 200 }) // inteira: centralizada
  const cover = imagePlacement({ ...quadro, fit: 'cover' }, 800, 400) // preenche: altura 400, largura 800, centro
  assert.deepEqual(cover, { dx: -200, dy: 0, dw: 800, dh: 400 })
  assert.deepEqual(imagePlacement({ ...quadro, fit: 'cover', px: 0 }, 800, 400), { dx: 0, dy: 0, dw: 800, dh: 400 }) // foco na esquerda
  assert.deepEqual(imagePlacement({ ...quadro, fit: 'cover', px: 1 }, 800, 400), { dx: -400, dy: 0, dw: 800, dh: 400 }) // foco na direita
  assert.equal(imagePlacement({ ...quadro, fit: 'cover', zoom: 2 }, 800, 400).dw, 1600)
  assert.equal(imagePlacement({ ...quadro, zoom: 3 }, 800, 400).dw, 400) // zoom só vale preenchendo
  assert.deepEqual(imagePlacement({ ...quadro }, 0, 0), { dx: 0, dy: 0, dw: 400, dh: 400 }) // sem tamanho conhecido: ocupa a moldura
  // arrastar a foto 100 px para a direita leva o foco para a esquerda; passou do limite, trava em 0 ou 1
  const p = panImage({ ...quadro, fit: 'cover' }, 800, 400, 100, 0)
  assert.ok(Math.abs(p.px - 0.25) < 1e-9 && p.py === 0.5)
  assert.equal(panImage({ ...quadro, fit: 'cover' }, 800, 400, 5000, 0).px, 0)
  assert.equal(panImage({ ...quadro, fit: 'cover' }, 800, 400, -5000, 0).px, 1)
  assert.equal(panImage({ ...quadro, fit: 'cover' }, 400, 400, 80, 80).px, 0.5) // foto do tamanho da moldura: nada a mover
})

test('imagem: moldura, ajustes e borda são validados; valores neutros não são guardados', () => {
  const U = '3f2b6c1e-8a4d-4c7e-9f10-2b5d6e7a8c90'
  const [a, b] = normalizeLayers({ story: [
    { id: 'im0001', type: 'image', asset: U, fit: 'cover', zoom: 9, px: 2, py: -1, mask: 'circle', flipX: true, bright: 500, contrast: -20, saturate: 0, blur: 99, gray: true, border: '#FF0000', borderW: 6, dash: 'dotted' },
    { id: 'im0002', type: 'image', asset: U, fit: 'esticar', zoom: 1, px: 0.5, mask: 'estrela', flipX: false, bright: 0 },
  ] }).story
  assert.deepEqual([a.fit, a.zoom, a.px, a.py, a.mask, a.flipX, a.bright, a.contrast, a.saturate, a.blur, a.gray, a.border, a.borderW, a.dash], ['cover', 4, 1, 0, 'circle', true, 100, -20, undefined, 30, true, '#ff0000', 6, 'dotted'])
  assert.deepEqual([b.fit, b.zoom, b.px, b.mask, b.flipX, b.bright], [undefined, undefined, undefined, undefined, undefined, undefined])
})
