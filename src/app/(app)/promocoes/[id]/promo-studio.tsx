'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { zipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { ArrowDown, ArrowUp, Download, GripVertical, Layers, Palette, Settings2, Trash2 } from 'lucide-react'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, paginateSections, type PromoFormat, type Rect, type ThemeConfig } from '@/lib/domain/promo'
import type { PromoItem, ThemeAsset } from '@/lib/promo/store'
import { canvasToBlob, drawPage, loadImage, loadPromoFonts, pageGeometry, type RenderAssets, type RenderItem } from '@/lib/promo/render'
import { ProductPicker } from '../../produtos/product-picker'
import { addItemAction, deleteCampaignAction, moveItemAction, removeItemAction, reorderItemsAction, updateCampaignAction, updateItemAction } from '../actions'

type ThemeLite = { id: string; name: string }
type Props = {
  campaign: { id: string; name: string; title: string | null; validity: string | null; theme_id: string | null }
  theme: { id: string; name: string; config: ThemeConfig; assets: ThemeAsset[] } | null
  themes: ThemeLite[]
  items: PromoItem[]
  canEdit: boolean
}
type Geo = { W: number; H: number; cells: Rect[]; ids: string[] }

const slug = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'promocao'
const brl = (n: number) => n.toFixed(2).replace('.', ',')

export function PromoStudio({ campaign, theme, themes, items: initial, canEdit }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  useEffect(() => setItems(initial), [initial])
  const [format, setFormat] = useState<PromoFormat>('story')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'produtos' | 'tema' | 'dados'>('produtos')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, start] = useTransition()
  const [rendering, setRendering] = useState(true)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCache = useRef(new Map<string, HTMLImageElement | null>())

  const cfg = theme?.config
  const grid = cfg?.grid[format] ?? { cols: 2, rows: 3 }
  const perPage = grid.cols * grid.rows
  const pages = useMemo(() => paginateSections(items, perPage, cfg?.breakBySection[format] ?? false), [items, perPage, cfg, format])
  const pageIdx = Math.min(page, Math.max(0, pages.length - 1))
  const semFoto = items.filter((i) => !i.photo_id).length
  const sel = items.find((i) => i.id === selected) ?? null

  const getImg = useCallback(async (url: string) => {
    if (!url) return null
    if (!imgCache.current.has(url)) imgCache.current.set(url, await loadImage(url))
    return imgCache.current.get(url) ?? null
  }, [])

  // desenha uma peça (qualquer formato/página) num canvas e devolve a posição de cada produto
  const renderTo = useCallback(async (canvas: HTMLCanvasElement, fmt: PromoFormat, idx: number): Promise<Geo | null> => {
    if (!theme || !cfg) return null
    await loadPromoFonts()
    const find = (role: string) => theme.assets.find((a) => a.role === role && a.format === fmt)
    const url = (role: string, a: ThemeAsset | undefined) => (a ? `/api/promocoes/tema/${theme.id}/${role}/${a.format}?v=${a.width}x${a.height}` : '')
    const shared = (role: string) => { const a = find(role) ?? theme.assets.find((x) => x.role === role); return url(role, a) }
    const assets: RenderAssets = {
      background: await getImg(url('background', find('background'))), header: await getImg(url('header', find('header'))), footer: await getImg(url('footer', find('footer'))),
      badge: await getImg(shared('badge')), tag: await getImg(shared('tag')),
    }
    const g = cfg.grid[fmt]
    const ps = paginateSections(items, g.cols * g.rows, cfg.breakBySection[fmt])
    const pg = ps[Math.min(idx, Math.max(0, ps.length - 1))] ?? []
    const render: RenderItem[] = await Promise.all(pg.map(async (it) => ({ name: it.name, price: it.price, img: it.photo_id ? await getImg(`/api/produtos/imagem/${it.photo_id}`) : null })))
    drawPage(canvas, { format: fmt, theme: cfg, title: campaign.title, validity: campaign.validity, assets, items: render })
    const gm = pageGeometry({ format: fmt, theme: cfg, assets, count: pg.length })
    return { W: gm.W, H: gm.H, cells: gm.cells, ids: pg.map((i) => i.id) }
  }, [theme, cfg, items, campaign.title, campaign.validity, getImg])

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !theme) return
    let cancel = false
    setRendering(true)
    renderTo(c, format, pageIdx).then((g) => { if (!cancel) setGeo(g) }).finally(() => { if (!cancel) setRendering(false) })
    return () => { cancel = true }
  }, [renderTo, format, pageIdx, theme])

  // miniaturas das peças do formato (faixa de baixo)
  useEffect(() => {
    if (!theme || !items.length) { setThumbs([]); return }
    let cancel = false
    ;(async () => {
      const out: string[] = []
      for (let i = 0; i < pages.length; i++) {
        if (cancel) return
        const big = document.createElement('canvas')
        await renderTo(big, format, i)
        const small = document.createElement('canvas')
        const w = 150, h = Math.round((150 * big.height) / big.width)
        small.width = w; small.height = h
        small.getContext('2d')!.drawImage(big, 0, 0, w, h)
        out.push(small.toDataURL('image/jpeg', 0.7))
        if (!cancel) setThumbs([...out])
      }
    })()
    return () => { cancel = true }
  }, [renderTo, format, pages.length, theme, items.length])

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? (okText ? { kind: 'ok', text: okText } : null) : { kind: 'error', text: r.error ?? 'Não foi possível concluir.' })
      router.refresh()
    })

  // ---------- seleção e reordenação ----------
  const select = (id: string | null) => {
    setSelected(id)
    if (id) {
      const k = pages.findIndex((p) => p.some((i) => i.id === id))
      if (k >= 0) setPage(k)
    }
  }
  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const arr = [...items]
    const a = arr.findIndex((i) => i.id === fromId), b = arr.findIndex((i) => i.id === toId)
    if (a < 0 || b < 0) return
    // soltar sobre outro produto na peça = troca de lugar com ele
    ;[arr[a], arr[b]] = [arr[b], arr[a]]
    setItems(arr.map((x, k) => ({ ...x, position: k + 1 })))
    act(() => reorderItemsAction(campaign.id, arr.map((x) => x.id)))
  }
  const moveInList = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const arr = [...items]
    const a = arr.findIndex((i) => i.id === fromId), b = arr.findIndex((i) => i.id === toId)
    if (a < 0 || b < 0) return
    const [m] = arr.splice(a, 1); arr.splice(b, 0, m) // na lista, soltar em cima = inserir naquela posição
    setItems(arr.map((x, k) => ({ ...x, position: k + 1 })))
    act(() => reorderItemsAction(campaign.id, arr.map((x) => x.id)))
  }

  // ---------- downloads ----------
  const pageBlob = async (fmt: PromoFormat, idx: number) => { const c = document.createElement('canvas'); await renderTo(c, fmt, idx); return canvasToBlob(c) }
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
  const base = slug(campaign.name)
  const pagesOf = (fmt: PromoFormat) => { const g = cfg!.grid[fmt]; return paginateSections(items, g.cols * g.rows, cfg!.breakBySection[fmt]) }
  const fileName = (fmt: PromoFormat, i: number) => { const sec = pagesOf(fmt)[i]?.[0]?.section; return `${base}-${fmt}-${i + 1}${sec ? `-${slug(sec)}` : ''}.png` }

  async function downloadPage() { setMsg(null); save(await pageBlob(format, pageIdx), fileName(format, pageIdx)) }
  async function downloadZip(formats: PromoFormat[]) {
    setMsg({ kind: 'ok', text: 'Gerando as peças…' })
    const files: Record<string, Uint8Array> = {}
    for (const f of formats) for (let i = 0; i < pagesOf(f).length; i++) files[`${f}/${fileName(f, i)}`] = new Uint8Array(await (await pageBlob(f, i)).arrayBuffer())
    save(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), `${base}${formats.length === 1 ? `-${formats[0]}` : ''}.zip`)
    setMsg({ kind: 'ok', text: 'Pronto: arquivo baixado.' })
  }
  async function downloadPdf() {
    setMsg({ kind: 'ok', text: 'Gerando o PDF…' })
    const pdf = await PDFDocument.create()
    for (let i = 0; i < pagesOf('a4').length; i++) {
      const png = await pdf.embedPng(new Uint8Array(await (await pageBlob('a4', i)).arrayBuffer()))
      const p = pdf.addPage([595.28, 841.89]); p.drawImage(png, { x: 0, y: 0, width: 595.28, height: 841.89 })
    }
    save(new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }), `${base}-a4.pdf`)
    setMsg({ kind: 'ok', text: 'Pronto: PDF baixado.' })
  }

  // ---------- dados da promoção ----------
  const [conf, setConf] = useState({ name: campaign.name, title: campaign.title ?? '', validity: campaign.validity ?? '', themeId: campaign.theme_id ?? '' })
  const [addPrice, setAddPrice] = useState('')
  const [picked, setPicked] = useState<{ id: string; description: string } | null>(null)
  const sections = [...new Set(items.map((i) => i.section).filter((x): x is string => !!x))]

  return (
    <div className="canva">
      {msg && <p className={`canva-msg ${msg.kind === 'ok' ? 'form-ok' : 'form-error'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      {semFoto > 0 && <div className="notice" role="status">{semFoto} produto(s) estão <strong>sem foto</strong> no banco de imagens e saem com a caixa &quot;SEM FOTO&quot;. <Link href="/produtos?f=sem">Ver produtos sem foto</Link></div>}

      {/* barra superior */}
      <div className="canva-top">
        <div className="tabs">
          {PROMO_FORMAT_KEYS.map((f) => <button key={f} type="button" className={`tab${format === f ? ' active' : ''}`} onClick={() => { setFormat(f); setPage(0) }}>{PROMO_FORMATS[f].label}</button>)}
        </div>
        <div className="canva-actions">
          <button type="button" className="primary" onClick={downloadPage} disabled={!items.length || !theme}><Download size={14} /> Baixar esta peça (PNG)</button>
          <button type="button" className="secondary" onClick={() => downloadZip([format])} disabled={!items.length || !theme}>Todas do formato (ZIP)</button>
          <button type="button" className="secondary" onClick={() => downloadZip(PROMO_FORMAT_KEYS)} disabled={!items.length || !theme}>Todos os formatos (ZIP)</button>
          <button type="button" className="secondary" onClick={downloadPdf} disabled={!items.length || !theme}>A4 em PDF</button>
        </div>
      </div>

      <div className="canva-body">
        {/* painel da esquerda */}
        <aside className="canva-left" aria-label="Painel">
          <div className="canva-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'produtos'} className={tab === 'produtos' ? 'on' : ''} onClick={() => setTab('produtos')}><Layers size={14} /> Produtos</button>
            <button type="button" role="tab" aria-selected={tab === 'tema'} className={tab === 'tema' ? 'on' : ''} onClick={() => setTab('tema')}><Palette size={14} /> Tema</button>
            <button type="button" role="tab" aria-selected={tab === 'dados'} className={tab === 'dados' ? 'on' : ''} onClick={() => setTab('dados')}><Settings2 size={14} /> Dados</button>
          </div>

          {tab === 'produtos' && (
            <section aria-label="Produtos da promoção">
              <p className="muted">{items.length} produto(s){sections.length > 1 ? ` · ${sections.length} abas` : ''}. Arraste para mudar a ordem; clique para editar.</p>
              <ul className="canva-list">
                {items.map((it, k) => (
                  <li key={it.id} data-item={it.id} className={`${selected === it.id ? 'sel' : ''}${overId === it.id ? ' over' : ''}`} draggable={canEdit}
                    onDragStart={(e) => { setDragId(it.id); e.dataTransfer.setData('text/plain', it.id) }} onDragEnd={() => { setDragId(null); setOverId(null) }}
                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(it.id) } }} onDrop={(e) => { e.preventDefault(); if (dragId) moveInList(dragId, it.id); setDragId(null); setOverId(null) }}
                    onClick={() => select(it.id)}>
                    {sections.length > 1 && (k === 0 || items[k - 1].section !== it.section) && <span className="canva-sec">{it.section ?? 'sem aba'}</span>}
                    <GripVertical size={14} className="grip" />
                    <span className="promo-pos">{k + 1}</span>
                    {it.photo_id
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/produtos/imagem/${it.photo_id}?mini=1`} alt="" width={34} height={34} style={{ objectFit: 'contain', background: '#eef2f6', borderRadius: 5 }} />
                      : <span className="promo-nophoto" style={{ width: 34, height: 34 }}>sem foto</span>}
                    <span className="canva-name">{it.name}</span>
                    <span className="canva-price">R$ {brl(it.price)}</span>
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="picker" style={{ marginTop: 10 }}>
                  <strong>Adicionar produto</strong>
                  {picked ? (
                    <div className="form-actions">
                      <span>{picked.description}</span>
                      <input type="text" inputMode="decimal" placeholder="Preço" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} style={{ width: 110 }} aria-label="Preço do produto adicionado" />
                      <button type="button" className="secondary" disabled={busy} onClick={() => act(() => addItemAction(campaign.id, picked.id, addPrice).then((r) => { if (r.ok) { setPicked(null); setAddPrice('') } return r }))}>Adicionar</button>
                      <button type="button" className="link" onClick={() => setPicked(null)}>cancelar</button>
                    </div>
                  ) : <ProductPicker onPick={(p) => setPicked({ id: p.id, description: p.description })} />}
                </div>
              )}
            </section>
          )}

          {tab === 'tema' && (
            <section aria-label="Temas">
              <p className="muted">Escolha o tema da peça. O sistema troca a arte na hora; produtos, nomes e preços continuam.</p>
              <ul className="canva-themes">
                {themes.map((t) => (
                  <li key={t.id}>
                    <button type="button" className={campaign.theme_id === t.id ? 'on' : ''} disabled={!canEdit || busy} onClick={() => act(() => updateCampaignAction(campaign.id, { name: campaign.name, title: campaign.title ?? '', validity: campaign.validity ?? '', themeId: t.id }))}>
                      {t.name}{campaign.theme_id === t.id ? ' ✓' : ''}
                    </button>
                  </li>
                ))}
              </ul>
              <Link href="/promocoes/temas" className="btn">Gerenciar temas e artes</Link>
            </section>
          )}

          {tab === 'dados' && canEdit && (
            <section aria-label="Dados da promoção" className="stack-form">
              <label htmlFor="pc-name">Nome interno</label><input id="pc-name" type="text" value={conf.name} onChange={(e) => setConf({ ...conf, name: e.target.value })} maxLength={120} />
              <label htmlFor="pc-title">Título na peça (se o tema não traz na arte)</label><input id="pc-title" type="text" value={conf.title} onChange={(e) => setConf({ ...conf, title: e.target.value })} maxLength={60} />
              <label htmlFor="pc-val">Validade (texto)</label><input id="pc-val" type="text" value={conf.validity} onChange={(e) => setConf({ ...conf, validity: e.target.value })} maxLength={80} />
              <div className="form-actions">
                <button type="button" className="primary" style={{ width: 'auto' }} disabled={busy} onClick={() => act(() => updateCampaignAction(campaign.id, { ...conf, themeId: campaign.theme_id ?? '' }), 'Salvo.')}>Salvar</button>
                <button type="button" className="danger" disabled={busy} onClick={() => { if (confirm('Excluir esta promoção?')) start(async () => { await deleteCampaignAction(campaign.id); router.push('/promocoes') }) }}>Excluir promoção</button>
              </div>
            </section>
          )}
        </aside>

        {/* peça */}
        <main className="canva-stage" aria-label="Prévia">
          {!theme ? <p className="empty">Escolha um tema na aba &quot;Tema&quot; para ver a peça.</p> : (
            <div className="canva-paper" style={{ aspectRatio: `${PROMO_FORMATS[format].w} / ${PROMO_FORMATS[format].h}` }}>
              <canvas ref={canvasRef} aria-label={`Prévia ${PROMO_FORMATS[format].label}`} data-ready={rendering ? '0' : '1'} />
              {geo && (
                <div className="canva-overlay">
                  {geo.cells.map((c, i) => {
                    const id = geo.ids[i]
                    return (
                      <div key={id} className={`canva-hit${selected === id ? ' sel' : ''}${overId === id ? ' over' : ''}`} data-item={id} title="Clique para editar; arraste sobre outro para trocar de lugar" draggable={canEdit}
                        style={{ left: `${(c.x / geo.W) * 100}%`, top: `${(c.y / geo.H) * 100}%`, width: `${(c.w / geo.W) * 100}%`, height: `${(c.h / geo.H) * 100}%` }}
                        onClick={() => select(id)}
                        onDragStart={(e) => { setDragId(id); e.dataTransfer.setData('text/plain', id) }} onDragEnd={() => { setDragId(null); setOverId(null) }}
                        onDragOver={(e) => { if (dragId && dragId !== id) { e.preventDefault(); setOverId(id) } }} onDragLeave={() => setOverId((o) => (o === id ? null : o))}
                        onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, id); setDragId(null); setOverId(null) }} />
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div className="canva-pager">
            <button type="button" className="mini-btn" disabled={pageIdx === 0} onClick={() => setPage(pageIdx - 1)}>←</button>
            <span className="muted">Peça {pageIdx + 1} de {Math.max(1, pages.length)} · {PROMO_FORMATS[format].hint} · {grid.cols}×{grid.rows}{pages[pageIdx]?.[0]?.section ? ` · aba ${pages[pageIdx][0].section}` : ''}</span>
            <button type="button" className="mini-btn" disabled={pageIdx >= pages.length - 1} onClick={() => setPage(pageIdx + 1)}>→</button>
          </div>
        </main>

        {/* inspetor */}
        <aside className="canva-right" aria-label="Editar produto">
          {sel ? (
            <section>
              <h3>Produto selecionado</h3>
              <p className="muted">{sel.ean ?? 'sem código de barras'}{sel.section ? ` · aba ${sel.section}` : ''}</p>
              {sel.photo_id
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/produtos/imagem/${sel.photo_id}?mini=1`} alt="" className="canva-photo" />
                : <p className="empty">Sem foto no banco de imagens. <Link href={sel.product_id ? `/produtos/${sel.product_id}` : '/produtos'}>Adicionar foto</Link></p>}
              <label htmlFor="in-name">Nome na peça</label>
              <textarea id="in-name" key={`n-${sel.id}-${sel.name}`} rows={3} defaultValue={sel.name} disabled={!canEdit || busy} maxLength={160}
                onBlur={(e) => { if (e.target.value !== sel.name) act(() => updateItemAction(campaign.id, sel.id, e.target.value, String(sel.price), sel.photo_image_id)) }} />
              <label htmlFor="in-price">Preço (R$)</label>
              <input id="in-price" key={`p-${sel.id}-${sel.price}`} type="text" inputMode="decimal" defaultValue={brl(sel.price)} disabled={!canEdit || busy}
                onBlur={(e) => { if (e.target.value.replace(',', '.') !== String(sel.price)) act(() => updateItemAction(campaign.id, sel.id, sel.name, e.target.value, sel.photo_image_id)) }} />
              {sel.photos.length > 1 && canEdit && (
                <>
                  <label>Foto usada</label>
                  <span className="promo-photos big">
                    {sel.photos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p} src={`/api/produtos/imagem/${p}?mini=1`} alt="" width={52} height={52} className={p === sel.photo_id ? 'sel' : ''} onClick={() => act(() => updateItemAction(campaign.id, sel.id, sel.name, String(sel.price), p))} />
                    ))}
                  </span>
                </>
              )}
              {canEdit && (
                <div className="form-actions">
                  <button type="button" className="mini-btn" disabled={busy || items[0]?.id === sel.id} onClick={() => act(() => moveItemAction(campaign.id, sel.id, -1))} aria-label="Subir"><ArrowUp size={12} /> Subir</button>
                  <button type="button" className="mini-btn" disabled={busy || items[items.length - 1]?.id === sel.id} onClick={() => act(() => moveItemAction(campaign.id, sel.id, 1))} aria-label="Descer"><ArrowDown size={12} /> Descer</button>
                  <button type="button" className="mini-btn" disabled={busy} onClick={() => { setSelected(null); act(() => removeItemAction(campaign.id, sel.id)) }} aria-label="Remover"><Trash2 size={12} /> Remover</button>
                </div>
              )}
              <button type="button" className="link" onClick={() => setSelected(null)}>Fechar</button>
            </section>
          ) : (
            <section>
              <h3>Edição</h3>
              <p className="muted">Clique em um produto na peça (ou na lista) para editar nome, preço e foto. Arraste um produto sobre outro para trocá-los de lugar.</p>
              <ul className="files">
                <li><span>Peças neste formato</span><strong>{pages.length}</strong></li>
                <li><span>Produtos nesta peça</span><strong>{pages[pageIdx]?.length ?? 0}</strong></li>
                <li><span>Sem foto</span><strong>{semFoto}</strong></li>
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* faixa de peças */}
      <div className="canva-strip" aria-label="Peças do formato">
        {pages.map((p, i) => (
          <button key={i} type="button" className={`canva-thumb${i === pageIdx ? ' on' : ''}`} onClick={() => setPage(i)} aria-label={`Peça ${i + 1}`}>
            {thumbs[i]
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumbs[i]} alt="" />
              : <span className="muted">…</span>}
            <small>{i + 1}{p[0]?.section ? ` · ${p[0].section}` : ''}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
