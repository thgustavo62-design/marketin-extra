'use client'

// Artes fixas do tema: fundos, bonecos, logos e selos que aparecem num lugar definido de TODA promoção que usa este tema.
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Upload } from 'lucide-react'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, type PromoFormat } from '@/lib/domain/promo'
import { ART_KINDS, MAX_FIXED_PER_FORMAT, SHOW_LABEL, artKindLabel, type ArtKind } from '@/lib/domain/promo-fixed'
import { layersForPage, newLayerId, placeArt, type Anchor, type Layer, type Layers, type Place } from '@/lib/domain/promo-layers'
import { drawPage, loadImage, loadPromoFonts, type RenderItem } from '@/lib/promo/render'
import type { Theme, ThemeArt } from '@/lib/promo/store'
import { deleteThemeArtAction, saveThemeFixedAction } from '../../actions'

const ANCHOR_LABEL: Record<Anchor, string> = { tl: 'Canto de cima à esquerda', tc: 'Centro de cima', tr: 'Canto de cima à direita', ml: 'Meio à esquerda', c: 'Centro', mr: 'Meio à direita', bl: 'Canto de baixo à esquerda', bc: 'Centro de baixo', br: 'Canto de baixo à direita', fill: 'Peça inteira' }
const GRID: Anchor[] = ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']
const SAMPLE = ['PRODUTO EXEMPLO 800G', 'LEITE INTEGRAL 1L', 'SABONETE 85G', 'SHAMPOO 350ML', 'FRALDA HIPER G', 'CREME DENTAL 90G']

/** Posição inicial sugerida por tipo de arte. */
function defaultPlace(kind: ArtKind): { place: Place; under: boolean; show?: Layer['show'] } {
  if (kind === 'fundo') return { place: { anchor: 'fill', size: 100, margin: 0, dx: 0, dy: 0 }, under: true }
  if (kind === 'boneco') return { place: { anchor: 'br', size: 34, margin: 1, dx: 0, dy: 0 }, under: false }
  if (kind === 'logo') return { place: { anchor: 'tc', size: 38, margin: 3, dx: 0, dy: 0 }, under: false }
  if (kind === 'selo') return { place: { anchor: 'tr', size: 20, margin: 3, dx: 0, dy: 0 }, under: false }
  return { place: { anchor: 'c', size: 30, margin: 3, dx: 0, dy: 0 }, under: false }
}

export function FixedArts({ theme, canEdit }: { theme: Theme; canEdit: boolean }) {
  const router = useRouter()
  const [fixed, setFixed] = useState<Layers>(theme.fixed)
  useEffect(() => setFixed(theme.fixed), [theme.fixed])
  const [fmt, setFmt] = useState<PromoFormat>('story')
  const [sim, setSim] = useState<0 | 1 | 2>(0)
  const [kind, setKind] = useState<ArtKind>('boneco')
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const art = (id: string | undefined): ThemeArt | undefined => theme.arts.find((a) => a.id === id)
  const list = fixed[fmt]

  const preview = useCallback(async () => {
    const c = canvasRef.current
    if (!c) return
    await loadPromoFonts()
    const role = async (r: string) => { const a = theme.assets.find((x) => x.role === r && x.format === fmt); return a ? loadImage(`/api/promocoes/tema/${theme.id}/${r}/${fmt}?v=${a.width}x${a.height}`) : null }
    const shared = async (r: string) => { const a = theme.assets.find((x) => x.role === r); return a ? loadImage(`/api/promocoes/tema/${theme.id}/${r}/${a.format}?v=${a.width}x${a.height}`) : null }
    const g = theme.config.grid[fmt]
    const items: RenderItem[] = Array.from({ length: g.cols * g.rows }, (_, i) => ({ name: SAMPLE[i % SAMPLE.length], price: 9.9 + i * 7, img: null }))
    const ls = layersForPage(list, sim, 3) // simula uma promoção de 3 peças: primeira, do meio ou última
    const images: Record<string, HTMLImageElement | null> = {}
    for (const l of ls) if (l.asset && !(l.asset in images)) images[l.asset] = await loadImage(`/api/promocoes/tema-arte/${l.asset}`)
    drawPage(c, { format: fmt, theme: theme.config, title: null, validity: null, assets: { background: await role('background'), header: await role('header'), footer: await role('footer'), badge: await shared('badge'), tag: await shared('tag') }, items, fixed: { under: ls.filter((l) => l.under), over: ls.filter((l) => !l.under), images } })
  }, [theme, fmt, list, sim])
  useEffect(() => { void preview() }, [preview])

  const touch = (next: Layers) => { setFixed(next); setDirty(true) }
  const setList = (fn: (l: Layer[]) => Layer[]) => touch({ ...fixed, [fmt]: fn(list) })
  const geom = (a: ThemeArt, p: Place) => placeArt(p, PROMO_FORMATS[fmt].w, PROMO_FORMATS[fmt].h, a.width, a.height)

  function put(a: ThemeArt) {
    if (list.length >= MAX_FIXED_PER_FORMAT) { setMsg({ ok: false, text: `Cada formato aceita até ${MAX_FIXED_PER_FORMAT} artes fixas.` }); return }
    const d = defaultPlace(a.kind)
    const g = geom(a, d.place)
    setList((l) => [...l, { id: newLayerId(), type: 'image', asset: a.id, ...g, rot: 0, opacity: 1, hidden: false, locked: false, page: null, place: d.place, under: d.under || undefined, ...(d.place.anchor === 'fill' ? { fit: 'cover' as const } : {}) }])
  }
  const patch = (id: string, p: Partial<Layer>) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const repos = (l: Layer, place: Place) => { const a = art(l.asset); if (!a) return; patch(l.id, { ...geom(a, place), place, fit: place.anchor === 'fill' ? 'cover' : undefined }) }

  async function upload(files: File[]) {
    setUploading(true); setMsg(null)
    let ok = 0; const erros: string[] = []
    for (const f of files) {
      const fd = new FormData(); fd.append('file', f); fd.append('kind', kind)
      const r = await fetch(`/api/promocoes/tema/${theme.id}/artes`, { method: 'POST', body: fd }).catch(() => null)
      if (r?.ok) ok++; else erros.push(`${f.name}: ${(await r?.json().catch(() => ({})))?.error ?? 'falhou'}`)
    }
    setUploading(false); if (fileRef.current) fileRef.current.value = ''
    setMsg({ ok: erros.length === 0, text: `${ok} arte(s) enviada(s)${erros.length ? ` · ${erros.join('; ')}` : ''}.` })
    router.refresh()
  }
  const save = () => start(async () => {
    const r = await saveThemeFixedAction(theme.id, fixed)
    setMsg(r.ok ? { ok: true, text: 'Posições salvas: todas as promoções com este tema já usam.' } : { ok: false, text: r.error ?? 'Não foi possível salvar.' })
    if (r.ok) { setDirty(false); router.refresh() }
  })

  return (
    <section className="card fixed-arts" style={{ marginTop: 14 }} aria-label="Artes fixas do tema">
      <h3>Artes fixas do tema (bonecos, logos e fundos)</h3>
      <p className="muted">Guarde aqui as artes e escolha o lugar de cada uma na peça. Elas entram sozinhas em <strong>toda promoção criada com este tema</strong> (também nas já existentes), sem precisar colocar uma a uma. Cada promoção pode desligar as que não quiser, na aba &quot;Artes do tema&quot; do editor.</p>
      {msg && <p className={msg.ok ? 'form-ok' : 'form-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

      <div className="fixed-grid">
        <div>
          <h4>Artes do tema ({theme.arts.length})</h4>
          {canEdit && (
            <div className="fixed-upload">
              <label htmlFor="fa-kind">Tipo das artes que vai enviar</label>
              <select id="fa-kind" value={kind} disabled={uploading} onChange={(e) => setKind(e.target.value as ArtKind)}>{ART_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
              <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" aria-label="Enviar artes do tema" onChange={(e) => void upload([...(e.target.files ?? [])])} />
              <button type="button" className="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}><Upload size={14} /> {uploading ? 'Enviando…' : 'Enviar artes'}</button>
              <small className="muted">PNG com fundo transparente fica melhor para bonecos e logos.</small>
            </div>
          )}
          {theme.arts.length === 0 ? <p className="muted">Nenhuma arte ainda.</p> : (
            <div className="fixed-arts-list">
              {theme.arts.map((a) => (
                <div key={a.id} className="fixed-art" data-art={a.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/promocoes/tema-arte/${a.id}?mini=1`} alt={a.name} />
                  <strong title={a.name}>{a.name}</strong>
                  <small className="muted">{artKindLabel(a.kind)}</small>
                  {canEdit && (
                    <span className="lib-actions">
                      <button type="button" className="mini-btn primary" onClick={() => put(a)} aria-label={`Colocar ${a.name} na peça`}>Colocar</button>
                      <button type="button" className="mini-btn danger" aria-label={`Excluir a arte ${a.name}`} disabled={busy} onClick={() => { if (confirm(`Excluir "${a.name}" do tema? Ela sai das promoções que a usam.`)) start(async () => { const r = await deleteThemeArtAction(theme.id, a.id); if (!r.ok) setMsg({ ok: false, text: r.error ?? 'Não foi possível excluir.' }); router.refresh() }) }}><Trash2 size={12} /></button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="tabs" style={{ marginBottom: 8 }}>
            {PROMO_FORMAT_KEYS.map((f) => <button key={f} type="button" className={`tab${fmt === f ? ' active' : ''}`} onClick={() => setFmt(f)}>{PROMO_FORMATS[f].label.split(' ')[0]} ({fixed[f].length})</button>)}
          </div>
          <div className="canva-chips" role="group" aria-label="Simular a peça">
            <span className="muted">Ver como na peça:</span>
            {([[0, 'Primeira'], [1, 'Do meio'], [2, 'Última']] as const).map(([n, t]) => <button key={n} type="button" className={sim === n ? 'on' : ''} onClick={() => setSim(n)}>{t}</button>)}
          </div>
          <div className="studio-canvas"><canvas ref={canvasRef} aria-label={`Prévia com as artes fixas (${PROMO_FORMATS[fmt].label})`} /></div>
        </div>
      </div>

      <h4 style={{ marginTop: 14 }}>Onde cada arte fica ({PROMO_FORMATS[fmt].label.split(' ')[0]})</h4>
      {list.length === 0 ? <p className="muted">Nenhuma arte colocada neste formato. Use &quot;Colocar&quot; em uma das artes acima.</p> : (
        <ul className="placements">
          {list.map((l, i) => {
            const a = art(l.asset)
            const p: Place = l.place ?? { anchor: 'c', size: 30, margin: 3, dx: 0, dy: 0 }
            if (!a) return null
            return (
              <li key={l.id} className="placement" data-placement={l.id}>
                <div className="placement-head">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/promocoes/tema-arte/${a.id}?mini=1`} alt="" />
                  <strong>{a.name}</strong><small className="muted">{artKindLabel(a.kind)}</small>
                  {canEdit && <button type="button" className="mini-btn danger" aria-label={`Tirar ${a.name} deste formato`} onClick={() => setList((x) => x.filter((y) => y.id !== l.id))}><Trash2 size={12} /></button>}
                </div>
                <div className="placement-body">
                  <div className="anchor-grid" role="group" aria-label={`Lugar de ${a.name}`}>
                    {GRID.map((an) => <button key={an} type="button" className={p.anchor === an ? 'on' : ''} disabled={!canEdit} title={ANCHOR_LABEL[an]} aria-label={`${a.name}: ${ANCHOR_LABEL[an]}`} aria-pressed={p.anchor === an} onClick={() => repos(l, { ...p, anchor: an })} />)}
                    <button type="button" className={`anchor-fill${p.anchor === 'fill' ? ' on' : ''}`} disabled={!canEdit} aria-label={`${a.name}: ${ANCHOR_LABEL.fill}`} aria-pressed={p.anchor === 'fill'} onClick={() => repos(l, { ...p, anchor: 'fill' })}>Peça inteira</button>
                  </div>
                  <div className="placement-fields">
                    {p.anchor !== 'fill' && <>
                      <label>Tamanho: {Math.round(p.size)}% da largura<input type="range" min={5} max={100} value={p.size} disabled={!canEdit} aria-label={`Tamanho de ${a.name}`} onChange={(e) => repos(l, { ...p, size: Number(e.target.value) })} /></label>
                      <label>Afastamento da borda: {p.margin.toFixed(1)}%<input type="range" min={0} max={15} step={0.5} value={p.margin} disabled={!canEdit} aria-label={`Margem de ${a.name}`} onChange={(e) => repos(l, { ...p, margin: Number(e.target.value) })} /></label>
                    </>}
                    <div className="grid-2">
                      <label>Ajuste X (px)<input type="number" value={p.dx} disabled={!canEdit} aria-label={`Ajuste X de ${a.name}`} onChange={(e) => repos(l, { ...p, dx: Number(e.target.value) || 0 })} /></label>
                      <label>Ajuste Y (px)<input type="number" value={p.dy} disabled={!canEdit} aria-label={`Ajuste Y de ${a.name}`} onChange={(e) => repos(l, { ...p, dy: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <label>Aparece<select value={l.show ?? 'all'} disabled={!canEdit} aria-label={`Em quais peças ${a.name} aparece`} onChange={(e) => patch(l.id, { show: e.target.value === 'all' ? undefined : (e.target.value as Layer['show']) })}>{(Object.keys(SHOW_LABEL) as (keyof typeof SHOW_LABEL)[]).map((k) => <option key={k} value={k}>{SHOW_LABEL[k]}</option>)}</select></label>
                    <label>Camada<select value={l.under ? 'under' : 'over'} disabled={!canEdit} aria-label={`Camada de ${a.name}`} onChange={(e) => patch(l.id, { under: e.target.value === 'under' ? true : undefined })}><option value="over">Por cima de tudo</option><option value="under">Por baixo dos produtos</option></select></label>
                    <label>Opacidade: {Math.round(l.opacity * 100)}%<input type="range" min={10} max={100} value={Math.round(l.opacity * 100)} disabled={!canEdit} aria-label={`Opacidade de ${a.name}`} onChange={(e) => patch(l.id, { opacity: Number(e.target.value) / 100 })} /></label>
                    <label className="color-item"><input type="checkbox" checked={!!l.shadow} disabled={!canEdit} aria-label={`Sombra em ${a.name}`} onChange={(e) => patch(l.id, { shadow: e.target.checked ? true : undefined })} /> Sombra suave</label>
                    {canEdit && i > 0 && <button type="button" className="mini-btn" onClick={() => setList((x) => { const y = [...x]; [y[i - 1], y[i]] = [y[i], y[i - 1]]; return y })}>Subir na ordem</button>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && <div className="form-actions"><button type="button" className="primary" style={{ width: 'auto' }} disabled={busy || !dirty} onClick={save}>{busy ? 'Salvando…' : dirty ? 'Salvar posições' : 'Posições salvas'}</button></div>}
    </section>
  )
}
