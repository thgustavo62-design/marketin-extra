'use client'

// Visualizador de apresentações: remonta o arquivo no navegador e mostra slide a slide, em tela cheia se quiser.
// PDF: pdf.js (fiel ao original). PPTX: pptx-preview (renderiza no navegador; para fidelidade total, suba também o PDF exportado).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Play } from 'lucide-react'

type Props = { id: string; title: string; kind: 'pptx' | 'pdf'; chunks: number; fileName: string; autoStart: boolean }
type Engine = { count: number; show: (i: number, w: number, h: number) => Promise<void>; destroy: () => void }

async function fetchFile(id: string, chunks: number, onProgress: (p: number) => void): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  let total = 0
  for (let i = 0; i < chunks; i++) {
    const r = await fetch(`/api/apresentacoes/${id}/parte/${i}`)
    if (!r.ok) throw new Error(r.status === 404 ? 'Arquivo não encontrado.' : 'Não foi possível baixar a apresentação. Tente de novo.')
    const b = new Uint8Array(await r.arrayBuffer())
    parts.push(b); total += b.length
    onProgress((i + 1) / chunks)
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

async function pdfEngine(data: Uint8Array, host: HTMLElement): Promise<Engine> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: data.slice() }).promise
  let token = 0
  return {
    count: doc.numPages,
    async show(i, w, h) {
      const my = ++token
      const page = await doc.getPage(i + 1)
      const base = page.getViewport({ scale: 1 })
      const fit = Math.min(w / base.width, h / base.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: fit * dpr })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${Math.floor(base.width * fit)}px`; canvas.style.height = `${Math.floor(base.height * fit)}px`
      await page.render({ canvas, viewport }).promise
      if (my !== token) return // chegou outro pedido enquanto desenhava
      host.replaceChildren(canvas)
    },
    destroy() { token++; void doc.destroy() },
  }
}

async function pptxEngine(data: Uint8Array, host: HTMLElement): Promise<Engine> {
  const { init } = await import('pptx-preview')
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  // 1) descobre o tamanho real dos slides; 2) renderiza todos nesse tamanho, fora da tela
  const probeHost = document.createElement('div')
  const probe = init(probeHost, { width: 960, height: 540, mode: 'list' })
  await probe.load(buf)
  const W = probe.pptx.width || 960, H = probe.pptx.height || 540
  probe.destroy()
  const off = document.createElement('div')
  off.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(off)
  const pv = init(off, { width: W, height: H, mode: 'list' })
  await pv.preview(buf)
  const slides = [...off.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper')]
  return {
    count: slides.length,
    async show(i, w, h) {
      const s = slides[i]
      if (!s) return
      const k = Math.min(w / W, h / H)
      s.style.margin = '0'
      s.style.transformOrigin = 'top left'
      s.style.transform = `scale(${k})`
      const box = document.createElement('div')
      box.style.cssText = `width:${Math.floor(W * k)}px;height:${Math.floor(H * k)}px;overflow:hidden;position:relative`
      box.appendChild(s)
      host.replaceChildren(box)
    },
    destroy() { try { pv.destroy() } catch { /* já destruído */ } off.remove() },
  }
}

export function PresentationViewer({ id, title, kind, chunks, fileName, autoStart }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const engine = useRef<Engine | null>(null)
  const fileRef = useRef<Uint8Array | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)
  const [idx, setIdx] = useState(0)
  const [full, setFull] = useState(false)
  const [hud, setHud] = useState(true)
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const data = await fetchFile(id, chunks, setProgress)
        fileRef.current = data
        if (off || !hostRef.current) return
        const e = kind === 'pdf' ? await pdfEngine(data, hostRef.current) : await pptxEngine(data, hostRef.current)
        if (off) { e.destroy(); return }
        engine.current = e
        setCount(e.count); setStatus('ready')
      } catch (err) {
        if (!off) { setError(err instanceof Error ? err.message : 'Não foi possível abrir a apresentação.'); setStatus('error') }
      }
    })()
    return () => { off = true; engine.current?.destroy(); engine.current = null }
  }, [id, chunks, kind])

  const draw = useCallback(() => {
    const st = stageRef.current, e = engine.current
    if (!st || !e) return
    void e.show(idx, st.clientWidth, st.clientHeight)
  }, [idx])
  useEffect(() => { if (status === 'ready') draw() }, [status, draw, full])
  useEffect(() => {
    const st = stageRef.current
    if (!st || status !== 'ready') return
    let t: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 120) })
    ro.observe(st)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [status, draw])

  const go = useCallback((n: number) => setIdx((i) => Math.max(0, Math.min(count - 1, typeof n === 'number' ? n : i))), [count])
  const next = useCallback(() => setIdx((i) => Math.min(count - 1, i + 1)), [count])
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), [])

  const toggleFull = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await rootRef.current?.requestFullscreen()
    } catch { /* navegador sem tela cheia: segue em janela */ }
  }, [])
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // teclado: setas, espaço, PageUp/PageDown, Home/End, F
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next() }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev() }
      else if (e.key === 'Home') { e.preventDefault(); go(0) }
      else if (e.key === 'End') { e.preventDefault(); go(count - 1) }
      else if (e.key.toLowerCase() === 'f') { e.preventDefault(); void toggleFull() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [next, prev, go, count, toggleFull])

  // em tela cheia, os controles somem depois de 2,5 s sem mexer o mouse
  const wake = () => {
    setHud(true)
    if (hudTimer.current) clearTimeout(hudTimer.current)
    hudTimer.current = setTimeout(() => setHud(false), 2500)
  }
  useEffect(() => { if (full) wake(); else setHud(true) }, [full])

  const touch = useRef<number | null>(null)
  async function baixar() {
    const d = fileRef.current
    if (!d) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([d as BlobPart], { type: kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
    a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const hudOn = !full || hud
  return (
    <div ref={rootRef} className={`pres${full ? ' full' : ''}${hudOn ? '' : ' nohud'}`} onMouseMove={full ? wake : undefined} data-status={status} data-index={idx}>
      <div className="pres-bar">
        <strong className="pres-title" title={title}>{title}</strong>
        <span className="pres-count" aria-live="polite">{status === 'ready' ? `${idx + 1} / ${count}` : ''}</span>
        <span className="pres-actions">
          <button type="button" onClick={prev} disabled={status !== 'ready' || idx === 0} aria-label="Slide anterior"><ChevronLeft size={16} /></button>
          <button type="button" onClick={next} disabled={status !== 'ready' || idx >= count - 1} aria-label="Próximo slide"><ChevronRight size={16} /></button>
          <button type="button" onClick={baixar} disabled={status !== 'ready'} aria-label="Baixar o arquivo original" title="Baixar o arquivo original"><Download size={16} /></button>
          <button type="button" className="primary" onClick={() => void toggleFull()} disabled={status !== 'ready'}>{full ? <><Minimize2 size={14} /> Sair da tela cheia</> : <><Play size={14} /> Apresentar</>}</button>
        </span>
      </div>

      <div className="pres-stage-wrap">
        <div ref={stageRef} className="pres-stage"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX - r.left < r.width * 0.3) prev(); else next() }}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
          onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s === null) return; const d = e.changedTouches[0].clientX - s; if (Math.abs(d) > 40) { if (d < 0) next(); else prev() } }}>
          <div ref={hostRef} className="pres-host" />
        </div>
        {status === 'loading' && <div className="pres-msg" role="status">Carregando a apresentação… {Math.round(progress * 100)}%</div>}
        {status === 'error' && <div className="pres-msg form-error" role="alert">{error}</div>}
        {status === 'ready' && autoStart && !full && idx === 0 && (
          <button type="button" className="pres-start primary" onClick={() => void toggleFull()}><Play size={16} /> Iniciar apresentação em tela cheia</button>
        )}
        {status === 'ready' && <div className="pres-progress" aria-hidden="true"><i style={{ width: `${count > 1 ? (idx / (count - 1)) * 100 : 100}%` }} /></div>}
      </div>

      {status === 'ready' && !full && count > 1 && (
        <div className="pres-rail" role="tablist" aria-label="Slides">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === idx} className={i === idx ? 'on' : ''} onClick={() => go(i)} aria-label={`Ir para o slide ${i + 1}`}>{i + 1}</button>
          ))}
        </div>
      )}
      {!full && status === 'ready' && <p className="muted pres-help"><Maximize2 size={12} style={{ verticalAlign: -1 }} /> Atalhos: setas ou espaço passam os slides, F abre a tela cheia, Esc sai. Clique na lateral esquerda para voltar.</p>}
    </div>
  )
}
