// Desenho da peça de promoção em canvas (navegador): feed, story e A4. Mesmo código para a prévia e para baixar.
import { PROMO_FORMATS, pageLayout, placeCells, priceParts, type ItemStyle, type PromoFormat, type Rect, type ThemeConfig } from '../domain/promo.ts'
import type { Layer } from '../domain/promo-layers.ts'

export type RenderAssets = { background?: HTMLImageElement | null; header?: HTMLImageElement | null; footer?: HTMLImageElement | null; badge?: HTMLImageElement | null; tag?: HTMLImageElement | null }
export type RenderItem = { name: string; price: number; img: HTMLImageElement | null; /** tabela de tamanhos (fraldas): um quadro por tamanho com as unidades */ sizes?: { label: string; units: number | null }[]; /** preço original ("De R$"), riscado no selo */ oldPrice?: number | null; /** subtítulo abaixo do nome */ note?: string | null; style?: ItemStyle }
export type RenderOpts = {
  format: PromoFormat; theme: ThemeConfig; title: string | null; validity: string | null; /** texto livre (endereço, telefone) logo acima do rodapé */ extraText?: string | null; assets: RenderAssets; items: RenderItem[]
  /** elementos livres desta peça (já filtrados pela página), do fundo para o topo; imagens em `layerImages` pelo id do arquivo */ layers?: Layer[]; layerImages?: Record<string, HTMLImageElement | null>
}

const DISPLAY = '"PromoDisplay", "Baloo 2", system-ui, sans-serif'
const TEXT = '"PromoText", Montserrat, system-ui, sans-serif'

let fontsReady: Promise<void> | null = null
/** Carrega as fontes da peça (Baloo 2 para preços e títulos, Montserrat para nomes). */
export function loadPromoFonts(): Promise<void> {
  fontsReady ??= (async () => {
    try {
      const a = new FontFace('PromoDisplay', 'url(/fonts/Baloo2.ttf)', { weight: '400 800' })
      const b = new FontFace('PromoText', 'url(/fonts/Montserrat.ttf)', { weight: '100 900' })
      await Promise.all([a.load(), b.load()])
      document.fonts.add(a); document.fonts.add(b)
    } catch { /* sem a fonte, usa a do sistema */ }
  })()
  return fontsReady
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

const HEADER_DEFAULT: Record<PromoFormat, number> = { story: 380, feed: 300, a4: 420 }
const FOOTER_DEFAULT = 110

/** Medidas da peça: cabeçalho, rodapé, painel e a posição de cada produto. O editor usa a mesma função para saber onde o clique caiu. */
export function pageGeometry(o: Pick<RenderOpts, 'format' | 'theme' | 'assets'> & { count: number }): { W: number; H: number; headerH: number; footerH: number; panel: Rect | null; cells: Rect[]; cardColor: string | null } {
  const { w: W, h: H } = PROMO_FORMATS[o.format]
  const headerH = o.assets.header ? Math.round((o.assets.header.height * W) / o.assets.header.width) : HEADER_DEFAULT[o.format]
  const footerH = o.assets.footer ? Math.round((o.assets.footer.height * W) / o.assets.footer.width) : o.theme.footerLines.length ? FOOTER_DEFAULT + (o.theme.footerLines.length - 1) * 40 : 0
  const grid = o.theme.grid[o.format]
  const cardColor = o.theme.cards[o.format]
  const layout = pageLayout(o.format, grid, o.theme.panel[o.format], headerH, footerH, {
    count: o.count, marginPct: o.theme.panelMargin[o.format], tuck: o.theme.panelTuck, area: o.theme.gridArea[o.format], gapPct: cardColor ? o.theme.cardGap : 0,
  })
  return { W, H, headerH, footerH, panel: layout.panel, cells: placeCells(layout.cells, o.count, grid.cols, layout.pitchX), cardColor }
}

export function drawPage(canvas: HTMLCanvasElement, o: RenderOpts): void {
  const geo = pageGeometry({ format: o.format, theme: o.theme, assets: o.assets, count: o.items.length })
  const { W, H, headerH, footerH, panel, cells, cardColor } = geo
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const c = o.theme.colors
  ctx.clearRect(0, 0, W, H)

  // fundo
  if (o.assets.background) drawCover(ctx, o.assets.background, 0, 0, W, H)
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, c.skyTop); g.addColorStop(1, c.skyBottom)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    if (o.theme.clouds) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      for (const [cx, cy, r] of [[0.1, 0.05, 0.2], [0.85, 0.03, 0.22], [0.5, 0.01, 0.18], [0.02, 0.5, 0.15], [0.98, 0.6, 0.16]] as const) { ctx.beginPath(); ctx.arc(W * cx, H * cy, W * r, 0, Math.PI * 2); ctx.fill() }
    }
  }

  // painel (antes do cabeçalho e do rodapé: com "painel por baixo do cabeçalho" a arte fica por cima dele)
  if (panel) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6
    ctx.fillStyle = c.panel; roundRect(ctx, panel.x, panel.y, panel.w, panel.h, panel.x > 0 ? Math.round(W * 0.045) : 0); ctx.fill(); ctx.restore()
  }

  // produtos (cartão opcional de cada um); o cabeçalho e o rodapé desenhados depois cobrem o que sobrepõem, como nas peças da rede
  const cols = o.theme.grid[o.format].cols
  o.items.forEach((it, i) => {
    if (cardColor) { ctx.fillStyle = cardColor; roundRect(ctx, cells[i].x, cells[i].y, cells[i].w, cells[i].h, Math.round(Math.min(cells[i].w, cells[i].h) * 0.07)); ctx.fill() }
    drawCell(ctx, cells[i], it, o.theme, cols, o.assets, { minY: o.assets.header ? headerH + 4 : 0, maxY: o.assets.footer ? H - footerH - 4 : H })
  })

  // cabeçalho
  if (o.assets.header) ctx.drawImage(o.assets.header, 0, 0, W, headerH)
  else {
    const title = (o.title || o.theme.title || '').toUpperCase()
    if (title) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      let size = headerH * 0.52
      ctx.font = `800 ${size}px ${DISPLAY}`
      while (ctx.measureText(title).width > W * 0.86 && size > 20) { size -= 4; ctx.font = `800 ${size}px ${DISPLAY}` }
      ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = c.badgeEdge; ctx.strokeText(title, W / 2, headerH * 0.46)
      ctx.fillStyle = c.title; ctx.fillText(title, W / 2, headerH * 0.46)
    }
    if (o.validity) {
      ctx.font = `800 ${headerH * 0.1}px ${TEXT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(o.validity.toUpperCase(), W / 2, headerH * 0.86)
    }
  }

  // rodapé
  if (o.assets.footer) ctx.drawImage(o.assets.footer, 0, H - footerH, W, footerH)
  else if (o.theme.footerLines.length) {
    ctx.fillStyle = c.footer; ctx.fillRect(0, H - footerH, W, footerH)
    ctx.fillStyle = c.footerText; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    o.theme.footerLines.forEach((line, i) => { ctx.font = `800 ${i === 0 ? 46 : 34}px ${DISPLAY}`; ctx.fillText(line, W / 2, H - footerH + (footerH / (o.theme.footerLines.length + 1)) * (i + 1)) })
  }
  if (o.extraText) {
    const fs = Math.round(W * 0.027)
    ctx.font = `800 ${fs}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    const y = H - footerH - Math.round(fs * 0.5)
    ctx.strokeText(o.extraText, W / 2, y); ctx.fillStyle = '#ffffff'; ctx.fillText(o.extraText, W / 2, y)
  }

  if (o.layers?.length) drawLayers(ctx, o.layers, o.layerImages ?? {})
}

// ---------- elementos livres (texto, imagem, formas) ----------
const LAYER_FONT: Record<NonNullable<Layer['font']>, string> = { display: DISPLAY, text: TEXT, serif: 'Georgia, "Times New Roman", serif', mono: '"Courier New", ui-monospace, monospace' }

/** Desenha os elementos livres por cima da peça, do primeiro (fundo) ao último (topo), com giro e transparência. */
export function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], images: Record<string, HTMLImageElement | null>): void {
  for (const l of layers) {
    if (l.hidden) continue
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, l.opacity))
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2)
    if (l.rot) ctx.rotate((l.rot * Math.PI) / 180)
    ctx.translate(-l.w / 2, -l.h / 2)
    if (l.type === 'shape') drawShape(ctx, l)
    else if (l.type === 'image') {
      const img = l.asset ? images[l.asset] : null
      if (img) { const s = Math.min(l.w / img.width, l.h / img.height); ctx.drawImage(img, (l.w - img.width * s) / 2, (l.h - img.height * s) / 2, img.width * s, img.height * s) }
      else { ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, l.w, l.h) }
    } else drawLayerText(ctx, l)
    ctx.restore()
  }
}

function drawShape(ctx: CanvasRenderingContext2D, l: Layer): void {
  const { w, h } = l
  ctx.beginPath()
  switch (l.shape) {
    case 'circle': ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break
    case 'round': { const r = Math.min(l.radius ?? 24, w / 2, h / 2); roundRect(ctx, 0, 0, w, h, r); break }
    case 'burst': {
      const spikes = 14
      for (let i = 0; i < spikes * 2; i++) {
        const a = (Math.PI * i) / spikes - Math.PI / 2, k = i % 2 === 0 ? 1 : 0.84
        const x = w / 2 + Math.cos(a) * (w / 2) * k, y = h / 2 + Math.sin(a) * (h / 2) * k
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath(); break
    }
    case 'line': { ctx.strokeStyle = l.fill ?? '#ffd21f'; ctx.lineWidth = Math.max(2, h); ctx.lineCap = 'round'; ctx.moveTo(h / 2, h / 2); ctx.lineTo(w - h / 2, h / 2); ctx.stroke(); return }
    default: ctx.rect(0, 0, w, h)
  }
  ctx.fillStyle = l.fill ?? '#ffd21f'; ctx.fill()
  if (l.border && l.borderW) { ctx.lineJoin = 'round'; ctx.lineWidth = l.borderW; ctx.strokeStyle = l.border; ctx.stroke() }
}

/** Aplica a fonte do texto e quebra em linhas que cabem na largura da caixa. */
function layoutLayerText(ctx: CanvasRenderingContext2D, l: Layer): { lines: string[]; size: number; pad: number; lh: number } {
  const size = l.size ?? 64
  const pad = l.bg ? size * 0.3 : 0
  ctx.font = `${l.italic ? 'italic ' : ''}${l.bold === false ? 500 : 800} ${size}px ${LAYER_FONT[l.font ?? 'text']}`
  const lines = (l.text ?? '').split('\n').flatMap((p) => wrap(ctx, p, Math.max(10, l.w - pad * 2)))
  return { lines, size, pad, lh: size * 1.15 }
}

let measureCtx: CanvasRenderingContext2D | null = null
/** Altura que o texto precisa na caixa do elemento: o editor ajusta a caixa ao texto, como no Canva. */
export function measureLayerHeight(l: Layer): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return l.h
  const m = layoutLayerText(measureCtx, l)
  return Math.max(16, Math.ceil(m.lines.length * m.lh + m.pad * 2))
}

function drawLayerText(ctx: CanvasRenderingContext2D, l: Layer): void {
  const { w, h } = l
  if (l.bg) { ctx.fillStyle = l.bg; roundRect(ctx, 0, 0, w, h, Math.min((l.size ?? 64) * 0.3, h / 2)); ctx.fill() }
  const { lines, pad, lh } = layoutLayerText(ctx, l)
  ctx.textBaseline = 'middle'; ctx.textAlign = l.align ?? 'center'
  const x = l.align === 'left' ? pad : l.align === 'right' ? w - pad : w / 2
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2
  ctx.lineJoin = 'round'
  lines.forEach((t, i) => {
    if (l.stroke && l.strokeW) { ctx.lineWidth = l.strokeW; ctx.strokeStyle = l.stroke; ctx.strokeText(t, x, y0 + i * lh) }
    ctx.fillStyle = l.color ?? '#111111'; ctx.fillText(t, x, y0 + i * lh)
  })
}

function drawCell(ctx: CanvasRenderingContext2D, cell: Rect, it: RenderItem, baseTheme: ThemeConfig, cols: number, assets: RenderAssets, safe: { minY: number; maxY: number }): void {
  const st = it.style ?? {}
  // estilo do próprio encarte (cores e etiqueta) vale no lugar do tema
  const theme: ThemeConfig = { ...baseTheme, colors: { ...baseTheme.colors, badge: st.badgeColor ?? baseTheme.colors.badge, badgeText: st.priceColor ?? baseTheme.colors.badgeText, tag: st.tagColor ?? baseTheme.colors.tag, name: st.nameColor ?? baseTheme.colors.name } }
  const c = theme.colors
  // se o cabeçalho ou o rodapé cobrem parte do cartão (a arte fica por cima), o conteúdo usa só a parte visível
  const top = Math.max(cell.y, safe.minY), bottom = Math.min(cell.y + cell.h, safe.maxY)
  const r: Rect = { x: cell.x, y: top, w: cell.w, h: Math.max(40, bottom - top) }
  const badgeR = Math.min(r.w * 0.24, r.h * 0.22)
  const bx = r.x + r.w - badgeR - r.w * 0.015, by = r.y + r.h - badgeR - r.h * 0.03
  const photo: Rect = { x: r.x + r.w * 0.05, y: r.y + r.h * 0.02, w: r.w * 0.9, h: r.h * 0.68 }

  // foto (em dobro, uma atrás da outra, como nas peças da rede)
  if (it.img) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5
    if (theme.stack) {
      const back: Rect = { x: photo.x - photo.w * 0.07, y: photo.y + photo.h * 0.03, w: photo.w * 0.9, h: photo.h * 0.94 }
      drawContain(ctx, it.img, shiftRect(back, -photo.w * 0.05, 0), 0.82)
    }
    drawContain(ctx, it.img, theme.stack ? { x: photo.x + photo.w * 0.08, y: photo.y, w: photo.w * 0.9, h: photo.h } : photo, 1)
    ctx.restore()
  } else {
    ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3
    ctx.strokeRect(photo.x + photo.w * 0.12, photo.y + photo.h * 0.1, photo.w * 0.7, photo.h * 0.8)
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.font = `800 ${r.w * 0.07}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('SEM FOTO', photo.x + photo.w * 0.47, photo.y + photo.h * 0.5); ctx.restore()
  }

  if (it.sizes?.length) drawSizeTable(ctx, r, it.sizes, theme)

  // nome (à esquerda do selo; alinhado à direita por padrão, como nas peças da rede) e subtítulo logo abaixo
  const nameRight = bx - badgeR * 1.02
  const nameLeft = r.x + r.w * 0.02
  const startSize = r.w * (cols >= 4 ? 0.085 : 0.075) * ((st.nameScale ?? 100) / 100)
  const bottomY = r.y + r.h - r.h * 0.04
  let nameBottom = bottomY
  if (it.note) nameBottom -= drawNote(ctx, it.note, nameLeft, nameRight, bottomY, c.name, startSize * 0.62, st.nameAlign ?? 'right') + 2
  drawName(ctx, it.name, nameLeft, nameRight, nameBottom, c.name, startSize, st.nameAlign ?? 'right')

  // selo de preço (com "De R$" riscado quando houver) e etiqueta
  drawBadge(ctx, bx, by, badgeR, it.price, theme, assets.badge ?? null, it.oldPrice ?? null)
  const tagText = st.tag !== undefined ? st.tag : theme.tagText
  const showTag = st.tag !== undefined ? st.tag !== '' : theme.showTag
  if (showTag && ((st.tag === undefined && assets.tag) || tagText)) drawTag(ctx, bx + badgeR * 0.2, by - badgeR * 1.0, badgeR, theme, st.tag === undefined ? (assets.tag ?? null) : null, tagText) // etiqueta própria escrita no encarte vale no lugar da arte do tema
}

/** Quadro de tamanhos e unidades (como nas peças de fralda da rede): uma linha por tamanho, no canto de cima à esquerda da foto. */
function drawSizeTable(ctx: CanvasRenderingContext2D, r: Rect, sizes: { label: string; units: number | null }[], theme: ThemeConfig): void {
  const rows = sizes.slice(0, 6)
  const rh = Math.min((r.h * 0.5) / rows.length, r.w * 0.085)
  const w1 = rh * 1.35, w2 = rh * 1.55
  const x = r.x + r.w * 0.025, y = r.y + r.h * 0.06
  ctx.save()
  ctx.lineWidth = Math.max(2, rh * 0.09); ctx.strokeStyle = theme.colors.title
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.font = `800 ${rh * 0.58}px ${TEXT}`
  rows.forEach((row, i) => {
    const yy = y + i * rh
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, yy, w1 + (row.units !== null ? w2 : 0), rh)
    ctx.strokeRect(x, yy, w1, rh)
    if (row.units !== null) ctx.strokeRect(x + w1, yy, w2, rh)
    ctx.fillStyle = '#111111'; ctx.fillText(row.label, x + w1 / 2, yy + rh / 2 + rh * 0.04)
    if (row.units !== null) ctx.fillText(String(row.units), x + w1 + w2 / 2, yy + rh / 2 + rh * 0.04)
  })
  ctx.restore()
}

type Align = 'left' | 'center' | 'right'
const anchorX = (a: Align, left: number, right: number) => (a === 'left' ? left : a === 'center' ? (left + right) / 2 : right)

function drawName(ctx: CanvasRenderingContext2D, text: string, left: number, right: number, bottom: number, color: string, startSize: number, align: Align): void {
  const maxW = Math.max(10, right - left)
  let size = startSize
  let lines: string[] = []
  for (; size >= 10; size -= 1) {
    ctx.font = `800 ${size}px ${TEXT}`
    lines = wrap(ctx, text, maxW)
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW)) break
  }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  const lh = size * 1.12
  const x = anchorX(align, left, right)
  lines.slice(0, 4).reverse().forEach((l, i) => ctx.fillText(l, x, bottom - i * lh))
}

/** Subtítulo / descrição curta (ex.: "50ml", "Leve 3 pague 2"): até 2 linhas, mais leve que o nome. Devolve a altura ocupada. */
function drawNote(ctx: CanvasRenderingContext2D, text: string, left: number, right: number, bottom: number, color: string, size: number, align: Align): number {
  const maxW = Math.max(10, right - left)
  let s = Math.max(10, size)
  let lines: string[] = []
  for (; s >= 9; s -= 1) {
    ctx.font = `600 ${s}px ${TEXT}`
    lines = wrap(ctx, text, maxW)
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) break
  }
  ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  const lh = s * 1.15, x = anchorX(align, left, right)
  lines.slice(0, 2).reverse().forEach((l, i) => ctx.fillText(l, x, bottom - i * lh))
  ctx.globalAlpha = 1
  return Math.min(lines.length, 2) * lh
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' '), lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width <= maxW || !cur) cur = t
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, price: number, theme: ThemeConfig, art: HTMLImageElement | null, oldPrice: number | null): void {
  const c = theme.colors
  const spikes = 14
  const path = (ox: number, oy: number) => {
    ctx.beginPath()
    for (let i = 0; i < spikes * 2; i++) {
      const a = (Math.PI * i) / spikes - Math.PI / 2
      const rad = i % 2 === 0 ? R : R * 0.86
      const x = cx + ox + Math.cos(a) * rad, y = cy + oy + Math.sin(a) * rad
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  if (art) { // selo desenhado pela rede (sem número): a imagem ocupa o lugar do selo padrão e o preço é escrito por cima
    const s = Math.min((R * 2.3) / art.width, (R * 2.3) / art.height)
    ctx.drawImage(art, cx - (art.width * s) / 2, cy - (art.height * s) / 2, art.width * s, art.height * s)
  } else {
    ctx.save(); ctx.lineJoin = 'round'
    path(R * 0.05, R * 0.08); ctx.fillStyle = c.badgeEdge; ctx.fill() // sombra dura
    path(0, 0); ctx.fillStyle = c.badge; ctx.fill(); ctx.lineWidth = R * 0.035; ctx.strokeStyle = c.badgeEdge; ctx.stroke()
    ctx.restore()
  }

  const { reais, centavos } = priceParts(price)
  const maxW = R * 1.42
  let size = R * (oldPrice ? 0.72 : 0.82)
  const measure = () => { ctx.font = `800 ${size}px ${DISPLAY}`; return ctx.measureText(reais).width + size * 0.42 + R * 0.38 }
  while (measure() > maxW && size > 12) size -= 2
  ctx.font = `800 ${size}px ${DISPLAY}`
  const wr = ctx.measureText(reais).width
  const small = size * 0.4
  const total = wr + small * 1.9 // "R$" à esquerda + centavos à direita
  const x0 = cx - total / 2
  const dy = oldPrice ? R * 0.1 : 0 // com preço original, o preço novo desce um pouco
  ctx.fillStyle = c.badgeText; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  ctx.font = `800 ${small}px ${DISPLAY}`; ctx.fillText('R$', x0, cy - size * 0.12 + dy)
  ctx.font = `800 ${size}px ${DISPLAY}`; ctx.fillText(reais, x0 + small * 1.15, cy + size * 0.36 + dy)
  ctx.font = `800 ${small * 1.05}px ${DISPLAY}`; ctx.fillText(`,${centavos}`, x0 + small * 1.15 + wr + 2, cy - size * 0.12 + dy)
  if (oldPrice) { // "DE R$ 99,99" riscado, no alto do selo
    const op = priceParts(oldPrice)
    const t = `DE R$ ${op.reais},${op.centavos}`
    const fs = R * 0.2
    ctx.font = `700 ${fs}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const ty = cy - R * 0.5
    ctx.globalAlpha = 0.9; ctx.fillText(t, cx, ty); ctx.globalAlpha = 1
    const tw = ctx.measureText(t).width
    ctx.strokeStyle = c.badgeText; ctx.lineWidth = Math.max(2, fs * 0.09)
    ctx.beginPath(); ctx.moveTo(cx - tw / 2 - 2, ty); ctx.lineTo(cx + tw / 2 + 2, ty); ctx.stroke()
  }
}

function drawTag(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, theme: ThemeConfig, art: HTMLImageElement | null, text: string): void {
  const c = theme.colors
  if (art) { // etiqueta pronta (ex.: "Uaau!" com o rostinho)
    const s = (R * 1.15) / art.width
    ctx.drawImage(art, cx - (art.width * s) / 2, cy - (art.height * s) / 2, art.width * s, art.height * s)
    return
  }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.07)
  const fs = R * 0.3
  ctx.font = `800 ${fs}px ${DISPLAY}`
  const tw = ctx.measureText(text).width + fs * 0.9, th = fs * 1.35
  ctx.fillStyle = c.tag; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = fs * 0.1
  roundRect(ctx, -tw / 2, -th / 2, tw, th, th * 0.32); ctx.fill(); ctx.stroke()
  ctx.fillStyle = c.tagText; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, fs * 0.04)
  ctx.restore()
}

// ---------- utilidades de desenho ----------
const shiftRect = (r: Rect, dx: number, dy: number): Rect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h })
function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Rect, alpha: number): void {
  const s = Math.min(box.w / img.width, box.h / img.height)
  const w = img.width * s, h = img.height * s
  ctx.globalAlpha = alpha
  ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h), w, h) // encostado embaixo: o produto "pisa" no preço
  ctx.globalAlpha = 1
}
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height)
  const iw = img.width * s, ih = img.height * s
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath()
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui gerar a imagem.'))), 'image/png'))
}
