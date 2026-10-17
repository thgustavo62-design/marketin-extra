import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_GUIDES, addGuide, guideRects, normalizeGuides } from '../src/lib/domain/promo-guides.ts'
import { snap } from '../src/lib/domain/promo-layers.ts'

test('guias: só dentro da peça, sem repetir, até 20 por formato', () => {
  const g = normalizeGuides({
    story: [{ axis: 'x', v: 540 }, { axis: 'x', v: 540.4 }, { axis: 'y', v: 5000 }, { axis: 'z', v: 1 }, { axis: 'y', v: -3 }, { axis: 'y', v: 100 }, 'lixo'],
    feed: Array.from({ length: 40 }, (_, i) => ({ axis: 'x', v: i * 10 })),
    a4: 7,
  })
  assert.deepEqual(g.story, [{ axis: 'x', v: 540 }, { axis: 'y', v: 100 }])
  assert.equal(g.feed.length, MAX_GUIDES)
  assert.deepEqual(g.a4, [])
  assert.deepEqual(normalizeGuides(null), { story: [], feed: [], a4: [] })
})

test('guias: somar sem repetir e virar alvo do ímã', () => {
  let l = addGuide([], { axis: 'x', v: 100 })
  assert.equal(addGuide(l, { axis: 'x', v: 100 }), l)
  l = addGuide(l, { axis: 'y', v: 300 })
  assert.deepEqual(guideRects(l, 1080, 1920), [{ x: 100, y: 0, w: 0, h: 1920 }, { x: 0, y: 300, w: 1080, h: 0 }])
  const s = snap({ x: 95, y: 500, w: 200, h: 100 }, 1080, 1920, guideRects(l, 1080, 1920), 10)
  assert.equal(s.dx, 5); assert.deepEqual(s.guidesX, [100])
  assert.equal(s.dy, 0)
})
