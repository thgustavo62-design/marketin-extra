'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, type PromoFormat, type ThemeConfig } from '@/lib/domain/promo'
import type { Theme } from '@/lib/promo/store'
import { drawPage, loadImage, loadPromoFonts } from '@/lib/promo/render'
import { deleteArtAction, deleteThemeAction, saveThemeAction } from '../../actions'

const COLOR_LABELS: Record<keyof ThemeConfig['colors'], string> = {
  skyTop: 'Fundo (topo)', skyBottom: 'Fundo (base)', panel: 'Painel dos produtos', badge: 'Selo de preço', badgeEdge: 'Borda/sombra do selo', badgeText: 'Texto do preço',
  name: 'Nome do produto', tag: 'Etiqueta (cor)', tagText: 'Etiqueta (texto)', title: 'Título', footer: 'Rodapé (cor)', footerText: 'Rodapé (texto)',
}
const ART_LABELS = { header: 'Cabeçalho (título, mascote, logo)', footer: 'Rodapé (delivery, contato)', background: 'Fundo' } as const

export function ThemeEditor({ theme, canEdit }: { theme: Theme; canEdit: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(theme.name)
  const [cfg, setCfg] = useState<ThemeConfig>(theme.config)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, start] = useTransition()
  const [pf, setPf] = useState<PromoFormat>('story')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [split, setSplit] = useState<Record<string, { header: string; footer: string }>>({})
  const has = (role: string, f: PromoFormat) => theme.assets.find((a) => a.role === role && a.format === f)

  const preview = useCallback(async () => {
    const c = canvasRef.current
    if (!c) return
    await loadPromoFonts()
    const art = async (role: string) => { const a = has(role, pf); return a ? loadImage(`/api/promocoes/tema/${theme.id}/${role}/${pf}?v=${a.width}x${a.height}`) : null }
    const shared = async (role: string) => { const a = theme.assets.find((x) => x.role === role); return a ? loadImage(`/api/promocoes/tema/${theme.id}/${role}/${a.format}?v=${a.width}x${a.height}`) : null }
    const g = cfg.grid[pf]
    const sample = Array.from({ length: g.cols * g.rows }, (_, i) => ({ name: ['PRODUTO EXEMPLO 800G', 'LEITE INTEGRAL 1L', 'SABONETE 85G', 'SHAMPOO 350ML', 'FRALDA HIPER G'][i % 5], price: [59.99, 18.99, 7.5, 15.99, 79.9][i % 5], img: null }))
    drawPage(c, { format: pf, theme: cfg, title: null, validity: null, assets: { background: await art('background'), header: await art('header'), footer: await art('footer'), badge: await shared('badge'), tag: await shared('tag') }, items: sample })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, pf, theme])
  useEffect(() => { void preview() }, [preview])

  const setColor = (k: keyof ThemeConfig['colors'], v: string) => setCfg({ ...cfg, colors: { ...cfg.colors, [k]: v } })
  const setGrid = (f: PromoFormat, k: 'cols' | 'rows', v: number) => setCfg({ ...cfg, grid: { ...cfg.grid, [f]: { ...cfg.grid[f], [k]: Math.max(1, Math.min(k === 'cols' ? 6 : 8, v || 1)) } } })

  async function upload(role: string, f: PromoFormat, file: File | undefined) {
    if (!file) return
    setMsg(null)
    const fd = new FormData(); fd.append('role', role); fd.append('format', f); fd.append('file', file)
    const res = await fetch(`/api/promocoes/tema/${theme.id}/arte`, { method: 'POST', body: fd })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível enviar.' }); return }
    setMsg({ kind: 'ok', text: 'Arte enviada.' })
    router.refresh()
  }

  async function dividir(f: PromoFormat, file: File | undefined) {
    if (!file) return
    const v = split[f] ?? { header: '', footer: '' }
    setMsg(null)
    const fd = new FormData(); fd.append('format', f); fd.append('file', file); fd.append('header_px', v.header || '0'); fd.append('footer_px', v.footer || '0')
    const res = await fetch(`/api/promocoes/tema/${theme.id}/dividir`, { method: 'POST', body: fd })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível dividir a arte.' }); return }
    setMsg({ kind: 'ok', text: 'Arte dividida: cabeçalho, rodapé e fundo atualizados.' })
    router.refresh()
  }

  return (
    <>
      {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="studio-grid">
        <section className="card" aria-label="Prévia do tema">
          <div className="tabs" style={{ marginBottom: 10 }}>
            {PROMO_FORMAT_KEYS.map((f) => <button key={f} type="button" className={`tab${pf === f ? ' active' : ''}`} onClick={() => setPf(f)}>{PROMO_FORMATS[f].label}</button>)}
          </div>
          <div className="studio-canvas"><canvas ref={canvasRef} aria-label="Prévia do tema" /></div>
          <p className="muted">Prévia com produtos de exemplo (sem foto). As artes que você enviar aparecem aqui na hora.</p>
        </section>

        <section className="card" aria-label="Artes">
          <h3>Artes do tema</h3>
          <p className="muted">Envie a arte pronta (PNG/JPG/WEBP até 4 MB; PNG com fundo transparente é mantido). O cabeçalho e o rodapé ocupam a largura toda; o painel com os produtos fica entre eles.</p>
          {PROMO_FORMAT_KEYS.map((f) => (
            <div key={f} style={{ marginBottom: 12 }}>
              <strong>{PROMO_FORMATS[f].label}</strong> <span className="muted">({PROMO_FORMATS[f].hint})</span>
              <ul className="files">
                {(['header', 'footer', 'background'] as const).map((role) => {
                  const a = has(role, f)
                  return (
                    <li key={role}>
                      <span style={{ minWidth: 220 }}>{ART_LABELS[role]}</span>
                      {a
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`/api/promocoes/tema/${theme.id}/${role}/${f}?v=${a.width}x${a.height}`} alt="" height={34} style={{ maxWidth: 140, objectFit: 'contain', background: '#cfe', borderRadius: 4 }} />
                        : <span className="muted">padrão</span>}
                      {canEdit && (
                        <>
                          <button type="button" className="mini-btn" onClick={() => fileRefs.current[`${role}-${f}`]?.click()}><Upload size={12} /> {a ? 'Trocar' : 'Enviar'}</button>
                          <input ref={(el) => { fileRefs.current[`${role}-${f}`] = el }} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { void upload(role, f, e.target.files?.[0]); e.target.value = '' }} aria-label={`${ART_LABELS[role]} — ${PROMO_FORMATS[f].label}`} />
                          {a && <button type="button" className="mini-btn" disabled={busy} onClick={() => start(async () => { await deleteArtAction(theme.id, role, f); router.refresh() })}><Trash2 size={12} /></button>}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <div style={{ marginBottom: 12 }}>
            <strong>Selo de preço e etiqueta</strong> <span className="muted">(iguais nos 3 formatos; PNG com fundo transparente)</span>
            <ul className="files">
              {([['badge', 'Selo do preço (vazio, sem número)'], ['tag', 'Etiqueta pronta (ex.: "Uaau!")']] as const).map(([role, label]) => {
                const a = theme.assets.find((x) => x.role === role)
                return (
                  <li key={role}>
                    <span style={{ minWidth: 220 }}>{label}</span>
                    {a
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/promocoes/tema/${theme.id}/${role}/${a.format}?v=${a.width}x${a.height}`} alt="" height={34} style={{ maxWidth: 80, objectFit: 'contain', background: '#cfe', borderRadius: 4 }} />
                      : <span className="muted">padrão desenhado pelo sistema</span>}
                    {canEdit && (
                      <>
                        <button type="button" className="mini-btn" onClick={() => fileRefs.current[`${role}-shared`]?.click()}><Upload size={12} /> {a ? 'Trocar' : 'Enviar'}</button>
                        <input ref={(el) => { fileRefs.current[`${role}-shared`] = el }} type="file" hidden accept="image/png,image/webp" onChange={(e) => { void upload(role, 'story', e.target.files?.[0]); e.target.value = '' }} aria-label={label} />
                        {a && <button type="button" className="mini-btn" disabled={busy} onClick={() => start(async () => { await deleteArtAction(theme.id, role, a.format); router.refresh() })}><Trash2 size={12} /></button>}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          {canEdit && (
            <div>
              <strong>Atalho: enviar a arte completa em branco</strong>
              <p className="muted">Se você só tem a peça inteira sem produtos, nomes e preços, envie aqui e diga quantos pixels de cima são o cabeçalho e quantos de baixo são o rodapé: o sistema separa sozinho (a imagem toda fica de fundo).</p>
              <ul className="files">
                {PROMO_FORMAT_KEYS.map((f) => (
                  <li key={f}>
                    <span style={{ minWidth: 200 }}>{PROMO_FORMATS[f].label}</span>
                    <input type="number" min={0} placeholder="cabeçalho px" value={split[f]?.header ?? ''} onChange={(e) => setSplit({ ...split, [f]: { header: e.target.value, footer: split[f]?.footer ?? '' } })} style={{ width: 120 }} aria-label={`Altura do cabeçalho ${PROMO_FORMATS[f].label}`} />
                    <input type="number" min={0} placeholder="rodapé px" value={split[f]?.footer ?? ''} onChange={(e) => setSplit({ ...split, [f]: { header: split[f]?.header ?? '', footer: e.target.value } })} style={{ width: 120 }} aria-label={`Altura do rodapé ${PROMO_FORMATS[f].label}`} />
                    <button type="button" className="mini-btn" onClick={() => fileRefs.current[`split-${f}`]?.click()}><Upload size={12} /> Enviar e dividir</button>
                    <input ref={(el) => { fileRefs.current[`split-${f}`] = el }} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { void dividir(f, e.target.files?.[0]); e.target.value = '' }} aria-label={`Arte completa ${PROMO_FORMATS[f].label}`} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }} aria-label="Cores e textos">
        <h3>Cores, textos e grade</h3>
        <div className="grid-3">
          <div><label htmlFor="th-name">Nome do tema</label><input id="th-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!canEdit} /></div>
          <div><label htmlFor="th-title">Título padrão (se a arte não traz)</label><input id="th-title" type="text" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} maxLength={60} disabled={!canEdit} /></div>
          <div><label htmlFor="th-tag">Etiqueta do preço</label><input id="th-tag" type="text" value={cfg.tagText} onChange={(e) => setCfg({ ...cfg, tagText: e.target.value })} maxLength={20} disabled={!canEdit} /></div>
        </div>
        <div className="form-actions" style={{ marginTop: 4 }}>
          <label><input type="checkbox" checked={cfg.showTag} onChange={(e) => setCfg({ ...cfg, showTag: e.target.checked })} disabled={!canEdit} /> Mostrar etiqueta</label>
          <label><input type="checkbox" checked={cfg.stack} onChange={(e) => setCfg({ ...cfg, stack: e.target.checked })} disabled={!canEdit} /> Foto em dobro (uma atrás da outra)</label>
        </div>
        <label>Rodapé padrão (até 3 linhas, se a arte não traz)</label>
        <div className="grid-3">{[0, 1, 2].map((i) => <input key={i} type="text" value={cfg.footerLines[i] ?? ''} maxLength={80} disabled={!canEdit} aria-label={`Linha ${i + 1} do rodapé`}
          onChange={(e) => { const l = [...cfg.footerLines]; l[i] = e.target.value; setCfg({ ...cfg, footerLines: l.filter((x, k) => x || k < i).map((x) => x ?? '') }) }} />)}</div>

        <label style={{ marginTop: 10 }}>Quantos produtos por peça</label>
        <ul className="files">
          {PROMO_FORMAT_KEYS.map((f) => (
            <li key={f}>
              <span style={{ minWidth: 200 }}>{PROMO_FORMATS[f].label}</span>
              <input type="number" min={1} max={6} value={cfg.grid[f].cols} onChange={(e) => setGrid(f, 'cols', Number(e.target.value))} style={{ width: 70 }} aria-label={`Colunas ${PROMO_FORMATS[f].label}`} disabled={!canEdit} /> colunas ×
              <input type="number" min={1} max={8} value={cfg.grid[f].rows} onChange={(e) => setGrid(f, 'rows', Number(e.target.value))} style={{ width: 70 }} aria-label={`Linhas ${PROMO_FORMATS[f].label}`} disabled={!canEdit} /> linhas
              <input type="number" min={0} max={12} step={0.5} value={cfg.panelMargin[f]} onChange={(e) => setCfg({ ...cfg, panelMargin: { ...cfg.panelMargin, [f]: Number(e.target.value) } })} style={{ width: 70 }} aria-label={`Margem do painel ${PROMO_FORMATS[f].label}`} disabled={!canEdit} /> % de margem
              <label style={{ marginLeft: 'auto' }}><input type="checkbox" checked={cfg.panel[f]} onChange={(e) => setCfg({ ...cfg, panel: { ...cfg.panel, [f]: e.target.checked } })} disabled={!canEdit} /> painel branco</label>
            </li>
          ))}
        </ul>

        <label style={{ marginTop: 10 }}>Cores</label>
        <div className="color-grid">
          {(Object.keys(COLOR_LABELS) as (keyof ThemeConfig['colors'])[]).map((k) => (
            <label key={k} className="color-item"><input type="color" value={cfg.colors[k]} onChange={(e) => setColor(k, e.target.value)} disabled={!canEdit} /> {COLOR_LABELS[k]}</label>
          ))}
        </div>

        {canEdit && (
          <div className="form-actions">
            <button type="button" className="primary" style={{ width: 'auto' }} disabled={busy} onClick={() => start(async () => { const r = await saveThemeAction(theme.id, name, cfg); setMsg(r.ok ? { kind: 'ok', text: 'Tema salvo.' } : { kind: 'error', text: r.error ?? 'Não foi possível salvar.' }); router.refresh() })}>Salvar tema</button>
            <button type="button" className="danger" disabled={busy} onClick={() => { if (confirm('Excluir este tema? As promoções que o usam ficam sem tema.')) start(async () => { await deleteThemeAction(theme.id); router.push('/promocoes/temas') }) }}>Excluir tema</button>
          </div>
        )}
      </section>
    </>
  )
}
