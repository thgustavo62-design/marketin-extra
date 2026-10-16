import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignToPage, layersForPage, makeLayer, normalizeLayers, reorderLayer, snap, MAX_LAYERS, type Layer } from '../src/lib/domain/promo-layers.ts'

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
