'use client'

// Elementos livres sobre a peça (como no Canva): texto, imagem e formas que se arrastam, redimensionam, giram, ficam em camadas e podem ser desfeitos.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { AlignCenter, AlignHorizontalJustifyCenter, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, AlignVerticalJustifyCenter, ArrowDown, ArrowUp, Bold, ChevronsDown, ChevronsUp, Circle, Copy, Eye, EyeOff, Group, ImagePlus, Italic, Lock, Minus, Redo2, Square, SquareRoundCorner, Star, Trash2, Type, Undo2, Ungroup, Unlock, ZoomIn, ZoomOut } from 'lucide-react'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, type PromoFormat } from '@/lib/domain/promo'
import { MAX_LAYERS, alignSelection, alignToPage, boundsOf, distribute, duplicateLayers, expandSelection, groupLayers, makeLayer, moveSelection, newLayerId, reorderLayer, scaleSelection, snap, ungroupLayers, type Align, type Bounds, type Layer, type LayerFont, type LayerShape, type Layers } from '@/lib/domain/promo-layers'
import { drawLayers, loadPromoFonts, measureLayerHeight } from '@/lib/promo/render'
import { saveLayersAction } from '../actions'

// ---------- estado: histórico (desfazer/refazer) e salvamento automático ----------
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const FIT_KEYS: (keyof Layer)[] = ['text', 'size', 'font', 'bold', 'italic', 'w', 'bg']
/** Texto sempre com a caixa na altura certa para o que está escrito. */
export function fitLayer(l: Layer): Layer { return l.type === 'text' ? { ...l, h: measureLayerHeight(l) } : l }

export function useLayers(campaignId: string, initial: Layers, canEdit: boolean, onSaved: () => void) {
  const [layers, setLayers] = useState<Layers>(initial)
  const [committed, setCommitted] = useState<Layers>(initial)
  const [state, setState] = useState<SaveState>('saved')
  const [error, setError] = useState<string | null>(null)
  const [hist, setHist] = useState({ undo: 0, redo: 0 })
  const latest = useRef(initial)
  const past = useRef<Layers[]>([])
  const future = useRef<Layers[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const lastKey = useRef<{ key: string; at: number } | null>(null)
  const dirty = useRef(false)
  const savedCb = useRef(onSaved)
  savedCb.current = onSaved

  const sync = () => setHist({ undo: past.current.length, redo: future.current.length })

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!dirty.current) return
    dirty.current = false
    const snapshot = latest.current
    setCommitted(snapshot); setState('saving')
    chain.current = chain.current.then(async () => {
      const r = await saveLayersAction(campaignId, snapshot).catch(() => ({ ok: false, error: 'Sem conexão: não foi possível salvar os elementos.' }))
      if (!r.ok) { setError(r.error ?? 'Não foi possível salvar os elementos.'); setState('error') } else { setError(null); setState(dirty.current ? 'dirty' : 'saved'); savedCb.current() }
    })
  }, [campaignId])

  const schedule = useCallback(() => {
    dirty.current = true; setState('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 900)
  }, [flush])

  useEffect(() => () => { flush() }, [flush])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current || state === 'saving') e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [state])

  /** Troca o conjunto inteiro. `key` junta mudanças seguidas do mesmo campo (digitar, arrastar a cor) num passo só do "desfazer". */
  const apply = useCallback((next: Layers, o: { push?: boolean; key?: string; save?: boolean } = {}) => {
    if (!canEdit) return
    const { push = true, key, save = true } = o
    if (push) {
      const now = Date.now()
      const same = !!key && lastKey.current?.key === key && now - lastKey.current.at < 1000
      if (!same) { past.current.push(latest.current); if (past.current.length > 60) past.current.shift(); future.current = [] }
      lastKey.current = key ? { key, at: now } : null
    }
    latest.current = next; setLayers(next); sync()
    if (save) schedule()
  }, [canEdit, schedule])

  const mapOne = (fmt: PromoFormat, id: string, fn: (l: Layer) => Layer): Layers => ({ ...latest.current, [fmt]: latest.current[fmt].map((l) => (l.id === id ? fn(l) : l)) })

  return {
    layers, committed, latest, state, error, canUndo: hist.undo > 0, canRedo: hist.redo > 0, flush,
    /** muda campos de um elemento (texto ajusta a altura sozinho) */
    patch: (fmt: PromoFormat, id: string, p: Partial<Layer>, key?: string) =>
      apply(mapOne(fmt, id, (l) => { const m = { ...l, ...p }; return m.type === 'text' && !('h' in p) && FIT_KEYS.some((k) => k in p) ? fitLayer(m) : m }), { key }),
    /** aplica uma mudança na lista inteira do formato (várias de uma vez: agrupar, alinhar, excluir…) */
    mutate: (fmt: PromoFormat, fn: (list: Layer[]) => Layer[], key?: string) => apply({ ...latest.current, [fmt]: fn(latest.current[fmt]) }, { key }),
    /** durante o arrasto de vários: troca a lista sem registrar no histórico nem salvar */
    liveList: (fmt: PromoFormat, list: Layer[]) => apply({ ...latest.current, [fmt]: list }, { push: false, save: false }),
    /** durante o arrasto: muda sem registrar no histórico nem salvar */
    live: (fmt: PromoFormat, id: string, p: Partial<Layer>) => apply(mapOne(fmt, id, (l) => ({ ...l, ...p })), { push: false, save: false }),
    begin: () => { if (!canEdit) return; past.current.push(latest.current); if (past.current.length > 60) past.current.shift(); future.current = []; lastKey.current = null; sync() },
    end: () => { if (canEdit) schedule() },
    add: (fmt: PromoFormat, ...ls: Layer[]): boolean => {
      if (latest.current[fmt].length + ls.length > MAX_LAYERS) return false
      apply({ ...latest.current, [fmt]: [...latest.current[fmt], ...ls] }); return true
    },
    remove: (fmt: PromoFormat, id: string) => apply({ ...latest.current, [fmt]: latest.current[fmt].filter((l) => l.id !== id) }),
    reorder: (fmt: PromoFormat, id: string, dir: 'front' | 'back' | 'up' | 'down') => apply({ ...latest.current, [fmt]: reorderLayer(latest.current[fmt], id, dir) }),
    /** copia o elemento para os outros formatos, na mesma proporção */
    copyToOthers: (from: PromoFormat, l: Layer): boolean => {
      const A = PROMO_FORMATS[from]
      const next = { ...latest.current }
      for (const f of PROMO_FORMAT_KEYS) {
        if (f === from) continue
        if (next[f].length >= MAX_LAYERS) return false
        const B = PROMO_FORMATS[f], k = B.w / A.w
        const c: Layer = { ...l, id: newLayerId(), x: Math.round(l.x * k), y: Math.round(l.y * (B.h / A.h)), w: Math.round(l.w * k), h: Math.round(l.h * k), page: l.page }
        if (c.type === 'text') c.size = Math.round((l.size ?? 64) * k)
        next[f] = [...next[f], c.type === 'text' ? fitLayer(c) : c]
      }
      apply(next); return true
    },
    undo: () => { const p = past.current.pop(); if (!p) return; future.current.push(latest.current); latest.current = p; lastKey.current = null; setLayers(p); sync(); schedule() },
    redo: () => { const n = future.current.pop(); if (!n) return; past.current.push(latest.current); latest.current = n; lastKey.current = null; setLayers(n); sync(); schedule() },
  }
}
export type LayersApi = ReturnType<typeof useLayers>

/** Copia a seleção (deslocada) e devolve os ids das cópias; vazio se passar do limite de elementos. */
export function duplicateSelection(api: LayersApi, fmt: PromoFormat, ids: string[]): string[] {
  const r = duplicateLayers(api.latest.current[fmt], ids)
  return r.ids.length && api.add(fmt, ...r.added) ? r.ids : []
}

/** Coloca uma imagem já guardada na promoção como elemento no meio da peça (até 40% da largura, na proporção original). Devolve o id ou null se passou do limite. */
export function addImageLayer(api: LayersApi, fmt: PromoFormat, page: number, img: { asset: string; width: number; height: number }): string | null {
  const { w: W, h: H } = PROMO_FORMATS[fmt]
  const k = (W * 0.4) / Math.max(img.width, img.height)
  const w = Math.round(img.width * k), h = Math.round(img.height * k)
  const l = makeLayer('image', fmt, { page, asset: img.asset, w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) })
  return api.add(fmt, l) ? l.id : null
}

/** Atalhos como no Canva: Delete, setas (Shift = 10 px), Ctrl+A (tudo da peça), Ctrl+D (duplicar), Ctrl+G (agrupar) e Ctrl+Shift+G (desagrupar), Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Esc. Não atrapalha quem está digitando. */
export function useLayerKeys(o: { api: LayersApi; format: PromoFormat; selIds: string[]; select: (ids: string[]) => void; canEdit: boolean; pageIds: () => string[] }) {
  const ref = useRef(o)
  ref.current = o
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      const { api, format, selIds, select, canEdit, pageIds } = ref.current
      if (!canEdit) return
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) api.redo(); else api.undo(); return }
      if (mod && k === 'y') { e.preventDefault(); api.redo(); return }
      if (mod && k === 'a') { const ids = pageIds(); if (ids.length) { e.preventDefault(); select(ids) } return }
      const ids = selIds.filter((id) => api.latest.current[format].some((l) => l.id === id))
      if (!ids.length) return
      if (e.key === 'Escape') { select([]); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); api.mutate(format, (l) => l.filter((x) => !ids.includes(x.id))); select([]); return }
      if (mod && k === 'd') { e.preventDefault(); const c = duplicateSelection(api, format, ids); if (c.length) select(c); return }
      if (mod && k === 'g') { e.preventDefault(); api.mutate(format, (l) => (e.shiftKey ? ungroupLayers(l, ids) : groupLayers(l, ids))); return }
      const step = e.shiftKey ? 10 : 1
      const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null
      if (d) { e.preventDefault(); api.mutate(format, (l) => moveSelection(l, ids, d[0], d[1]), 'nudge') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}

// ---------- desenho ao vivo e caixas de seleção sobre a peça ----------
/** Segunda tela sobre a peça: os elementos são redesenhados aqui enquanto se arrasta, sem refazer a peça inteira. */
export function LayersCanvas({ format, list: all, hideId, getImg }: { format: PromoFormat; list: Layer[]; hideId?: string | null; getImg: (url: string) => Promise<HTMLImageElement | null> }) {
  const list = hideId ? all.filter((l) => l.id !== hideId) : all
  const ref = useRef<HTMLCanvasElement>(null)
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement | null>>({})
  const { w: W, h: H } = PROMO_FORMATS[format]
  const assetKey = [...new Set(list.map((l) => l.asset).filter(Boolean))].join(',')
  useEffect(() => {
    let off = false
    ;(async () => {
      const next: Record<string, HTMLImageElement | null> = {}
      for (const id of assetKey.split(',').filter(Boolean)) next[id] = await getImg(`/api/promocoes/asset/${id}`)
      if (!off) setImgs(next)
    })()
    return () => { off = true }
  }, [assetKey, getImg])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    let off = false
    void loadPromoFonts().then(() => {
      if (off) return
      c.width = W; c.height = H
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      drawLayers(ctx, list, imgs)
    })
    return () => { off = true }
  }, [list, imgs, W, H])
  return <canvas ref={ref} className="canva-layers" aria-hidden="true" data-count={list.length} />
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w' | 'n' | 's'
const SIGNS: Record<Handle, [number, number]> = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1], e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] }
const handlesFor = (l: Layer): Handle[] => (l.type === 'image' ? ['nw', 'ne', 'sw', 'se'] : l.type === 'text' ? ['nw', 'ne', 'sw', 'se', 'e', 'w'] : l.shape === 'line' ? ['e', 'w'] : ['nw', 'ne', 'sw', 'se', 'e', 'w', 'n', 's'])
type Gesture = {
  kind: 'move' | 'resize' | 'rotate' | 'scale'; id: string; ids: string[]; handle?: Handle; start: Layer; base: Layer[]; bounds: Bounds | null
  px: number; py: number; sx: number; sy: number; left: number; top: number
}
const FONT_CSS: Record<LayerFont, string> = { display: '"PromoDisplay", "Baloo 2", system-ui, sans-serif', text: '"PromoText", Montserrat, system-ui, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: '"Courier New", ui-monospace, monospace' }

/**
 * Caixas clicáveis dos elementos. Um clique seleciona (Shift/Ctrl soma; um membro de grupo seleciona o grupo todo), arrastar move a seleção,
 * as alças redimensionam (uma seleção de vários escala como bloco), a bolinha de cima gira. Segurando Shift e arrastando no vazio, desenha-se um retângulo de seleção.
 * Duplo clique em um texto edita direto na peça. Ímã nas bordas e no centro (Alt desliga).
 */
export function LayerBoxes({ format, list, selectedIds, onSelect, editingId, setEditingId, api, paperRef, canEdit }: {
  format: PromoFormat; list: Layer[]; selectedIds: string[]; onSelect: (ids: string[]) => void; editingId: string | null; setEditingId: (id: string | null) => void
  api: LayersApi; paperRef: RefObject<HTMLDivElement | null>; canEdit: boolean
}) {
  const { w: W, h: H } = PROMO_FORMATS[format]
  const g = useRef<Gesture | null>(null)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const [shiftHeld, setShiftHeld] = useState(false)
  const [marquee, setMarquee] = useState<Bounds | null>(null)
  const mq = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const on = (e: KeyboardEvent) => setShiftHeld(e.shiftKey)
    const off = () => setShiftHeld(false)
    window.addEventListener('keydown', on); window.addEventListener('keyup', on); window.addEventListener('blur', off)
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off) }
  }, [])

  const rectOf = () => paperRef.current?.getBoundingClientRect() ?? null
  const multi = selectedIds.length > 1
  const selBounds = multi ? boundsOf(list, selectedIds) : null

  const down = (e: ReactPointerEvent<HTMLDivElement>, l: Layer) => {
    e.stopPropagation()
    const all = api.latest.current[format]
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    let ids: string[]
    if (additive) {
      const grp = expandSelection(all, [l.id])
      ids = grp.every((x) => selectedIds.includes(x)) ? selectedIds.filter((x) => !grp.includes(x)) : [...new Set([...selectedIds, ...grp])]
    } else ids = selectedIds.includes(l.id) ? selectedIds : expandSelection(all, [l.id])
    onSelect(ids)
    if (!canEdit || e.button !== 0 || additive || !ids.includes(l.id)) return
    const r = rectOf()
    if (!r || ids.every((id) => all.find((x) => x.id === id)?.locked)) return
    const h = (e.target as HTMLElement).dataset.handle as Handle | 'rot' | undefined
    g.current = {
      id: l.id, ids, kind: h === 'rot' ? 'rotate' : h ? 'resize' : 'move', handle: h && h !== 'rot' ? h : undefined, start: l, base: all, bounds: boundsOf(all, ids),
      px: e.clientX, py: e.clientY, sx: r.width / W, sy: r.height / H, left: r.left, top: r.top,
    }
    api.begin()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const k = g.current
    if (!k || k.kind === 'scale') return
    const s = k.start
    const dx = (e.clientX - k.px) / k.sx, dy = (e.clientY - k.py) / k.sy
    if (k.kind === 'move') {
      let mx = dx, my = dy
      if (e.altKey || !k.bounds) setGuides({ x: [], y: [] })
      else {
        const m = snap({ x: k.bounds.x + dx, y: k.bounds.y + dy, w: k.bounds.w, h: k.bounds.h }, W, H, k.base.filter((o) => !k.ids.includes(o.id) && !o.hidden), 10)
        mx += m.dx; my += m.dy
        setGuides({ x: m.guidesX, y: m.guidesY })
      }
      api.liveList(format, moveSelection(k.base, k.ids, mx, my))
    } else if (k.kind === 'rotate') {
      const cx = k.left + (s.x + s.w / 2) * k.sx, cy = k.top + (s.y + s.h / 2) * k.sy
      let a = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90
      if (a > 180) a -= 360
      const near = Math.round(a / 45) * 45
      if (e.shiftKey) a = Math.round(a / 15) * 15
      else if (Math.abs(a - near) < 3) a = near
      api.live(format, s.id, { rot: Math.round(a) })
    } else if (k.handle) {
      const [sgx, sgy] = SIGNS[k.handle]
      const rad = (s.rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad)
      const dxL = dx * cos + dy * sin, dyL = -dx * sin + dy * cos
      let nw = s.w + sgx * dxL, nh = s.h + sgy * dyL
      const uniform = s.type !== 'shape' && sgx !== 0 && sgy !== 0
      if (uniform) { const f = Math.max(nw / s.w, nh / s.h); nw = s.w * f; nh = s.h * f }
      nw = Math.max(16, nw); nh = Math.max(s.type === 'shape' && s.shape === 'line' ? 4 : 16, nh)
      if (sgx === 0) nw = s.w
      if (sgy === 0) nh = s.h
      const lx = (sgx * (nw - s.w)) / 2, ly = (sgy * (nh - s.h)) / 2
      const cx = s.x + s.w / 2 + (lx * cos - ly * sin), cy = s.y + s.h / 2 + (lx * sin + ly * cos)
      let p: Partial<Layer> = { x: Math.round(cx - nw / 2), y: Math.round(cy - nh / 2), w: Math.round(nw), h: Math.round(nh) }
      if (s.type === 'text') {
        if (uniform) p.size = Math.max(8, Math.min(600, Math.round((s.size ?? 64) * (nw / s.w))))
        p = { ...p, h: measureLayerHeight({ ...s, ...p }) }
      }
      api.live(format, s.id, p)
    }
  }

  const up = () => {
    if (!g.current) return
    g.current = null
    setGuides({ x: [], y: [] })
    api.end()
  }

  // alças do bloco (seleção de vários): escala tudo na mesma proporção, ancorado no canto oposto
  const downScale = (e: ReactPointerEvent<HTMLDivElement>) => {
    const h = (e.target as HTMLElement).dataset.handle as Handle | undefined
    const r = rectOf()
    if (!h || !r || !canEdit || !selBounds) return
    e.stopPropagation()
    g.current = { id: '', ids: selectedIds, kind: 'scale', handle: h, start: list[0], base: api.latest.current[format], bounds: selBounds, px: e.clientX, py: e.clientY, sx: r.width / W, sy: r.height / H, left: r.left, top: r.top }
    api.begin()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId) // a alça captura; o bloco em si não recebe ponteiro
  }
  const moveScale = (e: ReactPointerEvent<HTMLDivElement>) => {
    const k = g.current
    if (!k || k.kind !== 'scale' || !k.bounds || !k.handle) return
    const B = k.bounds, [sgx, sgy] = SIGNS[k.handle]
    const dx = (e.clientX - k.px) / k.sx, dy = (e.clientY - k.py) / k.sy
    const f = Math.max(0.1, Math.max((B.w + sgx * dx) / B.w, (B.h + sgy * dy) / B.h))
    const nw = B.w * f, nh = B.h * f
    api.liveList(format, scaleSelection(k.base, k.ids, B, { x: sgx > 0 ? B.x : B.x + B.w - nw, y: sgy > 0 ? B.y : B.y + B.h - nh, w: nw, h: nh }))
  }

  // retângulo de seleção (Shift + arrastar no vazio)
  const toDesign = (e: { clientX: number; clientY: number }) => { const r = rectOf(); return r ? { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H } : { x: 0, y: 0 } }
  const mqDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    mq.current = toDesign(e)
    setMarquee({ ...mq.current, w: 0, h: 0 })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const mqMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = mq.current
    if (!a) return
    const b = toDesign(e)
    setMarquee({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })
  }
  const mqUp = () => {
    const m = marquee
    mq.current = null; setMarquee(null)
    if (!m || (m.w < 6 && m.h < 6)) return
    const hit = list.filter((l) => { if (l.locked || l.hidden) return false; const b = boundsOf([l], [l.id])!; return b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y }).map((l) => l.id)
    if (hit.length) onSelect(expandSelection(api.latest.current[format], [...new Set([...selectedIds, ...hit])]))
  }

  const k = (rectOf()?.width ?? W) / W // pixels da tela por pixel da peça (para o editor de texto no lugar)
  return (
    <div className="canva-lboxes">
      {canEdit && <div className={`canva-marquee-surface${shiftHeld ? ' on' : ''}`} onPointerDown={mqDown} onPointerMove={mqMove} onPointerUp={mqUp} onPointerCancel={mqUp} />}
      {list.map((l) => {
        const sel = selectedIds.includes(l.id)
        const editable = sel && canEdit && !l.locked && !multi
        const editing = editingId === l.id && l.type === 'text'
        return (
          <div key={l.id} className={`canva-lbox${sel ? ' sel' : ''}${multi && sel ? ' multi' : ''}${l.locked ? ' locked' : ''}${l.group ? ' grouped' : ''}`} data-layer={l.id} data-type={l.type} title={l.locked ? 'Bloqueado' : 'Arraste para mover; Shift soma à seleção'}
            style={{ left: `${(l.x / W) * 100}%`, top: `${(l.y / H) * 100}%`, width: `${(l.w / W) * 100}%`, height: `${(l.h / H) * 100}%`, transform: l.rot ? `rotate(${l.rot}deg)` : undefined }}
            onPointerDown={(e) => { if (!editing) down(e, l) }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onDoubleClick={() => { if (l.type === 'text' && canEdit && !l.locked) { onSelect([l.id]); setEditingId(l.id) } }}>
            {editing && (
              <textarea className="canva-inline" aria-label="Editar o texto na peça" value={l.text ?? ''} maxLength={300} autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => api.patch(format, l.id, { text: e.target.value }, 'text')}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); setEditingId(null) } e.stopPropagation() }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  fontFamily: FONT_CSS[l.font ?? 'text'], fontSize: (l.size ?? 64) * k, color: l.color ?? '#111', textAlign: l.align ?? 'center', fontWeight: l.bold === false ? 500 : 800, fontStyle: l.italic ? 'italic' : 'normal',
                  lineHeight: 1.15, background: l.bg ?? 'transparent', padding: l.bg ? (l.size ?? 64) * 0.3 * k : 0,
                  ...(l.stroke && l.strokeW ? { WebkitTextStroke: `${Math.max(1, l.strokeW * k * 0.5)}px ${l.stroke}`, paintOrder: 'stroke fill' } : {}),
                }} />
            )}
            {editable && !editing && handlesFor(l).map((h) => <span key={h} className={`canva-handle h-${h}`} data-handle={h} aria-hidden="true" />)}
            {editable && !editing && <span className="canva-handle h-rot" data-handle="rot" aria-hidden="true" />}
          </div>
        )
      })}
      {selBounds && canEdit && (
        <div className="canva-selbox" data-count={selectedIds.length} style={{ left: `${(selBounds.x / W) * 100}%`, top: `${(selBounds.y / H) * 100}%`, width: `${(selBounds.w / W) * 100}%`, height: `${(selBounds.h / H) * 100}%` }}
          onPointerDown={downScale} onPointerMove={moveScale} onPointerUp={up} onPointerCancel={up}>
          {(['nw', 'ne', 'sw', 'se'] as const).map((h) => <span key={h} className={`canva-handle h-${h}`} data-handle={h} aria-hidden="true" />)}
        </div>
      )}
      {marquee && <div className="canva-marquee" style={{ left: `${(marquee.x / W) * 100}%`, top: `${(marquee.y / H) * 100}%`, width: `${(marquee.w / W) * 100}%`, height: `${(marquee.h / H) * 100}%` }} />}
      {guides.x.map((x) => <i key={`x${x}`} className="canva-guide v" style={{ left: `${(x / W) * 100}%` }} />)}
      {guides.y.map((y) => <i key={`y${y}`} className="canva-guide h" style={{ top: `${(y / H) * 100}%` }} />)}
    </div>
  )
}

// ---------- barra de adicionar ----------
type Msg = { kind: 'ok' | 'error'; text: string }
export function AddBar({ api, campaignId, format, page, canEdit, onAdded, onMsg, zoom, setZoom }: {
  api: LayersApi; campaignId: string; format: PromoFormat; page: number; canEdit: boolean; onAdded: (id: string) => void; onMsg: (m: Msg | null) => void; zoom: number; setZoom: (z: number) => void
}) {
  const { w: W, h: H } = PROMO_FORMATS[format]
  const fileRef = useRef<HTMLInputElement>(null)
  const [up, setUp] = useState(false)
  const full = api.layers[format].length >= MAX_LAYERS

  const put = (...ls: Layer[]) => {
    if (!api.add(format, ...ls)) { onMsg({ kind: 'error', text: `Cada formato aceita até ${MAX_LAYERS} elementos livres.` }); return }
    onMsg(null); onAdded(ls[ls.length - 1].id)
  }
  const text = (kind: 'titulo' | 'subtitulo' | 'texto') => {
    const extra: Partial<Layer> = kind === 'titulo' ? {} : kind === 'subtitulo' ? { font: 'text', size: 48, color: '#0b1f5c', stroke: null, strokeW: 0, text: 'Seu subtítulo' } : { font: 'text', size: 36, color: '#111111', stroke: null, strokeW: 0, bold: false, text: 'Seu texto' }
    put(fitLayer(makeLayer('text', format, { page, ...extra })))
  }
  const shape = (shape: LayerShape) => {
    const w = shape === 'line' ? Math.round(W * 0.4) : Math.round(W * 0.3), h = shape === 'line' ? 12 : shape === 'circle' || shape === 'burst' ? w : Math.round(W * 0.2)
    put(makeLayer('shape', format, { page, shape, w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), fill: shape === 'burst' ? '#e3171d' : '#ffd21f' }))
  }
  const selo = () => {
    const s = Math.round(W * 0.34), x = Math.round((W - s) / 2), y = Math.round((H - s) / 2)
    const burst = makeLayer('shape', format, { page, shape: 'burst', w: s, h: s, x, y, fill: '#e3171d', border: '#ffffff', borderW: 8 })
    const t = fitLayer(makeLayer('text', format, { page, text: 'OFERTA', size: Math.round(s * 0.2), w: Math.round(s * 0.8), x: x + Math.round(s * 0.1), y, color: '#ffffff', stroke: '#7a0a10', strokeW: 6 }))
    put(burst, { ...t, y: y + Math.round((s - t.h) / 2) })
  }
  async function upload(file: File | undefined) {
    if (!file) return
    setUp(true); onMsg(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/promocoes/camada-imagem/${campaignId}`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { onMsg({ kind: 'error', text: j.error ?? 'Não foi possível enviar a imagem.' }); return }
      const k = (W * 0.4) / Math.max(j.width, j.height)
      const w = Math.round(j.width * k), h = Math.round(j.height * k)
      put(makeLayer('image', format, { page, asset: j.id, w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) }))
    } finally { setUp(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const stateText = api.state === 'saving' ? 'Salvando…' : api.state === 'dirty' ? 'Alterações pendentes…' : api.state === 'error' ? 'Erro ao salvar' : 'Salvo'
  return (
    <div className="canva-addbar" role="toolbar" aria-label="Adicionar elementos">
      {canEdit && (
        <>
          <button type="button" disabled={full} onClick={() => text('titulo')} title="Adicionar título"><Type size={14} /> Título</button>
          <button type="button" disabled={full} onClick={() => text('texto')} title="Adicionar texto">Texto</button>
          <button type="button" disabled={full || up} onClick={() => fileRef.current?.click()} title="Enviar uma imagem (logo, selo, adesivo)"><ImagePlus size={14} /> {up ? 'Enviando…' : 'Imagem'}</button>
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Enviar imagem para a peça" onChange={(e) => void upload(e.target.files?.[0])} />
          <span className="sep" />
          <button type="button" disabled={full} onClick={() => shape('rect')} aria-label="Inserir retângulo" title="Retângulo"><Square size={14} /></button>
          <button type="button" disabled={full} onClick={() => shape('round')} aria-label="Inserir retângulo arredondado" title="Arredondado"><SquareRoundCorner size={14} /></button>
          <button type="button" disabled={full} onClick={() => shape('circle')} aria-label="Inserir círculo" title="Círculo"><Circle size={14} /></button>
          <button type="button" disabled={full} onClick={() => shape('burst')} aria-label="Inserir explosão" title="Explosão"><Star size={14} /></button>
          <button type="button" disabled={full} onClick={() => shape('line')} aria-label="Inserir linha" title="Linha"><Minus size={14} /></button>
          <button type="button" disabled={full} onClick={selo} title="Selo pronto (explosão com texto)">Selo OFERTA</button>
          <span className="sep" />
          <button type="button" disabled={!api.canUndo} onClick={api.undo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)"><Undo2 size={14} /></button>
          <button type="button" disabled={!api.canRedo} onClick={api.redo} aria-label="Refazer" title="Refazer (Ctrl+Y)"><Redo2 size={14} /></button>
          <span className="sep" />
        </>
      )}
      <button type="button" onClick={() => setZoom(Math.max(0.5, +(zoom - 0.25).toFixed(2)))} aria-label="Diminuir zoom" title="Diminuir zoom"><ZoomOut size={14} /></button>
      <button type="button" className="zoom" onClick={() => setZoom(1)} title="Ajustar à tela" aria-label="Zoom">{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={() => setZoom(Math.min(2.5, +(zoom + 0.25).toFixed(2)))} aria-label="Aumentar zoom" title="Aumentar zoom"><ZoomIn size={14} /></button>
      {canEdit && <span className={`savestate ${api.state}`} role="status" title={api.error ?? undefined}>{stateText}</span>}
    </div>
  )
}

// ---------- lista de camadas ----------
export const layerLabel = (l: Layer): string => (l.type === 'text' ? (l.text ?? '').split('\n')[0].slice(0, 28) || 'Texto' : l.type === 'image' ? 'Imagem' : ({ rect: 'Retângulo', round: 'Arredondado', circle: 'Círculo', burst: 'Explosão', line: 'Linha' } as const)[l.shape ?? 'rect'])
const layerIcon = (l: Layer) => (l.type === 'text' ? <Type size={13} /> : l.type === 'image' ? <ImagePlus size={13} /> : l.shape === 'circle' ? <Circle size={13} /> : l.shape === 'burst' ? <Star size={13} /> : l.shape === 'line' ? <Minus size={13} /> : <Square size={13} />)

export function LayersPanel({ api, format, page, selectedIds, onSelect, canEdit }: { api: LayersApi; format: PromoFormat; page: number; selectedIds: string[]; onSelect: (ids: string[]) => void; canEdit: boolean }) {
  const list = api.layers[format]
  const click = (e: React.MouseEvent, l: Layer) => {
    const grp = expandSelection(list, [l.id])
    if (e.shiftKey || e.ctrlKey || e.metaKey) onSelect(grp.every((x) => selectedIds.includes(x)) ? selectedIds.filter((x) => !grp.includes(x)) : [...new Set([...selectedIds, ...grp])])
    else onSelect(grp)
  }
  return (
    <section aria-label="Camadas">
      <p className="muted">Elementos livres sobre a peça ({PROMO_FORMATS[format].label}): o de cima da lista fica na frente. Clique com Shift ou Ctrl para escolher vários; na peça, Shift e arraste no vazio para desenhar a seleção. Ctrl+G agrupa.</p>
      {list.length === 0 ? <p className="empty">Nenhum elemento ainda.</p> : (
        <ul className="canva-layer-list">
          {[...list].reverse().map((l) => (
            <li key={l.id} data-layer={l.id} className={`${selectedIds.includes(l.id) ? 'sel' : ''}${l.hidden ? ' off' : ''}`} onClick={(e) => click(e, l)}>
              {layerIcon(l)}
              <span className="canva-name">{layerLabel(l)}{l.group ? <em className="canva-group">grupo</em> : null}<small>{l.page === null ? ' · todas as peças' : ` · peça ${l.page + 1}`}{l.page !== null && l.page !== page ? ' (outra)' : ''}</small></span>
              {canEdit && (
                <span className="canva-layer-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" aria-label={l.hidden ? 'Mostrar' : 'Ocultar'} title={l.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => api.patch(format, l.id, { hidden: !l.hidden })}>{l.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                  <button type="button" aria-label={l.locked ? 'Desbloquear' : 'Bloquear'} title={l.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => api.patch(format, l.id, { locked: !l.locked })}>{l.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                  <button type="button" aria-label="Subir camada" onClick={() => api.reorder(format, l.id, 'up')}><ArrowUp size={13} /></button>
                  <button type="button" aria-label="Descer camada" onClick={() => api.reorder(format, l.id, 'down')}><ArrowDown size={13} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Inspetor de vários elementos: agrupar, alinhar entre si, distribuir, duplicar, bloquear, ocultar e excluir. */
export function MultiInspector({ api, format, ids, canEdit, onSelect, onClose }: { api: LayersApi; format: PromoFormat; ids: string[]; canEdit: boolean; onSelect: (ids: string[]) => void; onClose: () => void }) {
  const { w: W, h: H } = PROMO_FORMATS[format]
  const list = api.layers[format]
  const sel = list.filter((l) => ids.includes(l.id))
  const oneGroup = sel.length > 1 && !!sel[0].group && sel.every((l) => l.group === sel[0].group)
  const anyGroup = sel.some((l) => l.group)
  const dis = !canEdit
  const op = Math.round((sel.reduce((n, l) => n + l.opacity, 0) / Math.max(1, sel.length)) * 100)
  return (
    <section aria-label="Editar vários elementos">
      <h3>{sel.length} elementos selecionados</h3>
      <p className="muted">{oneGroup ? 'Estão agrupados: movem e redimensionam juntos.' : 'Arraste para mover todos; as alças do bloco redimensionam na mesma proporção.'}</p>
      {canEdit && (
        <div className="canva-toolrow" role="group" aria-label="Ações da seleção">
          {oneGroup
            ? <button type="button" onClick={() => api.mutate(format, (l) => ungroupLayers(l, ids))} aria-label="Desagrupar" title="Desagrupar (Ctrl+Shift+G)"><Ungroup size={14} /></button>
            : <button type="button" onClick={() => api.mutate(format, (l) => groupLayers(l, ids))} aria-label="Agrupar" title="Agrupar (Ctrl+G)"><Group size={14} /></button>}
          {anyGroup && !oneGroup && <button type="button" onClick={() => api.mutate(format, (l) => ungroupLayers(l, ids))} aria-label="Desagrupar" title="Desagrupar"><Ungroup size={14} /></button>}
          <button type="button" onClick={() => { const c = duplicateSelection(api, format, ids); if (c.length) onSelect(c) }} aria-label="Duplicar seleção" title="Duplicar (Ctrl+D)"><Copy size={14} /></button>
          <button type="button" onClick={() => api.mutate(format, (l) => l.map((x) => (ids.includes(x.id) ? { ...x, locked: !sel.every((s) => s.locked) } : x)))} aria-label="Bloquear seleção" title="Bloquear/desbloquear"><Lock size={14} /></button>
          <button type="button" onClick={() => api.mutate(format, (l) => l.map((x) => (ids.includes(x.id) ? { ...x, hidden: true } : x)))} aria-label="Ocultar seleção" title="Ocultar"><EyeOff size={14} /></button>
          <button type="button" onClick={() => { api.mutate(format, (l) => l.filter((x) => !ids.includes(x.id))); onSelect([]) }} aria-label="Excluir seleção" title="Excluir (Delete)"><Trash2 size={14} /></button>
        </div>
      )}
      <details open>
        <summary>Alinhar entre si</summary>
        <div className="canva-chips" role="group" aria-label="Alinhar seleção">
          {([['left', AlignStartHorizontal, 'Alinhar à esquerda'], ['hcenter', AlignHorizontalJustifyCenter, 'Centralizar na horizontal'], ['right', AlignEndHorizontal, 'Alinhar à direita'], ['top', AlignStartVertical, 'Alinhar ao topo'], ['vcenter', AlignVerticalJustifyCenter, 'Centralizar na vertical'], ['bottom', AlignEndVertical, 'Alinhar à base']] as const).map(([a, Icon, t]) => (
            <button key={a} type="button" disabled={dis} aria-label={`Seleção: ${t}`} title={t} onClick={() => api.mutate(format, (l) => alignSelection(l, ids, a, W, H))}><Icon size={14} /></button>
          ))}
          <button type="button" disabled={dis || sel.length < 3} aria-label="Distribuir na horizontal" title="Distribuir na horizontal (3 ou mais)" onClick={() => api.mutate(format, (l) => distribute(l, ids, 'h'))}><AlignHorizontalDistributeCenter size={14} /></button>
          <button type="button" disabled={dis || sel.length < 3} aria-label="Distribuir na vertical" title="Distribuir na vertical (3 ou mais)" onClick={() => api.mutate(format, (l) => distribute(l, ids, 'v'))}><AlignVerticalDistributeCenter size={14} /></button>
        </div>
      </details>
      <details open>
        <summary>Aparência</summary>
        <label htmlFor="ly-multi-op">Opacidade: {op}%</label>
        <input id="ly-multi-op" type="range" min={0} max={100} value={op} disabled={dis} onChange={(e) => api.mutate(format, (l) => l.map((x) => (ids.includes(x.id) ? { ...x, opacity: Number(e.target.value) / 100 } : x)), 'multi-op')} />
      </details>
      <button type="button" className="link" onClick={onClose}>Fechar</button>
    </section>
  )
}

// ---------- inspetor do elemento ----------
const FONTS: [LayerFont, string][] = [['display', 'Baloo (títulos)'], ['text', 'Montserrat'], ['serif', 'Serifada'], ['mono', 'Máquina de escrever']]
const SHAPES: [LayerShape, string][] = [['rect', 'Retângulo'], ['round', 'Arredondado'], ['circle', 'Círculo'], ['burst', 'Explosão'], ['line', 'Linha']]

function Num({ id, label, value, min, max, onChange, disabled }: { id: string; label: string; value: number; min?: number; max?: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" value={Math.round(value)} min={min} max={max} disabled={disabled} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && e.target.value !== '') onChange(n) }} />
    </div>
  )
}

export function LayerInspector({ api, format, layer: l, page, pageCount, canEdit, onClose, onDuplicate, onDelete, onMsg }: {
  api: LayersApi; format: PromoFormat; layer: Layer; page: number; pageCount: number; canEdit: boolean; onClose: () => void; onDuplicate: () => void; onDelete: () => void; onMsg: (m: Msg | null) => void
}) {
  const { w: W, h: H } = PROMO_FORMATS[format]
  const dis = !canEdit
  const p = (patch: Partial<Layer>, key?: string) => api.patch(format, l.id, patch, key)
  const align = (a: Align) => { const n = alignToPage(l, a, W, H); p({ x: n.x, y: n.y }) }
  const toggleColor = (field: 'stroke' | 'bg' | 'border', on: boolean, def: string) => p({ [field]: on ? def : null } as Partial<Layer>)
  return (
    <section aria-label="Editar elemento">
      <h3>{l.type === 'text' ? 'Texto' : l.type === 'image' ? 'Imagem' : 'Forma'}</h3>
      {canEdit && (
        <div className="canva-toolrow" role="group" aria-label="Ações do elemento">
          <button type="button" onClick={onDuplicate} title="Duplicar (Ctrl+D)" aria-label="Duplicar"><Copy size={14} /></button>
          <button type="button" onClick={() => p({ locked: !l.locked })} aria-label={l.locked ? 'Desbloquear' : 'Bloquear'} title={l.locked ? 'Desbloquear' : 'Bloquear'}>{l.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
          <button type="button" onClick={() => p({ hidden: !l.hidden })} aria-label={l.hidden ? 'Mostrar' : 'Ocultar'} title="Ocultar/mostrar">{l.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          <button type="button" onClick={onDelete} aria-label="Excluir elemento" title="Excluir (Delete)"><Trash2 size={14} /></button>
        </div>
      )}

      {l.type === 'text' && (
        <details open>
          <summary>Texto</summary>
          <textarea id="ly-text" rows={3} value={l.text ?? ''} maxLength={300} disabled={dis} onChange={(e) => p({ text: e.target.value }, 'text')} />
          <label htmlFor="ly-font">Fonte</label>
          <select id="ly-font" value={l.font ?? 'text'} disabled={dis} onChange={(e) => p({ font: e.target.value as LayerFont })}>{FONTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
          <div className="grid-2">
            <Num id="ly-size" label="Tamanho" value={l.size ?? 64} min={8} max={600} disabled={dis} onChange={(n) => p({ size: n }, 'size')} />
            <div className="canva-chips" role="group" aria-label="Estilo do texto" style={{ alignSelf: 'end' }}>
              <button type="button" className={l.bold !== false ? 'on' : ''} disabled={dis} aria-label="Negrito" onClick={() => p({ bold: l.bold === false })}><Bold size={14} /></button>
              <button type="button" className={l.italic ? 'on' : ''} disabled={dis} aria-label="Itálico" onClick={() => p({ italic: !l.italic })}><Italic size={14} /></button>
            </div>
          </div>
          <div className="canva-chips" role="group" aria-label="Alinhamento do texto">
            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => <button key={a} type="button" className={(l.align ?? 'center') === a ? 'on' : ''} disabled={dis} aria-label={`Texto ${a}`} onClick={() => p({ align: a })}><Icon size={14} /></button>)}
          </div>
          <div className="color-grid">
            <label className="color-item"><input type="color" aria-label="Cor do texto" value={l.color ?? '#111111'} disabled={dis} onChange={(e) => p({ color: e.target.value }, 'color')} /> Cor</label>
            <label className="color-item"><input type="checkbox" aria-label="Contorno" checked={!!l.stroke} disabled={dis} onChange={(e) => toggleColor('stroke', e.target.checked, '#0b1f5c')} /> Contorno
              {l.stroke && <input type="color" aria-label="Cor do contorno" value={l.stroke} disabled={dis} onChange={(e) => p({ stroke: e.target.value }, 'stroke')} />}</label>
            <label className="color-item"><input type="checkbox" aria-label="Fundo do texto" checked={!!l.bg} disabled={dis} onChange={(e) => toggleColor('bg', e.target.checked, '#e3171d')} /> Fundo
              {l.bg && <input type="color" aria-label="Cor do fundo do texto" value={l.bg} disabled={dis} onChange={(e) => p({ bg: e.target.value }, 'bg')} />}</label>
          </div>
          {!!l.stroke && <><label htmlFor="ly-strokew">Espessura do contorno: {l.strokeW ?? 0}</label><input id="ly-strokew" type="range" min={0} max={30} value={l.strokeW ?? 0} disabled={dis} onChange={(e) => p({ strokeW: Number(e.target.value) }, 'strokew')} /></>}
        </details>
      )}

      {l.type === 'shape' && (
        <details open>
          <summary>Forma</summary>
          <label htmlFor="ly-shape">Tipo</label>
          <select id="ly-shape" value={l.shape ?? 'rect'} disabled={dis} onChange={(e) => p({ shape: e.target.value as LayerShape })}>{SHAPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
          <div className="color-grid">
            <label className="color-item"><input type="color" aria-label="Cor da forma" value={l.fill ?? '#ffd21f'} disabled={dis} onChange={(e) => p({ fill: e.target.value }, 'fill')} /> Cor</label>
            {l.shape !== 'line' && (
              <label className="color-item"><input type="checkbox" aria-label="Borda" checked={!!l.border} disabled={dis} onChange={(e) => p({ border: e.target.checked ? '#ffffff' : null, borderW: e.target.checked ? l.borderW || 8 : 0 })} /> Borda
                {l.border && <input type="color" aria-label="Cor da borda" value={l.border} disabled={dis} onChange={(e) => p({ border: e.target.value }, 'border')} />}</label>
            )}
          </div>
          {!!l.border && <><label htmlFor="ly-borderw">Espessura da borda: {l.borderW ?? 0}</label><input id="ly-borderw" type="range" min={1} max={40} value={l.borderW ?? 0} disabled={dis} onChange={(e) => p({ borderW: Number(e.target.value) }, 'borderw')} /></>}
          {l.shape === 'round' && <><label htmlFor="ly-radius">Cantos: {l.radius ?? 24}</label><input id="ly-radius" type="range" min={0} max={200} value={l.radius ?? 24} disabled={dis} onChange={(e) => p({ radius: Number(e.target.value) }, 'radius')} /></>}
        </details>
      )}

      <details open>
        <summary>Posição e tamanho</summary>
        <div className="grid-2">
          <Num id="ly-x" label="X" value={l.x} disabled={dis} onChange={(n) => p({ x: n }, 'x')} />
          <Num id="ly-y" label="Y" value={l.y} disabled={dis} onChange={(n) => p({ y: n }, 'y')} />
          <Num id="ly-w" label="Largura" value={l.w} min={8} disabled={dis} onChange={(n) => p({ w: n }, 'w')} />
          <Num id="ly-h" label="Altura" value={l.h} min={4} disabled={dis || l.type === 'text'} onChange={(n) => p({ h: n }, 'h')} />
          <Num id="ly-rot" label="Giro (°)" value={l.rot} min={-360} max={360} disabled={dis} onChange={(n) => p({ rot: n }, 'rot')} />
        </div>
        <div className="canva-chips" role="group" aria-label="Alinhar à peça">
          {([['left', AlignStartHorizontal, 'Alinhar à esquerda'], ['hcenter', AlignHorizontalJustifyCenter, 'Centralizar na horizontal'], ['right', AlignEndHorizontal, 'Alinhar à direita'], ['top', AlignStartVertical, 'Alinhar ao topo'], ['vcenter', AlignVerticalJustifyCenter, 'Centralizar na vertical'], ['bottom', AlignEndVertical, 'Alinhar à base']] as const).map(([a, Icon, t]) => (
            <button key={a} type="button" disabled={dis} aria-label={t} title={t} onClick={() => align(a)}><Icon size={14} /></button>
          ))}
        </div>
      </details>

      <details open>
        <summary>Aparência e ordem</summary>
        <label htmlFor="ly-op">Opacidade: {Math.round(l.opacity * 100)}%</label>
        <input id="ly-op" type="range" min={0} max={100} value={Math.round(l.opacity * 100)} disabled={dis} onChange={(e) => p({ opacity: Number(e.target.value) / 100 }, 'opacity')} />
        <label htmlFor="ly-page">Aparece em</label>
        <select id="ly-page" value={l.page === null ? 'all' : 'this'} disabled={dis} onChange={(e) => p({ page: e.target.value === 'all' ? null : Math.min(page, Math.max(0, pageCount - 1)) })}>
          <option value="this">Só em uma peça{l.page !== null ? ` (peça ${l.page + 1})` : ''}</option>
          <option value="all">Todas as peças deste formato</option>
        </select>
        {canEdit && (
          <>
            <div className="canva-chips" role="group" aria-label="Ordem das camadas">
              <button type="button" onClick={() => api.reorder(format, l.id, 'front')}><ChevronsUp size={14} /> Frente</button>
              <button type="button" onClick={() => api.reorder(format, l.id, 'up')}><ArrowUp size={14} /> Subir</button>
              <button type="button" onClick={() => api.reorder(format, l.id, 'down')}><ArrowDown size={14} /> Descer</button>
              <button type="button" onClick={() => api.reorder(format, l.id, 'back')}><ChevronsDown size={14} /> Fundo</button>
            </div>
            <button type="button" className="mini-btn" onClick={() => onMsg(api.copyToOthers(format, l) ? { kind: 'ok', text: 'Elemento copiado para os outros formatos (ajustado à proporção).' } : { kind: 'error', text: `Cada formato aceita até ${MAX_LAYERS} elementos livres.` })}>Copiar para os outros formatos</button>
          </>
        )}
      </details>
      <button type="button" className="link" onClick={onClose}>Fechar</button>
    </section>
  )
}
