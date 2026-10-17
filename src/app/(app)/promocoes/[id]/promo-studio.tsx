'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { zipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Download, ExternalLink, GripVertical, ImagePlus, Image as ImageIcon, Images, Layers, Palette, Shapes, Settings2, Trash2, Type } from 'lucide-react'
import { PROMO_FORMATS, PROMO_FORMAT_KEYS, TAG_PRESETS, applyOverrides, paginateSections, type BackgroundChoice, type ItemStyle, type PromoFormat, type PromoOverrides, type Rect, type ThemeConfig } from '@/lib/domain/promo'
import { expandSelection, layersForPage } from '@/lib/domain/promo-layers'
import { checkPromotion, pageCountsFor, summarizeCheck, type CheckIssue } from '@/lib/domain/promo-check'
import type { Campaign, PromoItem, SizeEdit, ThemeAsset } from '@/lib/promo/store'
import { canvasToBlob, drawPage, loadFonts, loadImage, loadPromoFonts, pageGeometry, type RenderAssets, type RenderBackground, type RenderItem } from '@/lib/promo/render'
import { ProductPicker } from '../../produtos/product-picker'
import { BackgroundGallery } from './background-gallery'
import { CheckPanel } from './check-panel'
import { LibraryPicker } from './library-picker'
import { AddBar, LayerBoxes, addImageLayer, LayerInspector, LayersCanvas, LayersPanel, MultiInspector, duplicateSelection, useLayerKeys, useLayers } from './layers-ui'
import { QuickEdit } from './quick-edit'
import { RulersAndGuides, useGuides } from './guides-ui'
import { addItemAction, approveCampaignAction, deleteAssetAction, deleteCampaignAction, useLibraryImageAction, moveItemAction, patchItemAction, removeItemAction, reorderItemsAction, saveOverridesAction, setItemProductAction, ungroupItemAction, updateCampaignAction, updateItemAction } from '../actions'

type ThemeLite = { id: string; name: string }
type Props = {
  campaign: Campaign
  theme: { id: string; name: string; config: ThemeConfig; assets: ThemeAsset[] } | null
  themes: ThemeLite[]
  items: PromoItem[]
  canEdit: boolean
  /** "tab" = console em tela cheia, aberto em outra aba */
  mode?: 'embedded' | 'tab'
}
type Geo = { W: number; H: number; cells: Rect[]; ids: string[] }

async function sha256Hex(b: Uint8Array): Promise<string> { const h = await crypto.subtle.digest('SHA-256', b as BufferSource); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('') }
const slug = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'promocao'
const brl = (n: number) => n.toFixed(2).replace('.', ',')

/** Seletor de cor com "padrão do tema": só salva ao sair do campo (evita um pedido por arrasto). */
function ColorField({ label, value, fallback, disabled, onCommit }: { label: string; value: string | undefined; fallback: string; disabled: boolean; onCommit: (v: string | undefined) => void }) {
  const [v, setV] = useState(value ?? fallback)
  useEffect(() => setV(value ?? fallback), [value, fallback])
  return (
    <label className="color-item">
      <input type="color" value={v} disabled={disabled} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.toLowerCase() !== (value ?? fallback).toLowerCase()) onCommit(v) }} />
      {label}
      {value && !disabled && <button type="button" className="link" onClick={() => onCommit(undefined)}>padrão</button>}
    </label>
  )
}

export function PromoStudio({ campaign, theme, themes, items: initial, canEdit, mode = 'embedded' }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  useEffect(() => setItems(initial), [initial])
  const [format, setFormat] = useState<PromoFormat>('story')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'produtos' | 'camadas' | 'fundo' | 'biblioteca' | 'tema' | 'dados'>('produtos')
  const [selIds, setSelIds] = useState<string[]>([])
  const [editingLayer, setEditingLayer] = useState<string | null>(null)
  const [quickId, setQuickId] = useState<string | null>(null)
  const [checkOpen, setCheckOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, start] = useTransition()
  const [rendering, setRendering] = useState(true)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingBg, setUploadingBg] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const spaceRef = useRef(false)
  const [panning, setPanning] = useState(false)
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)
  const imgCache = useRef(new Map<string, HTMLImageElement | null>())

  const baseCfg = theme?.config
  const cfg = useMemo(() => (baseCfg ? applyOverrides(baseCfg, campaign.overrides) : undefined), [baseCfg, campaign.overrides])
  const grid = cfg?.grid[format] ?? { cols: 2, rows: 3 }
  const perPage = grid.cols * grid.rows
  const pages = useMemo(() => paginateSections(items, perPage, cfg?.breakBySection[format] ?? false), [items, perPage, cfg, format])
  const pageIdx = Math.min(page, Math.max(0, pages.length - 1))
  const semFoto = items.filter((i) => !i.photo_id).length
  const sel = items.find((i) => i.id === selected) ?? null
  const [sizesDraft, setSizesDraft] = useState<SizeEdit[]>([])
  const selSizesKey = sel?.variants?.kind === 'sizes' ? JSON.stringify(sel.variants.rows.map((r) => [r.label, r.units])) : ''
  useEffect(() => { setSizesDraft(sel?.variants?.kind === 'sizes' ? sel.variants.rows.map((r) => ({ label: r.label, units: r.units })) : []) }, [sel?.id, selSizesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const getImg = useCallback(async (url: string) => {
    if (!url) return null
    if (!imgCache.current.has(url)) imgCache.current.set(url, await loadImage(url))
    return imgCache.current.get(url) ?? null
  }, [])

  const guidesApi = useGuides(campaign.id)
  const layersApi = useLayers(campaign.id, campaign.layers, canEdit, () => router.refresh(), campaign.layers_rev)
  const curLayers = layersApi.layers[format]
  const selL = selIds.length === 1 ? (curLayers.find((l) => l.id === selIds[0]) ?? null) : null
  const pageLayers = useMemo(() => layersForPage(curLayers, pageIdx), [curLayers, pageIdx])
  // sem peça aberta com este elemento, a seleção some
  useEffect(() => { if (selIds.some((id) => !curLayers.some((l) => l.id === id))) setSelIds((ids) => ids.filter((id) => curLayers.some((l) => l.id === id))) }, [selIds, curLayers])
  useEffect(() => { if (editingLayer && selIds[0] !== editingLayer) setEditingLayer(null) }, [editingLayer, selIds])
  useLayerKeys({ api: layersApi, format, page: pageIdx, selIds, select: (ids) => { setSelIds(ids); if (ids.length) { setSelected(null); setQuickId(null) } }, canEdit, pageIds: () => pageLayers.filter((l) => !l.locked).map((l) => l.id) })

  const issues = useMemo(() => checkPromotion({ items, layers: layersApi.layers, validity: campaign.validity, pageCount: pageCountsFor(items, cfg ?? null) }), [items, layersApi.layers, campaign.validity, cfg])
  const checkSum = summarizeCheck(issues)
  const gotoIssue = (i: CheckIssue) => {
    if (i.itemId) { setTab('produtos'); select(i.itemId); return }
    if (i.layerId && i.format) { setFormat(i.format); setPage(0); setTab('camadas'); selectLayers([i.layerId]) }
  }

  // o que cada encarte leva para o desenho: tabela de tamanhos e fragrâncias só quando ligadas
  const toRender = useCallback(async (it: PromoItem): Promise<RenderItem> => {
    const v = it.variants
    const options = v?.kind === 'options' && v.show === true ? v.members.map((m) => m.variant).join(' · ') : null
    return {
      name: it.name, price: it.price, oldPrice: it.old_price, style: it.style,
      note: [it.note, options].filter(Boolean).join(' · ') || null,
      img: it.photo_id ? await getImg(`/api/produtos/imagem/${it.photo_id}`) : null,
      sizes: v?.kind === 'sizes' && v.show !== false ? v.rows.map((r) => ({ label: r.label, units: r.units })) : undefined,
    }
  }, [getImg])

  // desenha uma peça (qualquer formato/página) num canvas e devolve a posição de cada produto
  const renderTo = useCallback(async (canvas: HTMLCanvasElement, fmt: PromoFormat, idx: number, withLayers = false): Promise<Geo | null> => {
    if (!theme || !cfg) return null
    await loadPromoFonts()
    const find = (role: string) => theme.assets.find((a) => a.role === role && a.format === fmt)
    const url = (role: string, a: ThemeAsset | undefined) => (a ? `/api/promocoes/tema/${theme.id}/${role}/${a.format}?v=${a.width}x${a.height}` : '')
    const shared = (role: string) => { const a = find(role) ?? theme.assets.find((x) => x.role === role); return url(role, a) }
    const assets: RenderAssets = {
      background: await getImg(url('background', find('background'))), header: await getImg(url('header', find('header'))), footer: await getImg(url('footer', find('footer'))),
      badge: await getImg(shared('badge')), tag: await getImg(shared('tag')),
    }
    // fundo escolhido para a promoção (galeria) vale no lugar do fundo do tema
    const choice = campaign.overrides.background
    let bg: RenderBackground | null = null
    if (choice?.kind === 'preset' || choice?.kind === 'color') bg = choice
    else if (choice?.kind === 'asset') { const img = await getImg(`/api/promocoes/asset/${choice.asset}`); if (img) bg = { kind: 'image', img } }
    else if (choice?.kind === 'theme') {
      const tb = campaign.themeBackgrounds.find((t) => t.id === choice.themeId)
      const tf = tb ? (tb.formats.includes(fmt) ? fmt : tb.formats[0]) : null
      const img = tf ? await getImg(`/api/promocoes/tema/${choice.themeId}/background/${tf}`) : null
      if (img) bg = { kind: 'image', img }
    }
    const g = cfg.grid[fmt]
    const ps = paginateSections(items, g.cols * g.rows, cfg.breakBySection[fmt])
    const pg = ps[Math.min(idx, Math.max(0, ps.length - 1))] ?? []
    const render = await Promise.all(pg.map(toRender))
    const ls = withLayers ? layersForPage(layersApi.latest.current[fmt], Math.min(idx, Math.max(0, ps.length - 1))) : []
    await loadFonts(ls.map((l) => l.font))
    const layerImages: Record<string, HTMLImageElement | null> = {}
    for (const l of ls) if (l.asset && !(l.asset in layerImages)) layerImages[l.asset] = await getImg(`/api/promocoes/asset/${l.asset}`)
    drawPage(canvas, { format: fmt, theme: cfg, title: campaign.title, validity: campaign.validity, extraText: campaign.overrides.extraText ?? null, assets, items: render, layers: ls, layerImages, bg })
    const gm = pageGeometry({ format: fmt, theme: cfg, assets, count: pg.length })
    return { W: gm.W, H: gm.H, cells: gm.cells, ids: pg.map((i) => i.id) }
  }, [theme, cfg, items, campaign.title, campaign.validity, campaign.overrides, campaign.themeBackgrounds, getImg, toRender, layersApi.latest])

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
        await renderTo(big, format, i, true)
        const small = document.createElement('canvas')
        const w = 150, h = Math.round((150 * big.height) / big.width)
        small.width = w; small.height = h
        small.getContext('2d')!.drawImage(big, 0, 0, w, h)
        out.push(small.toDataURL('image/jpeg', 0.7))
        if (!cancel) setThumbs([...out])
      }
    })()
    return () => { cancel = true }
  }, [renderTo, format, pages.length, theme, items.length, layersApi.committed])

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? (okText ? { kind: 'ok', text: okText } : null) : { kind: 'error', text: r.error ?? 'Não foi possível concluir.' })
      router.refresh()
    })

  // ---------- seleção e reordenação ----------
  const select = (id: string | null) => {
    setSelected(id)
    if (id) setSelIds([])
    if (id !== quickId) setQuickId(null)
    if (id) {
      const k = pages.findIndex((p) => p.some((i) => i.id === id))
      if (k >= 0) setPage(k)
    }
  }
  const selectLayers = (ids: string[]) => { setSelIds(ids); if (ids.length) { setSelected(null); setQuickId(null) } }
  const selectLayer = (id: string | null) => selectLayers(id ? expandSelection(layersApi.latest.current[format], [id]) : [])
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

  // ---------- edição fina do encarte selecionado ----------
  const setStyle = (patch: Partial<Record<keyof ItemStyle, ItemStyle[keyof ItemStyle] | undefined>>) => {
    if (!sel) return
    const next: Record<string, unknown> = { ...sel.style, ...patch }
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
    act(() => patchItemAction(campaign.id, sel.id, { style: next as ItemStyle }))
  }
  async function enviarFoto(file: File | undefined) {
    if (!file || !sel) return
    setUploading(true); setMsg(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/promocoes/item/${sel.id}/foto`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível enviar a foto.' }); return }
      setMsg({ kind: 'ok', text: 'Foto enviada: ela também ficou no banco de imagens, ligada ao produto.' })
      router.refresh()
    } finally { setUploading(false); if (fotoRef.current) fotoRef.current.value = '' }
  }

  // ---------- fundo da promoção ----------
  const chooseBg = (bg: BackgroundChoice | null) => {
    const next = { ...campaign.overrides }
    if (bg) next.background = bg; else delete next.background
    act(() => saveOverridesAction(campaign.id, next))
  }
  async function uploadBg(file: File) {
    setUploadingBg(true); setMsg(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/promocoes/camada-imagem/${campaign.id}`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ kind: 'error', text: j.error ?? 'Não foi possível enviar a imagem.' }); return }
      chooseBg({ kind: 'asset', asset: j.id })
    } finally { setUploadingBg(false) }
  }

  // ---------- biblioteca de imagens ----------
  const [libBusy, setLibBusy] = useState(false)
  async function fromLibrary(item: { id: string; name: string }, as: 'element' | 'bg') {
    setLibBusy(true); setMsg(null)
    try {
      const r = await useLibraryImageAction(campaign.id, item.id)
      if (!r.ok || !r.id) { setMsg({ kind: 'error', text: r.error ?? 'Não foi possível usar a imagem.' }); return }
      if (as === 'bg') { chooseBg({ kind: 'asset', asset: r.id }); return }
      const id = addImageLayer(layersApi, format, pageIdx, { asset: r.id, width: r.width ?? 400, height: r.height ?? 400 })
      if (!id) { setMsg({ kind: 'error', text: 'Cada formato aceita até 40 elementos livres.' }); return }
      selectLayer(id); setTab('camadas'); router.refresh()
    } finally { setLibBusy(false) }
  }

  // ---------- downloads ----------
  const pageBlob = async (fmt: PromoFormat, idx: number) => { layersApi.flush(); const c = document.createElement('canvas'); await renderTo(c, fmt, idx, true); return canvasToBlob(c) }
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
  const base = slug(campaign.name)
  const pagesOf = (fmt: PromoFormat) => { const g = cfg!.grid[fmt]; return paginateSections(items, g.cols * g.rows, cfg!.breakBySection[fmt]) }
  const fileName = (fmt: PromoFormat, i: number) => { const sec = pagesOf(fmt)[i]?.[0]?.section; return `${base}-${fmt}-${i + 1}${sec ? `-${slug(sec)}` : ''}.png` }

  async function downloadPage() { setMsg(null); save(await pageBlob(format, pageIdx), fileName(format, pageIdx)) }
  async function downloadZip(formats: PromoFormat[]) {
    setMsg({ kind: 'ok', text: 'Gerando as peças…' })
    const files: Record<string, Uint8Array> = {}
    const arquivos: { arquivo: string; formato: string; peca: number; secao: string | null; largura: number; altura: number; bytes: number; sha256: string }[] = []
    for (const f of formats) for (let i = 0; i < pagesOf(f).length; i++) {
      const bytes = new Uint8Array(await (await pageBlob(f, i)).arrayBuffer())
      const nome = `${f}/${fileName(f, i)}`
      files[nome] = bytes
      arquivos.push({ arquivo: nome, formato: f, peca: i + 1, secao: pagesOf(f)[i]?.[0]?.section ?? null, largura: PROMO_FORMATS[f].w, altura: PROMO_FORMATS[f].h, bytes: bytes.length, sha256: await sha256Hex(bytes) })
    }
    // manifesto: de onde veio cada arquivo (promoção, versão, aprovação e produtos), para rastrear depois
    files['manifesto.json'] = new TextEncoder().encode(JSON.stringify({
      promocao: { id: campaign.id, nome: campaign.name, titulo: campaign.title, validade: campaign.validity, status: campaign.status, aprovada_por: campaign.approved_by_name, aprovada_em: campaign.approved_at, revisao_elementos: layersApi.latest.current ? campaign.layers_rev : null },
      gerado_em: new Date().toISOString(),
      arquivos,
      encartes: items.map((i) => ({ ean: i.ean, nome: i.name, preco: i.price })),
    }, null, 2))
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

  // ---------- dados e textos da promoção ----------
  const [conf, setConf] = useState({ name: campaign.name, title: campaign.title ?? '', validity: campaign.validity ?? '', themeId: campaign.theme_id ?? '' })
  const [ov, setOv] = useState<PromoOverrides>(campaign.overrides)
  useEffect(() => setOv(campaign.overrides), [campaign.overrides])
  const [addPrice, setAddPrice] = useState('')
  const [picked, setPicked] = useState<{ id: string; description: string } | null>(null)
  const sections = [...new Set(items.map((i) => i.section).filter((x): x is string => !!x))]
  const dis = !canEdit || busy
  const tagNow = sel ? (sel.style.tag !== undefined ? sel.style.tag : '__tema') : '__tema'
  const editorHref = `/editor/${campaign.id}`

  // Ctrl/Cmd + rolagem dá zoom (25% a 400%); Espaço + arrastar move a área de trabalho
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => Math.max(0.25, Math.min(4, +(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)).toFixed(2))))
    }
    st.addEventListener('wheel', wheel, { passive: false })
    return () => st.removeEventListener('wheel', wheel)
  }, [theme])
  useEffect(() => {
    const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')
    // Espaço em botão focado pelo teclado continua ativando o botão; depois de um clique do mouse, vira "segurar para arrastar"
    const keyboardOnControl = (t: EventTarget | null) => { const el = (t as HTMLElement | null)?.closest('button, a, summary, [role="tab"]'); return !!el && el.matches(':focus-visible') }
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e.target) && !keyboardOnControl(e.target)) { e.preventDefault(); if (!spaceRef.current) { spaceRef.current = true; setPanning(true) } } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space' && spaceRef.current) { e.preventDefault(); spaceRef.current = false; setPanning(false); panRef.current = null } }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])
  const panDown = (e: React.PointerEvent) => {
    if (!spaceRef.current || !stageRef.current) return
    e.preventDefault(); e.stopPropagation()
    panRef.current = { x: e.clientX, y: e.clientY, sl: stageRef.current.scrollLeft, st: stageRef.current.scrollTop }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const panMove = (e: React.PointerEvent) => {
    const p = panRef.current, st = stageRef.current
    if (!p || !st) return
    st.scrollLeft = p.sl - (e.clientX - p.x); st.scrollTop = p.st - (e.clientY - p.y)
  }

  return (
    <div className={`canva${mode === 'tab' ? ' canva-tab' : ''}`}>
      {msg && <p className={`canva-msg ${msg.kind === 'ok' ? 'form-ok' : 'form-error'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      {semFoto > 0 && <div className="notice" role="status">{semFoto} encarte(s) estão <strong>sem foto</strong> no banco de imagens e saem com a caixa &quot;SEM FOTO&quot;: selecione o encarte e use &quot;Enviar foto&quot;.</div>}

      {/* aprovação e resumo da importação */}
      <div className={`canva-approval ${campaign.status === 'aprovada' ? 'ok' : ''}`} role="status">
        <span className="badge" style={campaign.status === 'aprovada' ? { background: '#e1f5ec', color: '#1a7f4b' } : undefined}>{campaign.status === 'aprovada' ? 'Aprovada' : 'Em edição'}</span>
        <span>
          {campaign.status === 'aprovada'
            ? `Aprovada por ${campaign.approved_by_name ?? '—'}${campaign.approved_at ? ` em ${new Date(campaign.approved_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}. Qualquer alteração volta para edição.`
            : 'Confira os encartes, ajuste o que precisar e aprove. Qualquer alteração depois de aprovar exige aprovar de novo.'}
        </span>
        {canEdit && campaign.status !== 'aprovada' && <button type="button" className="primary" style={{ width: 'auto', margin: 0, minHeight: 34 }} disabled={busy || !items.length || checkSum.bloqueio > 0} title={checkSum.bloqueio ? 'Corrija os pontos marcados em "Verificar arte" antes de aprovar' : undefined} onClick={() => act(() => approveCampaignAction(campaign.id), 'Encartes aprovados.')}>Aprovar encartes</button>}
        {mode === 'embedded' && <a className="btn" href={editorHref} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto' }}><ExternalLink size={14} /> Abrir console em outra aba</a>}
        {mode === 'tab' && <Link className="btn" href={`/promocoes/${campaign.id}`} style={{ marginLeft: 'auto' }}>Abrir dentro do sistema</Link>}
      </div>
      {campaign.import_report && (
        <details className="canva-report" open={campaign.status !== 'aprovada' && (campaign.import_report.withoutPhoto.length > 0 || campaign.import_report.rowErrors.length > 0)}>
          <summary>
            Resumo da importação: {campaign.import_report.lines} produto(s) da planilha → <strong>{campaign.import_report.encartes} encarte(s)</strong>
            {campaign.import_report.grouped ? ` · ${campaign.import_report.gruposTamanho} grupo(s) de tamanho · ${campaign.import_report.gruposOpcoes} grupo(s) de fragrâncias/sabores` : ' · sem agrupar variações'}
            {campaign.import_report.withoutPhoto.length > 0 ? ` · ${campaign.import_report.withoutPhoto.length} sem foto` : ''}
            {campaign.import_report.notInCatalog.length > 0 ? ` · ${campaign.import_report.notInCatalog.length} fora do catálogo` : ''}
            {campaign.import_report.rowErrors.length > 0 ? ` · ${campaign.import_report.rowErrors.length} aviso(s) da planilha` : ''}
          </summary>
          {campaign.import_report.sheets.length > 1 && <p className="muted">Abas lidas: {campaign.import_report.sheets.map((x) => `${x.name} (${x.items})`).join(' · ')}</p>}
          {campaign.import_report.withoutPhoto.length > 0 && <p className="muted"><strong>Sem foto no banco de imagens:</strong> {campaign.import_report.withoutPhoto.slice(0, 12).map((x) => x.name).join(' · ')}{campaign.import_report.withoutPhoto.length > 12 ? '…' : ''}</p>}
          {campaign.import_report.notInCatalog.length > 0 && <p className="muted"><strong>Fora do catálogo de produtos:</strong> {campaign.import_report.notInCatalog.slice(0, 8).map((x) => x.ean).join(', ')}{campaign.import_report.notInCatalog.length > 8 ? '…' : ''}</p>}
          {campaign.import_report.skipped.length > 0 && <p className="muted"><strong>Não entraram:</strong> {campaign.import_report.skipped.slice(0, 8).map((x) => `${x.ean} (${x.reason})`).join(' · ')}</p>}
          {campaign.import_report.rowErrors.length > 0 && <ul className="files">{campaign.import_report.rowErrors.slice(0, 10).map((e, i) => <li key={i}><strong>{e.line ? `linha ${e.line}` : 'planilha'}</strong><span className="muted">{e.message}</span></li>)}</ul>}
        </details>
      )}

      {checkOpen && <CheckPanel issues={issues} onGoto={gotoIssue} onClose={() => setCheckOpen(false)} />}
      {layersApi.state === 'conflict' && (
        <div className="notice canva-conflict" role="alert">
          <strong>Edição simultânea.</strong> Os elementos desta promoção foram alterados em outra aba ou por outra pessoa; suas mudanças ainda não foram salvas.
          <button type="button" className="mini-btn" onClick={() => layersApi.resolveConflict('theirs')}>Recarregar a versão salva (descarta as minhas)</button>
          <button type="button" className="mini-btn primary" onClick={() => layersApi.resolveConflict('mine')}>Manter as minhas (substitui a outra)</button>
        </div>
      )}

      {/* barra superior */}
      <div className="canva-top">
        <div className="tabs">
          {PROMO_FORMAT_KEYS.map((f) => <button key={f} type="button" className={`tab${format === f ? ' active' : ''}`} onClick={() => { setFormat(f); setPage(0) }}>{PROMO_FORMATS[f].label}</button>)}
        </div>
        <div className="canva-actions">
          <button type="button" className={`secondary canva-check-btn${checkSum.bloqueio ? ' bad' : checkSum.revisao ? ' warn' : ''}`} onClick={() => setCheckOpen((v) => !v)} aria-expanded={checkOpen} disabled={!theme}>Verificar arte{issues.length ? ` (${issues.length})` : ' ✓'}</button>
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
            <button type="button" role="tab" aria-selected={tab === 'camadas'} className={tab === 'camadas' ? 'on' : ''} onClick={() => setTab('camadas')}><Shapes size={14} /> Camadas{curLayers.length ? ` (${curLayers.length})` : ''}</button>
            <button type="button" role="tab" aria-selected={tab === 'biblioteca'} className={tab === 'biblioteca' ? 'on' : ''} onClick={() => setTab('biblioteca')}><Images size={14} /> Biblioteca</button>
            <button type="button" role="tab" aria-selected={tab === 'fundo'} className={tab === 'fundo' ? 'on' : ''} onClick={() => setTab('fundo')}><ImageIcon size={14} /> Fundo</button>
            <button type="button" role="tab" aria-selected={tab === 'tema'} className={tab === 'tema' ? 'on' : ''} onClick={() => setTab('tema')}><Palette size={14} /> Tema</button>
            <button type="button" role="tab" aria-selected={tab === 'dados'} className={tab === 'dados' ? 'on' : ''} onClick={() => setTab('dados')}><Settings2 size={14} /> Textos</button>
          </div>

          {tab === 'produtos' && (
            <section aria-label="Produtos da promoção">
              <p className="muted">{items.length} encarte(s){sections.length > 1 ? ` · ${sections.length} abas` : ''}. Arraste para mudar a ordem; clique para editar.</p>
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
                    <span className="canva-name">{it.name}{it.variants ? <em className="canva-group">{it.variants.kind === 'sizes' ? `${it.variants.rows.length} tamanhos` : `${it.variants.members.length} opções`}</em> : null}</span>
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

          {tab === 'camadas' && <LayersPanel api={layersApi} format={format} page={pageIdx} selectedIds={selIds} onSelect={selectLayers} canEdit={canEdit} />}

          {tab === 'biblioteca' && <LibraryPicker items={campaign.library} canEdit={canEdit} busy={libBusy || busy} onAdd={(i) => void fromLibrary(i, 'element')} onBackground={(i) => void fromLibrary(i, 'bg')} />}

          {tab === 'fundo' && <BackgroundGallery campaign={campaign} format={format} canEdit={canEdit} busy={busy} uploading={uploadingBg} onChoose={chooseBg} onUpload={(f) => void uploadBg(f)} onDeleteAsset={(id) => act(() => deleteAssetAction(campaign.id, id))} />}

          {tab === 'tema' && (
            <section aria-label="Temas">
              <p className="muted">Escolha o tema da peça. O sistema troca a arte na hora; produtos, nomes e preços continuam.</p>
              <ul className="canva-themes">
                {themes.map((t) => (
                  <li key={t.id}>
                    <button type="button" className={campaign.theme_id === t.id ? 'on' : ''} disabled={dis} onClick={() => act(() => updateCampaignAction(campaign.id, { name: campaign.name, title: campaign.title ?? '', validity: campaign.validity ?? '', themeId: t.id }))}>
                      {t.name}{campaign.theme_id === t.id ? ' ✓' : ''}
                    </button>
                  </li>
                ))}
              </ul>
              <Link href="/promocoes/temas" className="btn">Gerenciar temas e artes</Link>
            </section>
          )}

          {tab === 'dados' && canEdit && (
            <section aria-label="Textos da promoção" className="stack-form">
              <label htmlFor="pc-name">Nome interno</label><input id="pc-name" type="text" value={conf.name} onChange={(e) => setConf({ ...conf, name: e.target.value })} maxLength={120} />
              <label htmlFor="pc-title">Título na peça (se o tema não traz na arte)</label><input id="pc-title" type="text" value={conf.title} onChange={(e) => setConf({ ...conf, title: e.target.value })} maxLength={60} />
              <label htmlFor="pc-val">Validade (texto)</label><input id="pc-val" type="text" value={conf.validity} onChange={(e) => setConf({ ...conf, validity: e.target.value })} maxLength={80} />
              <div className="form-actions">
                <button type="button" className="primary" style={{ width: 'auto' }} disabled={busy} onClick={() => act(() => updateCampaignAction(campaign.id, { ...conf, themeId: campaign.theme_id ?? '' }), 'Salvo.')}>Salvar</button>
              </div>
              <h4 style={{ margin: '14px 0 4px' }}><Type size={14} style={{ verticalAlign: -2 }} /> Textos desta promoção</h4>
              <p className="muted">Valem no lugar dos do tema, só para esta promoção.</p>
              <label htmlFor="ov-tag">Etiqueta do preço (padrão)</label>
              <input id="ov-tag" type="text" maxLength={24} value={ov.tagText ?? ''} placeholder={baseCfg?.tagText ?? ''} onChange={(e) => setOv({ ...ov, tagText: e.target.value })} />
              <label><input type="checkbox" checked={ov.showTag ?? baseCfg?.showTag ?? true} onChange={(e) => setOv({ ...ov, showTag: e.target.checked })} /> Mostrar etiqueta nos encartes</label>
              <label htmlFor="ov-extra">Texto livre (endereço, telefone) acima do rodapé</label>
              <input id="ov-extra" type="text" maxLength={140} value={ov.extraText ?? ''} placeholder="Ex.: Rua das Flores, 123 - Centro · (27) 99999-0000" onChange={(e) => setOv({ ...ov, extraText: e.target.value })} />
              <label htmlFor="ov-foot">Rodapé (uma linha por linha; só se o tema não traz o rodapé na arte)</label>
              <textarea id="ov-foot" rows={3} value={(ov.footerLines ?? []).join('\n')} onChange={(e) => setOv({ ...ov, footerLines: e.target.value.split('\n').slice(0, 3) })} style={{ width: '100%' }} />
              <div className="form-actions">
                <button type="button" className="primary" style={{ width: 'auto' }} disabled={busy} onClick={() => act(() => saveOverridesAction(campaign.id, ov), 'Textos salvos.')}>Salvar textos</button>
                <button type="button" className="danger" disabled={busy} onClick={() => { if (confirm('Excluir esta promoção?')) start(async () => { await deleteCampaignAction(campaign.id); router.push('/promocoes') }) }}>Excluir promoção</button>
              </div>
            </section>
          )}
        </aside>

        {/* peça */}
        <main ref={stageRef} className={`canva-stage${panning ? ' panning' : ''}`} aria-label="Prévia" onPointerDownCapture={panDown} onPointerMove={panMove} onPointerUp={() => { panRef.current = null }}>
          <AddBar api={layersApi} campaignId={campaign.id} format={format} page={pageIdx} canEdit={canEdit} onAdded={(id) => { selectLayer(id); setTab('camadas') }} onMsg={setMsg} zoom={zoom} setZoom={setZoom} rulers={guidesApi.shown} onToggleRulers={guidesApi.toggle} guideCount={guidesApi.guides[format].length} onClearGuides={() => guidesApi.clear(format)} />
          {!theme ? <p className="empty">Escolha um tema na aba &quot;Tema&quot; para ver a peça.</p> : (
            <div className={`canva-frame${guidesApi.shown ? ' rulers' : ''}`}>
            <div ref={paperRef} className="canva-paper" style={{ aspectRatio: `${PROMO_FORMATS[format].w} / ${PROMO_FORMATS[format].h}`, ['--ar' as string]: PROMO_FORMATS[format].w / PROMO_FORMATS[format].h, ['--zoom' as string]: zoom }}>
              <canvas ref={canvasRef} aria-label={`Prévia ${PROMO_FORMATS[format].label}`} data-ready={rendering ? '0' : '1'} />
              <LayersCanvas format={format} list={pageLayers} hideId={editingLayer} getImg={getImg} />
              {geo && (
                <div className="canva-overlay">
                  {geo.cells.map((c, i) => {
                    const id = geo.ids[i]
                    return (
                      <div key={id} className={`canva-hit${selected === id ? ' sel' : ''}${overId === id ? ' over' : ''}`} data-item={id} title="Clique para editar; arraste sobre outro para trocar de lugar" draggable={canEdit}
                        style={{ left: `${(c.x / geo.W) * 100}%`, top: `${(c.y / geo.H) * 100}%`, width: `${(c.w / geo.W) * 100}%`, height: `${(c.h / geo.H) * 100}%` }}
                        onClick={() => select(id)} onDoubleClick={() => { if (canEdit) { select(id); setQuickId(id) } }}
                        onDragStart={(e) => { setDragId(id); e.dataTransfer.setData('text/plain', id) }} onDragEnd={() => { setDragId(null); setOverId(null) }}
                        onDragOver={(e) => { if (dragId && dragId !== id) { e.preventDefault(); setOverId(id) } }} onDragLeave={() => setOverId((o) => (o === id ? null : o))}
                        onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, id); setDragId(null); setOverId(null) }} />
                    )
                  })}
                </div>
              )}
              {quickId && geo && (() => {
                const k = geo.ids.indexOf(quickId), it = items.find((x) => x.id === quickId)
                if (k < 0 || !it) return null
                const c = geo.cells[k]
                return <QuickEdit key={it.id} initial={{ name: it.name, note: it.note ?? '', price: brl(it.price) }} left={(c.x / geo.W) * 100} top={((c.y + c.h * 0.5) / geo.H) * 100} disabled={busy}
                  onClose={() => setQuickId(null)}
                  onSave={(v) => { setQuickId(null); act(async () => { const r = await updateItemAction(campaign.id, it.id, v.name, v.price, it.photo_image_id); if (!r.ok) return r; return v.note !== (it.note ?? '') ? patchItemAction(campaign.id, it.id, { note: v.note }) : r }) }} />
              })()}
              {guidesApi.shown && <RulersAndGuides format={format} paperRef={paperRef} api={guidesApi} canEdit={canEdit} />}
              <LayerBoxes userGuides={guidesApi.shown ? guidesApi.guides[format] : []} format={format} list={pageLayers} selectedIds={selIds} onSelect={selectLayers} editingId={editingLayer} setEditingId={setEditingLayer} api={layersApi} paperRef={paperRef} canEdit={canEdit} />
            </div>
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
          {selIds.length > 1 ? (
            <MultiInspector api={layersApi} format={format} ids={selIds} canEdit={canEdit} onSelect={selectLayers} onClose={() => selectLayers([])} />
          ) : selL ? (
            <LayerInspector api={layersApi} format={format} layer={selL} page={pageIdx} pageCount={Math.max(1, pages.length)} canEdit={canEdit} onClose={() => selectLayer(null)} onMsg={setMsg}
              onDuplicate={() => { const c = duplicateSelection(layersApi, format, [selL.id]); if (c.length) selectLayers(c) }}
              onDelete={() => { layersApi.remove(format, selL.id); selectLayer(null) }} />
          ) : sel ? (
            <section>
              <h3>Encarte selecionado</h3>
              <p className="muted">{sel.ean ?? 'sem código de barras'}{sel.section ? ` · aba ${sel.section}` : ''}</p>

              <details open>
                <summary>Texto e preço</summary>
                <label htmlFor="in-name">Nome na peça</label>
                <textarea id="in-name" key={`n-${sel.id}-${sel.name}`} rows={3} defaultValue={sel.name} disabled={dis} maxLength={160}
                  onBlur={(e) => { if (e.target.value !== sel.name) act(() => updateItemAction(campaign.id, sel.id, e.target.value, String(sel.price), sel.photo_image_id)) }} />
                <label htmlFor="in-note">Subtítulo / descrição</label>
                <input id="in-note" key={`s-${sel.id}-${sel.note ?? ''}`} type="text" maxLength={100} defaultValue={sel.note ?? ''} placeholder="Ex.: 50ml · Leve 3 pague 2" disabled={dis}
                  onBlur={(e) => { if (e.target.value !== (sel.note ?? '')) act(() => patchItemAction(campaign.id, sel.id, { note: e.target.value })) }} />
                <div className="grid-2">
                  <div>
                    <label htmlFor="in-price">Preço (R$)</label>
                    <input id="in-price" key={`p-${sel.id}-${sel.price}`} type="text" inputMode="decimal" defaultValue={brl(sel.price)} disabled={dis}
                      onBlur={(e) => { if (e.target.value.replace(',', '.') !== String(sel.price)) act(() => updateItemAction(campaign.id, sel.id, sel.name, e.target.value, sel.photo_image_id)) }} />
                  </div>
                  <div>
                    <label htmlFor="in-old">Preço original (De R$)</label>
                    <input id="in-old" key={`o-${sel.id}-${sel.old_price ?? ''}`} type="text" inputMode="decimal" defaultValue={sel.old_price != null ? brl(sel.old_price) : ''} placeholder="vazio = não exibir" disabled={dis}
                      onBlur={(e) => { if (e.target.value.replace(',', '.') !== (sel.old_price != null ? String(sel.old_price) : '')) act(() => patchItemAction(campaign.id, sel.id, { oldPrice: e.target.value })) }} />
                  </div>
                </div>
              </details>

              <details open>
                <summary>Etiqueta do preço</summary>
                <div className="canva-chips" role="group" aria-label="Estilo da etiqueta">
                  <button type="button" className={tagNow === '__tema' ? 'on' : ''} disabled={dis} onClick={() => setStyle({ tag: undefined })}>Do tema</button>
                  <button type="button" className={tagNow === '' ? 'on' : ''} disabled={dis} onClick={() => setStyle({ tag: '' })}>Sem etiqueta</button>
                  {TAG_PRESETS.map((t) => <button key={t} type="button" className={tagNow === t ? 'on' : ''} disabled={dis} onClick={() => setStyle({ tag: t })}>{t}</button>)}
                </div>
                <label htmlFor="in-tag">Texto da etiqueta</label>
                <input id="in-tag" key={`t-${sel.id}-${sel.style.tag ?? ''}`} type="text" maxLength={24} defaultValue={sel.style.tag ?? ''} placeholder="escreva a sua" disabled={dis}
                  onBlur={(e) => { if (e.target.value && e.target.value !== (sel.style.tag ?? '')) setStyle({ tag: e.target.value }) }} />
              </details>

              <details>
                <summary>Cores e estilo do nome</summary>
                <div className="color-grid">
                  <ColorField label="Etiqueta" value={sel.style.tagColor} fallback={cfg?.colors.tag ?? '#e3171d'} disabled={dis} onCommit={(v) => setStyle({ tagColor: v })} />
                  <ColorField label="Selo do preço" value={sel.style.badgeColor} fallback={cfg?.colors.badge ?? '#1747b8'} disabled={dis} onCommit={(v) => setStyle({ badgeColor: v })} />
                  <ColorField label="Número do preço" value={sel.style.priceColor} fallback={cfg?.colors.badgeText ?? '#ffffff'} disabled={dis} onCommit={(v) => setStyle({ priceColor: v })} />
                  <ColorField label="Nome" value={sel.style.nameColor} fallback={cfg?.colors.name ?? '#111111'} disabled={dis} onCommit={(v) => setStyle({ nameColor: v })} />
                </div>
                <label>Alinhamento do nome</label>
                <div className="canva-chips" role="group" aria-label="Alinhamento do nome">
                  {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                    <button key={a} type="button" className={(sel.style.nameAlign ?? 'right') === a ? 'on' : ''} disabled={dis} aria-label={`Alinhar ${a}`} onClick={() => setStyle({ nameAlign: a })}><Icon size={14} /></button>
                  ))}
                </div>
                <label htmlFor="in-scale">Tamanho do nome: {sel.style.nameScale ?? 100}%</label>
                <input id="in-scale" type="range" min={50} max={200} step={5} value={sel.style.nameScale ?? 100} disabled={dis} onChange={(e) => setItems(items.map((x) => (x.id === sel.id ? { ...x, style: { ...x.style, nameScale: Number(e.target.value) } } : x)))} onMouseUp={(e) => setStyle({ nameScale: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => setStyle({ nameScale: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => setStyle({ nameScale: Number((e.target as HTMLInputElement).value) })} />
              </details>

              <details open={!sel.photo_id}>
                <summary>Foto</summary>
                {sel.photo_id
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/produtos/imagem/${sel.photo_id}?mini=1`} alt="" className="canva-photo" />
                  : <p className="empty">Sem foto no banco de imagens para este código de barras.</p>}
                {canEdit && (
                  <div className="form-actions">
                    <button type="button" className="secondary" disabled={uploading || busy} onClick={() => fotoRef.current?.click()}><ImagePlus size={14} /> {uploading ? 'Enviando…' : sel.photo_id ? 'Trocar por uma foto minha' : 'Enviar foto'}</button>
                    <input ref={fotoRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Enviar foto do produto" onChange={(e) => void enviarFoto(e.target.files?.[0])} />
                  </div>
                )}
                {sel.photos.length > 1 && canEdit && (
                  <>
                    <label>Outras fotos deste produto</label>
                    <span className="promo-photos big">
                      {sel.photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p} src={`/api/produtos/imagem/${p}?mini=1`} alt="" width={52} height={52} className={p === sel.photo_id ? 'sel' : ''} onClick={() => act(() => updateItemAction(campaign.id, sel.id, sel.name, String(sel.price), p))} />
                      ))}
                    </span>
                  </>
                )}
                {canEdit && (
                  <>
                    <label>Usar a foto de outro produto do catálogo</label>
                    <ProductPicker label="Buscar produto para usar a foto" placeholder="Buscar produto…" onPick={(p) => act(() => setItemProductAction(campaign.id, sel.id, p.id), 'Foto trocada pela do produto escolhido.')} />
                  </>
                )}
              </details>

              {sel.variants && (
                <details open>
                  <summary>{sel.variants.kind === 'sizes' ? 'Tamanhos' : 'Fragrâncias / opções'}</summary>
                  {sel.variants.kind === 'sizes' && (
                    <>
                      <label><input type="checkbox" checked={sel.variants.show !== false} disabled={dis} onChange={(e) => { setItems(items.map((x) => (x.id === sel.id && x.variants ? { ...x, variants: { ...x.variants, show: e.target.checked } } : x))); act(() => patchItemAction(campaign.id, sel.id, { showVariants: e.target.checked })) }} /> Mostrar a tabela de tamanhos no encarte</label>
                      <label>Tabela de tamanhos (unidades por tamanho)</label>
                      <div className="canva-sizes">
                        {sizesDraft.map((r, i) => (
                          <div key={i}>
                            <input type="text" value={r.label} maxLength={6} aria-label={`Tamanho ${i + 1}`} disabled={dis} onChange={(e) => setSizesDraft(sizesDraft.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} onBlur={() => act(() => updateItemAction(campaign.id, sel.id, sel.name, String(sel.price), sel.photo_image_id, sizesDraft))} />
                            <input type="text" inputMode="numeric" value={r.units ?? ''} placeholder="un." aria-label={`Unidades do tamanho ${i + 1}`} disabled={dis} onChange={(e) => setSizesDraft(sizesDraft.map((x, k) => (k === i ? { ...x, units: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) } : x)))} onBlur={() => act(() => updateItemAction(campaign.id, sel.id, sel.name, String(sel.price), sel.photo_image_id, sizesDraft))} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {sel.variants.kind === 'options' && (
                    <label><input type="checkbox" checked={sel.variants.show === true} disabled={dis} onChange={(e) => { setItems(items.map((x) => (x.id === sel.id && x.variants ? { ...x, variants: { ...x.variants, show: e.target.checked } } : x))); act(() => patchItemAction(campaign.id, sel.id, { showVariants: e.target.checked })) }} /> Listar as fragrâncias/sabores no encarte</label>
                  )}
                  <p className="muted" style={{ marginTop: 8 }}><strong>Este encarte reúne {sel.variants.kind === 'sizes' ? sel.variants.rows.length : sel.variants.members.length} produtos:</strong> {sel.variants.kind === 'sizes' ? sel.variants.rows.map((r) => r.name).join(' · ') : sel.variants.members.map((m) => m.variant).join(' · ')}</p>
                  {canEdit && <button type="button" className="mini-btn" disabled={busy} onClick={() => { setSelected(null); act(() => ungroupItemAction(campaign.id, sel.id)) }}>Desagrupar (um encarte por produto)</button>}
                </details>
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
              <p className="muted">Clique em um encarte na peça (ou na lista) para editar nome, subtítulo, preço, etiqueta, cores, foto e variações. Arraste um encarte sobre outro para trocá-los de lugar. Com a barra acima da peça você adiciona texto, imagens e formas livres.</p>
              <ul className="files">
                <li><span>Peças neste formato</span><strong>{pages.length}</strong></li>
                <li><span>Encartes nesta peça</span><strong>{pages[pageIdx]?.length ?? 0}</strong></li>
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
