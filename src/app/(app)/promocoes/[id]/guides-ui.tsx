'use client'

// Réguas e guias do editor: ficam só na tela (não saem na exportação) e são lembradas neste navegador, por promoção.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, type PromoFormat } from '@/lib/domain/promo'
import { MAX_GUIDES, addGuide, emptyGuides, normalizeGuides, type Guide, type Guides } from '@/lib/domain/promo-guides'

const RULER = 24 // espessura da régua em px de tela

export function useGuides(campaignId: string) {
  const key = `promo_guides_${campaignId}`
  const [guides, setGuides] = useState<Guides>(emptyGuides())
  const [shown, setShown] = useState(false)
  useEffect(() => {
    try { setGuides(normalizeGuides(JSON.parse(localStorage.getItem(key) ?? 'null'))); setShown(localStorage.getItem(`${key}_on`) === '1') } catch { /* sem storage: começa sem guias */ }
  }, [key])
  const save = useCallback((g: Guides) => { try { localStorage.setItem(key, JSON.stringify(g)) } catch { /* ignora */ } }, [key])
  return {
    guides, shown,
    toggle: () => setShown((s) => { try { localStorage.setItem(`${key}_on`, s ? '0' : '1') } catch { /* ignora */ } return !s }),
    set: (fmt: PromoFormat, list: Guide[]) => setGuides((g) => { const n = { ...g, [fmt]: list.slice(0, MAX_GUIDES) }; save(n); return n }),
    clear: (fmt: PromoFormat) => setGuides((g) => { const n = { ...g, [fmt]: [] }; save(n); return n }),
    count: PROMO_FORMAT_KEYS.reduce((n, f) => n + guides[f].length, 0),
  }
}
export type GuidesApi = ReturnType<typeof useGuides>

/** Passo "redondo" da régua (em px da peça) para que as marcas fiquem a pelo menos 50 px na tela. */
export function rulerStep(scale: number): number {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (s * scale >= 50) return s
  return 1000
}

function RulerCanvas({ axis, length, scale }: { axis: 'x' | 'y'; length: number; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = Math.max(1, Math.round(length * scale))
    c.width = (axis === 'x' ? px : RULER) * dpr; c.height = (axis === 'x' ? RULER : px) * dpr
    c.style.width = `${axis === 'x' ? px : RULER}px`; c.style.height = `${axis === 'x' ? RULER : px}px`
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#eef1f5'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#8a96a8'; ctx.fillStyle = '#5b6678'; ctx.font = '10px system-ui, sans-serif'; ctx.lineWidth = 1
    const step = rulerStep(scale), minor = step / 5
    for (let v = 0; v <= length; v += minor) {
      const p = Math.round(v * scale) + 0.5, major = Math.round(v / minor) % 5 === 0
      ctx.beginPath()
      if (axis === 'x') { ctx.moveTo(p, RULER); ctx.lineTo(p, major ? 8 : 16) } else { ctx.moveTo(RULER, p); ctx.lineTo(major ? 8 : 16, p) }
      ctx.stroke()
      if (major) { if (axis === 'x') ctx.fillText(String(Math.round(v)), p + 3, 10); else { ctx.save(); ctx.translate(10, p + 3); ctx.rotate(-Math.PI / 2); ctx.fillText(String(Math.round(v)), -22, 0); ctx.restore() } }
    }
  }, [axis, length, scale])
  return <canvas ref={ref} aria-hidden="true" />
}

/**
 * Réguas em volta da peça e guias arrastáveis. Arraste da régua de cima para criar uma guia horizontal e da régua da esquerda para criar uma vertical;
 * arraste a guia para mudar; solte-a sobre a régua (ou dê duplo clique) para apagar. Os elementos "grudam" nas guias.
 */
export function RulersAndGuides({ format, paperRef, api, canEdit }: { format: PromoFormat; paperRef: RefObject<HTMLDivElement | null>; api: GuidesApi; canEdit: boolean }) {
  const { w: W, h: H } = PROMO_FORMATS[format]
  const [scale, setScale] = useState(0.5)
  const [drag, setDrag] = useState<Guide | null>(null)
  const list = api.guides[format]
  const dragging = useRef<{ index: number | null; axis: 'x' | 'y' } | null>(null)
  const lastClick = useRef<{ index: number; t: number } | null>(null)

  useEffect(() => {
    const el = paperRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.getBoundingClientRect().width / W))
    ro.observe(el); setScale(el.getBoundingClientRect().width / W)
    return () => ro.disconnect()
  }, [paperRef, W])

  const valueAt = useCallback((axis: 'x' | 'y', e: { clientX: number; clientY: number }) => {
    const r = paperRef.current?.getBoundingClientRect()
    if (!r) return 0
    return axis === 'x' ? Math.round(((e.clientX - r.left) / r.width) * W) : Math.round(((e.clientY - r.top) / r.height) * H)
  }, [paperRef, W, H])

  const start = (e: ReactPointerEvent, axis: 'x' | 'y', index: number | null) => {
    if (!canEdit) return
    e.preventDefault(); e.stopPropagation()
    dragging.current = { index, axis }
    const v0 = valueAt(axis, e)
    setDrag({ axis, v: v0 })
    const move = (ev: PointerEvent) => setDrag({ axis, v: valueAt(axis, ev) })
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      const v = valueAt(axis, ev), max = axis === 'x' ? W : H
      const next = list.filter((_, i) => i !== index)
      if (index !== null && Math.abs(v - v0) <= 1) { // só um clique: não mexe na guia; dois cliques seguidos apagam
        dragging.current = null; setDrag(null)
        const now = Date.now()
        if (lastClick.current && lastClick.current.index === index && now - lastClick.current.t < 500) { lastClick.current = null; api.set(format, list.filter((_, k) => k !== index)) } else lastClick.current = { index, t: now }
        return
      }
      // solta fora da peça (por exemplo, de volta sobre a régua) = apaga
      api.set(format, v < 0 || v > max ? next : index === null ? addGuide(list, { axis, v }) : [...next, { axis, v }])
      dragging.current = null; setDrag(null)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const hidden = dragging.current?.index ?? null
  return (
    <>
      <div className="canva-ruler h" style={{ height: RULER, top: -RULER, cursor: canEdit ? 's-resize' : 'default' }} onPointerDown={(e) => start(e, 'y', null)} title="Arraste para baixo para criar uma guia horizontal"><RulerCanvas axis="x" length={W} scale={scale} /></div>
      <div className="canva-ruler v" style={{ width: RULER, left: -RULER, cursor: canEdit ? 'e-resize' : 'default' }} onPointerDown={(e) => start(e, 'x', null)} title="Arraste para a direita para criar uma guia vertical"><RulerCanvas axis="y" length={H} scale={scale} /></div>
      <div className="canva-guides" aria-hidden="true">
        {list.map((g, i) => (
          <i key={`${g.axis}${g.v}${i}`} className={`canva-gline ${g.axis}`} data-axis={g.axis} data-value={g.v} style={{ ...(g.axis === 'x' ? { left: `${(g.v / W) * 100}%` } : { top: `${(g.v / H) * 100}%` }), ...(i === hidden ? { visibility: 'hidden' as const } : {}) }}
            onPointerDown={(e) => start(e, g.axis, i)} title={`Guia em ${g.v} px: arraste para mover, duplo clique apaga`} />
        ))}
        {drag && <i className={`canva-gline ${drag.axis} live`} style={drag.axis === 'x' ? { left: `${(drag.v / W) * 100}%` } : { top: `${(drag.v / H) * 100}%` }}><b>{drag.v}</b></i>}
      </div>
    </>
  )
}
