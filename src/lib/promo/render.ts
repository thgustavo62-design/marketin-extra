// Desenho da peça de promoção em canvas (navegador): feed, story e A4. Mesmo código para a prévia e para baixar.
import { PROMO_FORMATS, pageLayout, placeCells, priceParts, type PromoFormat, type Rect, type ThemeConfig } from '../domain/promo.ts'

export type RenderAssets = { background?: HTMLImageElement | null; header?: HTMLImageElement | null; footer?: HTMLImageElement | null; badge?: HTMLImageElement | null; tag?: HTMLImageElement | null }
export type RenderItem = { name: string; price: number; img: HTMLImageElement | null }
export type RenderOpts = { format: PromoFormat; theme: ThemeConfig; title: string | null; validity: string | null; assets: RenderAssets; items: RenderItem[] }

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

export function drawPage(canvas: HTMLCanvasElement, o: RenderOpts): void {
  const { w: W, h: H } = PROMO_FORMATS[o.format]
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
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    for (const [cx, cy, r] of [[0.1, 0.05, 0.2], [0.85, 0.03, 0.22], [0.5, 0.01, 0.18], [0.02, 0.5, 0.15], [0.98, 0.6, 0.16]] as const) { ctx.beginPath(); ctx.arc(W * cx, H * cy, W * r, 0, Math.PI * 2); ctx.fill() }
  }

  // medidas do cabeçalho e do rodapé (da arte enviada ou o padrão)
  const headerH = o.assets.header ? Math.round((o.assets.header.height * W) / o.assets.header.width) : HEADER_DEFAULT[o.format]
  const footerH = o.assets.footer ? Math.round((o.assets.footer.height * W) / o.assets.footer.width) : o.theme.footerLines.length ? FOOTER_DEFAULT + (o.theme.footerLines.length - 1) * 40 : 0

  // painel (desenhado antes do cabeçalho e do rodapé: com "painel por baixo do cabeçalho" a arte fica por cima dele)
  const grid = o.theme.grid[o.format]
  const layout = pageLayout(o.format, grid, o.theme.panel[o.format], headerH, footerH, o.items.length, o.theme.panelMargin[o.format], o.theme.panelTuck)
  if (layout.panel) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6
    ctx.fillStyle = c.panel; roundRect(ctx, layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h, layout.panel.x > 0 ? Math.round(W * 0.045) : 0); ctx.fill(); ctx.restore()
  }

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

  const cells = placeCells(layout.cells, o.items.length, grid.cols)
  o.items.forEach((it, i) => drawCell(ctx, cells[i], it, o.theme, grid.cols, o.assets))
}

function drawCell(ctx: CanvasRenderingContext2D, r: Rect, it: RenderItem, theme: ThemeConfig, cols: number, assets: RenderAssets): void {
  const c = theme.colors
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

  // nome (à esquerda do selo, alinhado à direita, como nas peças da rede)
  const nameRight = bx - badgeR * 1.02
  const nameLeft = r.x + r.w * 0.02
  drawName(ctx, it.name, nameLeft, nameRight, r.y + r.h - r.h * 0.04, c.name, r.w * (cols >= 4 ? 0.085 : 0.075))

  // selo de preço
  drawBadge(ctx, bx, by, badgeR, it.price, theme, assets.badge ?? null)
  if (theme.showTag && (assets.tag || theme.tagText)) drawTag(ctx, bx + badgeR * 0.2, by - badgeR * 1.0, badgeR, theme, assets.tag ?? null)
}

function drawName(ctx: CanvasRenderingContext2D, text: string, left: number, right: number, bottom: number, color: string, startSize: number): void {
  const maxW = Math.max(10, right - left)
  let size = startSize
  let lines: string[] = []
  for (; size >= 10; size -= 1) {
    ctx.font = `800 ${size}px ${TEXT}`
    lines = wrap(ctx, text, maxW)
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW)) break
  }
  ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
  const lh = size * 1.12
  lines.slice(0, 4).reverse().forEach((l, i) => ctx.fillText(l, right, bottom - i * lh))
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

function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, price: number, theme: ThemeConfig, art: HTMLImageElement | null): void {
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
  let size = R * 0.82
  const measure = () => { ctx.font = `800 ${size}px ${DISPLAY}`; return ctx.measureText(reais).width + size * 0.42 + R * 0.38 }
  while (measure() > maxW && size > 12) size -= 2
  ctx.font = `800 ${size}px ${DISPLAY}`
  const wr = ctx.measureText(reais).width
  const small = size * 0.4
  const total = wr + small * 1.9 // "R$" à esquerda + centavos à direita
  const x0 = cx - total / 2
  ctx.fillStyle = c.badgeText; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  ctx.font = `800 ${small}px ${DISPLAY}`; ctx.fillText('R$', x0, cy - size * 0.12)
  ctx.font = `800 ${size}px ${DISPLAY}`; ctx.fillText(reais, x0 + small * 1.15, cy + size * 0.36)
  ctx.font = `800 ${small * 1.05}px ${DISPLAY}`; ctx.fillText(`,${centavos}`, x0 + small * 1.15 + wr + 2, cy - size * 0.12)
}

function drawTag(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, theme: ThemeConfig, art: HTMLImageElement | null): void {
  const c = theme.colors
  if (art) { // etiqueta pronta (ex.: "Uaau!" com o rostinho)
    const s = (R * 1.15) / art.width
    ctx.drawImage(art, cx - (art.width * s) / 2, cy - (art.height * s) / 2, art.width * s, art.height * s)
    return
  }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.07)
  const fs = R * 0.3
  ctx.font = `800 ${fs}px ${DISPLAY}`
  const tw = ctx.measureText(theme.tagText).width + fs * 0.9, th = fs * 1.35
  ctx.fillStyle = c.tag; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = fs * 0.1
  roundRect(ctx, -tw / 2, -th / 2, tw, th, th * 0.32); ctx.fill(); ctx.stroke()
  ctx.fillStyle = c.tagText; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(theme.tagText, 0, fs * 0.04)
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
