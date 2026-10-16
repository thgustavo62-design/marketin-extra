'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { zipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { ArrowDown, ArrowUp, Download, Trash2 } from 'lucide-react'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, paginate, type PromoFormat, type ThemeConfig } from '@/lib/domain/promo'
import type { PromoItem, ThemeAsset } from '@/lib/promo/store'
import { canvasToBlob, drawPage, loadImage, loadPromoFonts, type RenderAssets, type RenderItem } from '@/lib/promo/render'
import { ProductPicker } from '../../produtos/product-picker'
import { addItemAction, deleteCampaignAction, moveItemAction, removeItemAction, updateCampaignAction, updateItemAction } from '../actions'

type ThemeLite = { id: string; name: string }
type Props = {
  campaign: { id: string; name: string; title: string | null; validity: string | null; theme_id: string | null }
  theme: { id: string; name: string; config: ThemeConfig; assets: ThemeAsset[] } | null
  themes: ThemeLite[]
  items: PromoItem[]
  canEdit: boolean
}

const slug = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'promocao'

export function PromoStudio({ campaign, theme, themes, items: initial, canEdit }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  useEffect(() => setItems(initial), [initial])
  const [format, setFormat] = useState<PromoFormat>('story')
  const [page, setPage] = useState(0)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, start] = useTransition()
  const [rendering, setRendering] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCache = useRef(new Map<string, HTMLImageElement | null>())

  const cfg = theme?.config
  const grid = cfg?.grid[format] ?? { cols: 2, rows: 3 }
  const perPage = grid.cols * grid.rows
  const pages = useMemo(() => paginate(items, perPage), [items, perPage])
  const pageIdx = Math.min(page, Math.max(0, pages.length - 1))
  const semFoto = items.filter((i) => !i.photo_id).length

  const getImg = useCallback(async (url: string) => {
    if (!url) return null
    if (!imgCache.current.has(url)) imgCache.current.set(url, await loadImage(url))
    return imgCache.current.get(url) ?? null
  }, [])

  const renderTo = useCallback(async (canvas: HTMLCanvasElement, fmt: PromoFormat, idx: number) => {
    if (!theme || !cfg) return
    await loadPromoFonts()
    const has = (role: string) => theme.assets.some((a) => a.role === role && a.format === fmt)
    const sig = (role: string) => `/api/promocoes/tema/${theme.id}/${role}/${fmt}?v=${theme.assets.find((a) => a.role === role && a.format === fmt)?.width ?? 0}x${theme.assets.find((a) => a.role === role && a.format === fmt)?.height ?? 0}`
    // selo e etiqueta são iguais em todos os formatos: vale o do formato ou o primeiro que existir
    const shared = (role: string) => { const a = theme.assets.find((x) => x.role === role && x.format === fmt) ?? theme.assets.find((x) => x.role === role); return a ? `/api/promocoes/tema/${theme.id}/${role}/${a.format}?v=${a.width}x${a.height}` : ''}
    const assets: RenderAssets = {
      background: has('background') ? await getImg(sig('background')) : null,
      header: has('header') ? await getImg(sig('header')) : null,
      footer: has('footer') ? await getImg(sig('footer')) : null,
      badge: await getImg(shared('badge')),
      tag: await getImg(shared('tag')),
    }
    const g = cfg.grid[fmt]
    const pg = paginate(items, g.cols * g.rows)[Math.min(idx, Math.max(0, pages.length - 1))] ?? []
    const render: RenderItem[] = await Promise.all(pg.map(async (it) => ({ name: it.name, price: it.price, img: it.photo_id ? await getImg(`/api/produtos/imagem/${it.photo_id}`) : null })))
    drawPage(canvas, { format: fmt, theme: cfg, title: campaign.title, validity: campaign.validity, assets, items: render })
  }, [theme, cfg, items, campaign.title, campaign.validity, getImg, pages.length])

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !theme) return
    let cancel = false
    setRendering(true)
    renderTo(c, format, pageIdx).finally(() => { if (!cancel) setRendering(false) })
    return () => { cancel = true }
  }, [renderTo, format, pageIdx, theme])

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? (okText ? { kind: 'ok', text: okText } : null) : { kind: 'error', text: r.error ?? 'Não foi possível concluir.' })
      router.refresh()
    })

  // ---------- downloads ----------
  const pageBlob = async (fmt: PromoFormat, idx: number) => { const c = document.createElement('canvas'); await renderTo(c, fmt, idx); return canvasToBlob(c) }
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
  const base = slug(campaign.name)
  const pagesOf = (fmt: PromoFormat) => { const g = cfg!.grid[fmt]; return paginate(items, g.cols * g.rows).length }

  async function downloadPage() {
    setMsg(null)
    save(await pageBlob(format, pageIdx), `${base}-${format}-${pageIdx + 1}.png`)
  }
  async function downloadZip(formats: PromoFormat[]) {
    setMsg({ kind: 'ok', text: 'Gerando as peças…' })
    const files: Record<string, Uint8Array> = {}
    for (const f of formats) for (let i = 0; i < pagesOf(f); i++) files[`${f}/${base}-${f}-${i + 1}.png`] = new Uint8Array(await (await pageBlob(f, i)).arrayBuffer())
    save(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), `${base}${formats.length === 1 ? `-${formats[0]}` : ''}.zip`)
    setMsg({ kind: 'ok', text: 'Pronto: arquivo baixado.' })
  }
  async function downloadPdf() {
    setMsg({ kind: 'ok', text: 'Gerando o PDF…' })
    const pdf = await PDFDocument.create()
    for (let i = 0; i < pagesOf('a4'); i++) {
      const png = await pdf.embedPng(new Uint8Array(await (await pageBlob('a4', i)).arrayBuffer()))
      const p = pdf.addPage([595.28, 841.89]); p.drawImage(png, { x: 0, y: 0, width: 595.28, height: 841.89 })
    }
    save(new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }), `${base}-a4.pdf`)
    setMsg({ kind: 'ok', text: 'Pronto: PDF baixado.' })
  }

  // ---------- configuração da campanha ----------
  const [conf, setConf] = useState({ name: campaign.name, title: campaign.title ?? '', validity: campaign.validity ?? '', themeId: campaign.theme_id ?? '' })
  const [addPrice, setAddPrice] = useState('')
  const [pickedProduct, setPickedProduct] = useState<{ id: string; description: string } | null>(null)

  return (
    <>
      {msg && <p className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      {semFoto > 0 && <div className="notice" role="status">{semFoto} produto(s) estão <strong>sem foto</strong> no banco de imagens e saem com a caixa &quot;SEM FOTO&quot;. <Link href="/produtos?f=sem">Ver produtos sem foto</Link></div>}

      <div className="studio-grid">
        <section className="card" aria-label="Prévia">
          <div className="tabs" style={{ marginBottom: 10 }}>
            {PROMO_FORMAT_KEYS.map((f) => (
              <button key={f} type="button" className={`tab${format === f ? ' active' : ''}`} onClick={() => { setFormat(f); setPage(0) }}>{PROMO_FORMATS[f].label}</button>
            ))}
          </div>
          {!theme ? (
            <p className="empty">Escolha um tema para ver a peça. <Link href="/promocoes/temas">Gerenciar temas</Link></p>
          ) : (
            <>
              <div className="studio-canvas"><canvas ref={canvasRef} aria-label={`Prévia ${PROMO_FORMATS[format].label}`} data-ready={rendering ? '0' : '1'} /></div>
              <div className="form-actions" style={{ justifyContent: 'space-between' }}>
                <span className="muted">{PROMO_FORMATS[format].hint} · {grid.cols}×{grid.rows} por peça · {pages.length || 1} peça(s)</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" className="mini-btn" disabled={pageIdx === 0} onClick={() => setPage(pageIdx - 1)}>←</button>
                  <span className="muted">{pageIdx + 1} / {Math.max(1, pages.length)}</span>
                  <button type="button" className="mini-btn" disabled={pageIdx >= pages.length - 1} onClick={() => setPage(pageIdx + 1)}>→</button>
                </span>
              </div>
              <div className="form-actions">
                <button type="button" className="primary" style={{ width: 'auto' }} onClick={downloadPage} disabled={!items.length}><Download size={14} /> Baixar esta peça (PNG)</button>
                <button type="button" className="secondary" onClick={() => downloadZip([format])} disabled={!items.length}>Todas do formato (ZIP)</button>
                <button type="button" className="secondary" onClick={() => downloadZip(PROMO_FORMAT_KEYS)} disabled={!items.length}>Todos os formatos (ZIP)</button>
                <button type="button" className="secondary" onClick={downloadPdf} disabled={!items.length}>A4 em PDF</button>
              </div>
            </>
          )}
        </section>

        <section className="card" aria-label="Produtos da promoção">
          <h3>Produtos ({items.length})</h3>
          <p className="muted">Nome, preço e foto vêm da planilha e do banco de imagens; ajuste o que precisar. A ordem aqui é a ordem na peça.</p>
          <ul className="promo-items">
            {items.map((it, k) => (
              <li key={it.id}>
                <span className="promo-pos">{k + 1}</span>
                {it.photo_id
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/produtos/imagem/${it.photo_id}?mini=1`} alt="" width={44} height={44} style={{ objectFit: 'contain', background: '#eef2f6', borderRadius: 6 }} />
                  : <span className="promo-nophoto">sem foto</span>}
                <input type="text" defaultValue={it.name} disabled={!canEdit || busy} aria-label={`Nome do item ${k + 1}`} maxLength={160}
                  onBlur={(e) => { if (e.target.value !== it.name) act(() => updateItemAction(campaign.id, it.id, e.target.value, String(it.price), it.photo_image_id)) }} />
                <input type="text" inputMode="decimal" defaultValue={it.price.toFixed(2).replace('.', ',')} disabled={!canEdit || busy} aria-label={`Preço do item ${k + 1}`} style={{ width: 84 }}
                  onBlur={(e) => { if (e.target.value.replace(',', '.') !== String(it.price)) act(() => updateItemAction(campaign.id, it.id, it.name, e.target.value, it.photo_image_id)) }} />
                {it.photos.length > 1 && canEdit && (
                  <span className="promo-photos" aria-label="Trocar foto">
                    {it.photos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p} src={`/api/produtos/imagem/${p}?mini=1`} alt="" width={26} height={26} className={p === it.photo_id ? 'sel' : ''} onClick={() => act(() => updateItemAction(campaign.id, it.id, it.name, String(it.price), p))} />
                    ))}
                  </span>
                )}
                {canEdit && (
                  <span className="promo-ctl">
                    <button type="button" className="mini-btn" disabled={busy || k === 0} onClick={() => act(() => moveItemAction(campaign.id, it.id, -1))} aria-label="Subir"><ArrowUp size={12} /></button>
                    <button type="button" className="mini-btn" disabled={busy || k === items.length - 1} onClick={() => act(() => moveItemAction(campaign.id, it.id, 1))} aria-label="Descer"><ArrowDown size={12} /></button>
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => act(() => removeItemAction(campaign.id, it.id))} aria-label="Remover"><Trash2 size={12} /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="picker" style={{ marginTop: 10 }}>
              <strong>Adicionar produto</strong>
              {pickedProduct ? (
                <div className="form-actions">
                  <span>{pickedProduct.description}</span>
                  <input type="text" inputMode="decimal" placeholder="Preço promocional" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} style={{ width: 150 }} aria-label="Preço do produto adicionado" />
                  <button type="button" className="secondary" disabled={busy} onClick={() => act(() => addItemAction(campaign.id, pickedProduct.id, addPrice).then((r) => { if (r.ok) { setPickedProduct(null); setAddPrice('') } return r }))}>Adicionar</button>
                  <button type="button" className="link" onClick={() => setPickedProduct(null)}>cancelar</button>
                </div>
              ) : <ProductPicker onPick={(p) => setPickedProduct({ id: p.id, description: p.description })} />}
            </div>
          )}
        </section>
      </div>

      {canEdit && (
        <section className="card" style={{ marginTop: 14 }} aria-label="Dados da promoção">
          <h3>Dados da promoção</h3>
          <div className="grid-3">
            <div><label htmlFor="pc-name">Nome interno</label><input id="pc-name" type="text" value={conf.name} onChange={(e) => setConf({ ...conf, name: e.target.value })} maxLength={120} /></div>
            <div><label htmlFor="pc-title">Título na peça (se o tema não traz na arte)</label><input id="pc-title" type="text" value={conf.title} onChange={(e) => setConf({ ...conf, title: e.target.value })} maxLength={60} placeholder="Ex.: ATACADÃO DO BEBÊ" /></div>
            <div><label htmlFor="pc-val">Validade (texto)</label><input id="pc-val" type="text" value={conf.validity} onChange={(e) => setConf({ ...conf, validity: e.target.value })} maxLength={80} placeholder="Ex.: Válido de 20 a 26/10" /></div>
          </div>
          <label htmlFor="pc-theme">Tema (arte)</label>
          <select id="pc-theme" value={conf.themeId} onChange={(e) => setConf({ ...conf, themeId: e.target.value })}>
            <option value="">— escolha —</option>
            {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="form-actions">
            <button type="button" className="primary" style={{ width: 'auto' }} disabled={busy} onClick={() => act(() => updateCampaignAction(campaign.id, conf), 'Salvo.')}>Salvar</button>
            <Link href="/promocoes/temas" className="btn">Gerenciar temas</Link>
            <button type="button" className="danger" disabled={busy} onClick={() => { if (confirm('Excluir esta promoção?')) start(async () => { await deleteCampaignAction(campaign.id); router.push('/promocoes') }) }}>Excluir promoção</button>
          </div>
        </section>
      )}
    </>
  )
}
