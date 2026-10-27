// Desenho da peça de promoção em canvas (navegador): feed, story e A4. Mesmo código para a prévia e para baixar.
import {
  BACKGROUND_PRESETS,
  PROMO_FORMATS,
  pageLayout,
  placeCells,
  priceParts,
  type ItemStyle,
  type PromoFormat,
  type Rect,
  type ThemeConfig,
} from "../domain/promo.ts";
import { imagePlacement, type Layer } from "../domain/promo-layers.ts";
import { PROMO_FONTS, fontStack } from "../domain/promo-fonts.ts";

export type RenderAssets = {
  background?: HTMLImageElement | null;
  header?: HTMLImageElement | null;
  footer?: HTMLImageElement | null;
  badge?: HTMLImageElement | null;
  tag?: HTMLImageElement | null;
};
/** Fundo escolhido para a promoção no lugar do fundo do tema: pronto, duas cores ou imagem (já carregada). */
export type RenderBackground =
  | { kind: "preset"; id: string }
  | { kind: "color"; color: string; color2?: string }
  | { kind: "image"; img: HTMLImageElement };
export type RenderItem = {
  name: string;
  price: number;
  img: HTMLImageElement | null;
  imgs?: HTMLImageElement[];
  /** tabela de tamanhos (fraldas): um quadro por tamanho com as unidades */ sizes?: {
    label: string;
    units: number | null;
  }[];
  /** preço original ("De R$"), riscado no selo */ oldPrice?: number | null;
  /** subtítulo abaixo do nome */ note?: string | null;
  style?: ItemStyle;
};
export type RenderOpts = {
  format: PromoFormat;
  theme: ThemeConfig;
  title: string | null;
  validity: string | null;
  /** texto livre (endereço, telefone) logo acima do rodapé */ extraText?:
    | string
    | null;
  assets: RenderAssets;
  items: RenderItem[];
  /** fundo da promoção (vale no lugar do fundo do tema) */ bg?: RenderBackground | null;
  /** artes fixas do tema (bonecos, logos, fundos…) já filtradas para esta peça: por baixo dos produtos e por cima de tudo */ fixed?: {
    under: Layer[];
    over: Layer[];
    images: Record<string, HTMLImageElement | null>;
  };
  /** elementos livres desta peça (já filtrados pela página), do fundo para o topo; imagens em `layerImages` pelo id do arquivo */ layers?: Layer[];
  layerImages?: Record<string, HTMLImageElement | null>;
};

const DISPLAY = '"PromoDisplay", "Baloo 2", system-ui, sans-serif';
const TEXT = '"PromoText", Montserrat, system-ui, sans-serif';

let fontsReady: Promise<void> | null = null;
/** Carrega as fontes da peça (Baloo 2 para preços e títulos, Montserrat para nomes). */
export function loadPromoFonts(): Promise<void> {
  fontsReady ??= (async () => {
    try {
      const a = new FontFace("PromoDisplay", "url(/fonts/Baloo2.ttf)", {
        weight: "400 800",
      });
      const b = new FontFace("PromoText", "url(/fonts/Montserrat.ttf)", {
        weight: "100 900",
      });
      await Promise.all([a.load(), b.load()]);
      document.fonts.add(a);
      document.fonts.add(b);
    } catch {
      /* sem a fonte, usa a do sistema */
    }
  })();
  return fontsReady;
}

const fontLoads = new Map<string, Promise<void>>();
/** Carrega no navegador as fontes do catálogo pedidas (uma vez cada). Fonte que não carrega cai na reserva do sistema, sem travar a peça. */
export function loadFonts(ids: Iterable<string | undefined>): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const id of new Set(ids)) {
    const def = PROMO_FONTS.find((f) => f.id === id);
    if (!def || !def.family || id === "display" || id === "text") continue; // as duas de sempre vêm de loadPromoFonts
    if (!fontLoads.has(def.id)) {
      fontLoads.set(
        def.id,
        (async () => {
          try {
            const faces = def.faces.map(
              (x) =>
                new FontFace(def.family!, `url(${x.url})`, {
                  weight: x.weight,
                }),
            );
            await Promise.all(faces.map((x) => x.load()));
            for (const x of faces) document.fonts.add(x);
          } catch {
            /* sem a fonte, usa a reserva */
          }
        })(),
      );
    }
    jobs.push(fontLoads.get(def.id)!);
  }
  return Promise.all(jobs).then(() => undefined);
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const HEADER_DEFAULT: Record<PromoFormat, number> = {
  story: 380,
  feed: 300,
  a4: 420,
};
const FOOTER_DEFAULT = 110;

/** Medidas da peça: cabeçalho, rodapé, painel e a posição de cada produto. O editor usa a mesma função para saber onde o clique caiu. */
export function pageGeometry(
  o: Pick<RenderOpts, "format" | "theme" | "assets"> & { count: number },
): {
  W: number;
  H: number;
  headerH: number;
  footerH: number;
  panel: Rect | null;
  cells: Rect[];
  cardColor: string | null;
} {
  const { w: W, h: H } =
    o.theme.dimensions?.[o.format] ?? PROMO_FORMATS[o.format];
  const headerH = o.assets.header
    ? Math.round((o.assets.header.height * W) / o.assets.header.width)
    : HEADER_DEFAULT[o.format];
  const footerH = o.assets.footer
    ? Math.round((o.assets.footer.height * W) / o.assets.footer.width)
    : o.theme.footerLines.length
      ? FOOTER_DEFAULT + (o.theme.footerLines.length - 1) * 40
      : 0;
  const grid = o.theme.grid[o.format];
  const cardColor = o.theme.cards[o.format];
  const layout = pageLayout(
    o.format,
    grid,
    o.theme.panel[o.format],
    headerH,
    footerH,
    {
      dimensions: o.theme.dimensions?.[o.format],
      count: o.count,
      marginPct: o.theme.panelMargin[o.format],
      tuck: o.theme.panelTuck,
      area: o.theme.gridArea[o.format],
      gapPct: cardColor ? o.theme.cardGap : 0,
    },
  );
  return {
    W,
    H,
    headerH,
    footerH,
    panel: layout.panel,
    cells: placeCells(layout.cells, o.count, grid.cols, layout.pitchX),
    cardColor,
  };
}

export function drawPage(canvas: HTMLCanvasElement, o: RenderOpts): void {
  const geo = pageGeometry({
    format: o.format,
    theme: o.theme,
    assets: o.assets,
    count: o.items.length,
  });
  const { W, H, headerH, footerH, panel, cells, cardColor } = geo;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const c = o.theme.colors;
  ctx.clearRect(0, 0, W, H);

  // fundo
  if (o.bg) drawBackgroundChoice(ctx, o.bg, W, H);
  else if (o.assets.background) drawCover(ctx, o.assets.background, 0, 0, W, H);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c.skyTop);
    g.addColorStop(1, c.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (o.theme.clouds) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (const [cx, cy, r] of [
        [0.1, 0.05, 0.2],
        [0.85, 0.03, 0.22],
        [0.5, 0.01, 0.18],
        [0.02, 0.5, 0.15],
        [0.98, 0.6, 0.16],
      ] as const) {
        ctx.beginPath();
        ctx.arc(W * cx, H * cy, W * r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // painel (antes do cabeçalho e do rodapé: com "painel por baixo do cabeçalho" a arte fica por cima dele)
  if (panel) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = c.panel;
    roundRect(
      ctx,
      panel.x,
      panel.y,
      panel.w,
      panel.h,
      panel.x > 0 ? Math.round(W * 0.045) : 0,
    );
    ctx.fill();
    ctx.restore();
  }

  // artes fixas do tema que ficam por baixo dos produtos (fundos, bonecos atrás)
  if (o.fixed?.under.length) drawLayers(ctx, o.fixed.under, o.fixed.images);

  // produtos (cartão opcional de cada um); o cabeçalho e o rodapé desenhados depois cobrem o que sobrepõem, como nas peças da rede
  const cols = o.theme.grid[o.format].cols;
  o.items.forEach((it, i) => {
    if (cardColor) {
      ctx.fillStyle = cardColor;
      roundRect(
        ctx,
        cells[i].x,
        cells[i].y,
        cells[i].w,
        cells[i].h,
        Math.round(Math.min(cells[i].w, cells[i].h) * 0.07),
      );
      ctx.fill();
    }
    drawCell(ctx, cells[i], it, o.theme, cols, o.assets, {
      minY: o.assets.header ? headerH + 4 : 0,
      maxY: o.assets.footer ? H - footerH - 4 : H,
    });
  });

  // cabeçalho
  if (o.assets.header) ctx.drawImage(o.assets.header, 0, 0, W, headerH);
  else {
    const title = (o.title || o.theme.title || "").toUpperCase();
    if (title) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = headerH * 0.52;
      ctx.font = `800 ${size}px ${DISPLAY}`;
      while (ctx.measureText(title).width > W * 0.86 && size > 20) {
        size -= 4;
        ctx.font = `800 ${size}px ${DISPLAY}`;
      }
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = c.badgeEdge;
      ctx.strokeText(title, W / 2, headerH * 0.46);
      ctx.fillStyle = c.title;
      ctx.fillText(title, W / 2, headerH * 0.46);
    }
    if (o.validity) {
      ctx.font = `800 ${headerH * 0.1}px ${TEXT}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.validity.toUpperCase(), W / 2, headerH * 0.86);
    }
  }

  // rodapé
  if (o.assets.footer)
    ctx.drawImage(o.assets.footer, 0, H - footerH, W, footerH);
  else if (o.theme.footerLines.length) {
    ctx.fillStyle = c.footer;
    ctx.fillRect(0, H - footerH, W, footerH);
    ctx.fillStyle = c.footerText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    o.theme.footerLines.forEach((line, i) => {
      ctx.font = `800 ${i === 0 ? 46 : 34}px ${DISPLAY}`;
      ctx.fillText(
        line,
        W / 2,
        H - footerH + (footerH / (o.theme.footerLines.length + 1)) * (i + 1),
      );
    });
  }
  if (o.extraText) {
    const fs = Math.round(W * 0.027);
    ctx.font = `800 ${fs}px ${TEXT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.lineWidth = fs * 0.3;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    const y = H - footerH - Math.round(fs * 0.5);
    ctx.strokeText(o.extraText, W / 2, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(o.extraText, W / 2, y);
  }

  // artes fixas do tema por cima (logos, bonecos na frente) e, por último, os elementos livres da promoção
  if (o.fixed?.over.length) drawLayers(ctx, o.fixed.over, o.fixed.images);
  if (o.layers?.length) drawLayers(ctx, o.layers, o.layerImages ?? {});
}

// ---------- fundos prontos ----------
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawBackgroundChoice(
  ctx: CanvasRenderingContext2D,
  bg: RenderBackground,
  W: number,
  H: number,
): void {
  if (bg.kind === "image") {
    drawCover(ctx, bg.img, 0, 0, W, H);
    return;
  }
  if (bg.kind === "color") {
    drawGradient(ctx, bg.color, bg.color2 ?? bg.color, W, H);
    return;
  }
  const p = BACKGROUND_PRESETS.find((x) => x.id === bg.id);
  if (!p) {
    drawGradient(ctx, "#4db4ee", "#bfe8fb", W, H);
    return;
  }
  const [a, b] = p.colors;
  if (p.style === "linear") drawGradient(ctx, a, b, W, H);
  else if (p.style === "sky") {
    drawGradient(ctx, a, b, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (const [cx, cy, r] of [
      [0.1, 0.05, 0.2],
      [0.85, 0.03, 0.22],
      [0.5, 0.01, 0.18],
      [0.02, 0.5, 0.15],
      [0.98, 0.6, 0.16],
    ] as const) {
      ctx.beginPath();
      ctx.arc(W * cx, H * cy, W * r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.style === "radial") {
    const g = ctx.createRadialGradient(
      W / 2,
      H * 0.3,
      0,
      W / 2,
      H * 0.3,
      Math.hypot(W, H) * 0.7,
    );
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (p.style === "rays") {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = b;
    const n = 24,
      cx = W / 2,
      cy = H * 0.28,
      R = Math.hypot(W, H);
    for (let i = 0; i < n; i += 2) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.8);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (p.style === "confetti") {
    drawGradient(ctx, a, b, W, H);
    const rnd = seeded(7),
      cols = ["#e3171d", "#1d5fe0", "#ffb800", "#27c58a", "#ff6fa6"];
    for (let i = 0; i < 90; i++) {
      ctx.save();
      ctx.translate(rnd() * W, rnd() * H);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
      ctx.globalAlpha = 0.55;
      ctx.fillRect(-W * 0.012, -W * 0.006, W * 0.024, W * 0.012);
      ctx.restore();
    }
  } else {
    // stripes
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = a;
    const step = W * 0.09;
    ctx.save();
    ctx.rotate(-0.35);
    for (let x = -H; x < W + H; x += step * 2) ctx.fillRect(x, -H, step, H * 3);
    ctx.restore();
  }
}

function drawGradient(
  ctx: CanvasRenderingContext2D,
  a: string,
  b: string,
  W: number,
  H: number,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------- elementos livres (texto, imagem, formas) ----------

/** Desenha os elementos livres por cima da peça, do primeiro (fundo) ao último (topo), com giro e transparência. */
export function drawLayers(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  images: Record<string, HTMLImageElement | null>,
): void {
  for (const l of layers) {
    if (l.hidden) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, l.opacity));
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
    if (l.rot) ctx.rotate((l.rot * Math.PI) / 180);
    ctx.translate(-l.w / 2, -l.h / 2);
    if (l.shadow) {
      const blur = Math.max(8, Math.min(l.w, l.h) * 0.1);
      ctx.shadowColor = "rgba(0,0,0,0.38)";
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = blur * 0.45;
    }
    if (l.type === "shape") drawShape(ctx, l);
    else if (l.type === "image")
      drawImageLayer(ctx, l, l.asset ? images[l.asset] : null);
    else drawLayerText(ctx, l);
    ctx.restore();
  }
}

/** Contorno da moldura da foto: retângulo, cantos arredondados ou círculo/elipse. */
function maskPath(ctx: CanvasRenderingContext2D, l: Layer): void {
  ctx.beginPath();
  if (l.mask === "circle")
    ctx.ellipse(l.w / 2, l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
  else if (l.mask === "round")
    roundRect(ctx, 0, 0, l.w, l.h, Math.min(l.radius ?? 24, l.w / 2, l.h / 2));
  else ctx.rect(0, 0, l.w, l.h);
}

/** Foto na moldura: encaixe (inteira ou preenchendo), zoom e foco, recorte da moldura, espelhar, ajustes de cor, desfoque e borda. */
function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  l: Layer,
  img: HTMLImageElement | null,
): void {
  if (!img) {
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, l.w, l.h);
    return;
  }
  const pl = imagePlacement(l, img.width, img.height);
  ctx.save();
  if (l.mask || l.fit === "cover") {
    maskPath(ctx, l);
    ctx.clip();
  }
  if (l.mask) ctx.shadowColor = "transparent"; // a sombra de uma foto recortada ficaria cortada junto
  const f: string[] = [];
  if (l.bright) f.push(`brightness(${1 + l.bright / 100})`);
  if (l.contrast) f.push(`contrast(${1 + l.contrast / 100})`);
  if (l.saturate) f.push(`saturate(${1 + l.saturate / 100})`);
  if (l.gray) f.push("grayscale(1)");
  if (l.blur) f.push(`blur(${l.blur}px)`);
  if (f.length) ctx.filter = f.join(" "); // navegadores sem ctx.filter (Safari antigo) mostram a foto sem os ajustes
  if (l.flipX || l.flipY) {
    ctx.translate(l.w / 2, l.h / 2);
    ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
    ctx.translate(-l.w / 2, -l.h / 2);
  }
  ctx.drawImage(img, pl.dx, pl.dy, pl.dw, pl.dh);
  ctx.restore();
  if (l.border && l.borderW) {
    ctx.save();
    ctx.shadowColor = "transparent";
    maskPath(ctx, l);
    ctx.lineJoin = "round";
    ctx.lineWidth = l.borderW * 2;
    ctx.strokeStyle = l.border;
    ctx.setLineDash(dashFor(l.dash, l.borderW));
    ctx.clip();
    ctx.stroke();
    ctx.restore(); // clip: a borda fica por dentro da moldura
  }
}

/** Contorno da forma em coordenadas locais (0,0 até w,h). A linha é desenhada à parte. */
function shapePath(ctx: CanvasRenderingContext2D, l: Layer): void {
  const { w, h } = l;
  ctx.beginPath();
  switch (l.shape) {
    case "circle":
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "round": {
      const r = Math.min(l.radius ?? 24, w / 2, h / 2);
      roundRect(ctx, 0, 0, w, h, r);
      break;
    }
    case "burst": {
      const spikes = 14;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (Math.PI * i) / spikes - Math.PI / 2,
          k = i % 2 === 0 ? 1 : 0.84;
        const x = w / 2 + Math.cos(a) * (w / 2) * k,
          y = h / 2 + Math.sin(a) * (h / 2) * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case "star": {
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * i) / 5 - Math.PI / 2,
          k = i % 2 === 0 ? 1 : 0.42;
        const x = w / 2 + Math.cos(a) * (w / 2) * k,
          y = h / 2 + Math.sin(a) * (h / 2) * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case "triangle":
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      break;
    case "arrow":
      ctx.moveTo(0, h * 0.25);
      ctx.lineTo(w * 0.6, h * 0.25);
      ctx.lineTo(w * 0.6, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w * 0.6, h);
      ctx.lineTo(w * 0.6, h * 0.75);
      ctx.lineTo(0, h * 0.75);
      ctx.closePath();
      break;
    case "hexagon":
      ctx.moveTo(w * 0.25, 0);
      ctx.lineTo(w * 0.75, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w * 0.75, h);
      ctx.lineTo(w * 0.25, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      break;
    case "balloon": {
      const bh = h * 0.8,
        r = Math.min(l.radius ?? 24, w / 2, bh / 2);
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, bh, r);
      ctx.arcTo(w, bh, w - r, bh, r);
      ctx.lineTo(w * 0.38, bh);
      ctx.lineTo(w * 0.14, h);
      ctx.lineTo(w * 0.22, bh);
      ctx.lineTo(r, bh);
      ctx.arcTo(0, bh, 0, 0, r);
      ctx.arcTo(0, 0, r, 0, r);
      ctx.closePath();
      break;
    }
    case "tag": {
      ctx.moveTo(h * 0.5, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(h * 0.5, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      ctx.moveTo(h * 0.5 + h * 0.1, h / 2);
      ctx.arc(h * 0.5, h / 2, h * 0.1, 0, Math.PI * 2, true); // furo
      break;
    }
    default:
      ctx.rect(0, 0, w, h);
  }
}

/** Cor de preenchimento: sólida ou degradê entre duas cores no ângulo escolhido. */
function fillStyleFor(
  ctx: CanvasRenderingContext2D,
  l: Layer,
): string | CanvasGradient {
  const a = l.fill ?? "#ffd21f";
  if (!l.fill2) return a;
  const rad = ((l.gradAngle ?? 90) * Math.PI) / 180,
    dx = Math.cos(rad),
    dy = Math.sin(rad);
  const half = (Math.abs(l.w * dx) + Math.abs(l.h * dy)) / 2;
  const g = ctx.createLinearGradient(
    l.w / 2 - dx * half,
    l.h / 2 - dy * half,
    l.w / 2 + dx * half,
    l.h / 2 + dy * half,
  );
  g.addColorStop(0, a);
  g.addColorStop(1, l.fill2);
  return g;
}

const dashFor = (d: Layer["dash"], w: number): number[] =>
  d === "dashed" ? [w * 3, w * 2] : d === "dotted" ? [0.1, w * 2] : [];

function drawShape(ctx: CanvasRenderingContext2D, l: Layer): void {
  const { w, h } = l;
  if (l.shape === "line") {
    ctx.strokeStyle = fillStyleFor(ctx, l);
    ctx.lineWidth = Math.max(2, h);
    ctx.lineCap = l.dash === "dashed" ? "butt" : "round";
    ctx.setLineDash(dashFor(l.dash, Math.max(2, h)));
    ctx.beginPath();
    ctx.moveTo(h / 2, h / 2);
    ctx.lineTo(w - h / 2, h / 2);
    ctx.stroke();
    return;
  }
  shapePath(ctx, l);
  ctx.fillStyle = fillStyleFor(ctx, l);
  ctx.fill("evenodd");
  if (l.border && l.borderW) {
    ctx.shadowColor = "transparent";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = l.borderW;
    ctx.strokeStyle = l.border;
    ctx.setLineDash(dashFor(l.dash, l.borderW));
    ctx.stroke();
  }
}

/** Aplica a fonte do texto e quebra em linhas que cabem na largura da caixa. */
function layoutLayerText(
  ctx: CanvasRenderingContext2D,
  l: Layer,
): { lines: string[]; size: number; pad: number; lh: number } {
  const size = l.size ?? 64;
  const pad = l.bg ? size * 0.3 : 0;
  ctx.font = `${l.italic ? "italic " : ""}${l.bold === false ? 500 : 800} ${size}px ${fontStack(l.font)}`;
  const lines = (l.text ?? "")
    .split("\n")
    .flatMap((p) => wrap(ctx, p, Math.max(10, l.w - pad * 2)));
  return { lines, size, pad, lh: size * 1.15 };
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Altura que o texto precisa na caixa do elemento: o editor ajusta a caixa ao texto, como no Canva. */
export function measureLayerHeight(l: Layer): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return l.h;
  const m = layoutLayerText(measureCtx, l);
  return Math.max(16, Math.ceil(m.lines.length * m.lh + m.pad * 2));
}

function drawLayerText(ctx: CanvasRenderingContext2D, l: Layer): void {
  const { w, h } = l;
  if (l.bg) {
    ctx.fillStyle = l.bg;
    roundRect(ctx, 0, 0, w, h, Math.min((l.size ?? 64) * 0.3, h / 2));
    ctx.fill();
  }
  const { lines, pad, lh } = layoutLayerText(ctx, l);
  ctx.textBaseline = "middle";
  ctx.textAlign = l.align ?? "center";
  const x = l.align === "left" ? pad : l.align === "right" ? w - pad : w / 2;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  ctx.lineJoin = "round";
  lines.forEach((t, i) => {
    if (l.stroke && l.strokeW) {
      ctx.lineWidth = l.strokeW;
      ctx.strokeStyle = l.stroke;
      ctx.strokeText(t, x, y0 + i * lh);
    }
    ctx.fillStyle = l.color ?? "#111111";
    ctx.fillText(t, x, y0 + i * lh);
  });
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  cell: Rect,
  it: RenderItem,
  baseTheme: ThemeConfig,
  cols: number,
  assets: RenderAssets,
  safe: { minY: number; maxY: number },
): void {
  const st = it.style ?? {};
  // estilo do próprio encarte (cores e etiqueta) vale no lugar do tema
  const theme: ThemeConfig = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      badge: st.badgeColor ?? baseTheme.colors.badge,
      badgeText: st.priceColor ?? baseTheme.colors.badgeText,
      tag: st.tagColor ?? baseTheme.colors.tag,
      name: st.nameColor ?? baseTheme.colors.name,
    },
  };
  const c = theme.colors;
  // se o cabeçalho ou o rodapé cobrem parte do cartão (a arte fica por cima), o conteúdo usa só a parte visível
  const top = Math.max(cell.y, safe.minY),
    bottom = Math.min(cell.y + cell.h, safe.maxY);
  const r: Rect = {
    x: cell.x,
    y: top,
    w: cell.w,
    h: Math.max(40, bottom - top),
  };
  const badgeR = Math.min(r.w * 0.24, r.h * 0.22);
  const bx = r.x + r.w - badgeR - r.w * 0.015,
    by = r.y + r.h - badgeR - r.h * 0.03;
  const photo: Rect = {
    x: r.x + r.w * 0.05,
    y: r.y + r.h * 0.02,
    w: r.w * 0.9,
    h: r.h * 0.68,
  };

  // Only distinct real product photos; never fake a second package by duplicating one photo.
  const pictures = it.imgs?.length
    ? it.imgs.slice(0, 2)
    : it.img
      ? [it.img]
      : [];
  if (pictures.length) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    pictures.forEach((img, i) =>
      drawContain(
        ctx,
        img,
        pictures.length === 1
          ? photo
          : {
              x: photo.x + i * photo.w * 0.45,
              y: photo.y,
              w: photo.w * 0.55,
              h: photo.h,
            },
        1,
      ),
    );
    ctx.restore();
  } else {
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      photo.x + photo.w * 0.12,
      photo.y + photo.h * 0.1,
      photo.w * 0.7,
      photo.h * 0.8,
    );
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.font = `800 ${r.w * 0.07}px ${TEXT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SEM FOTO", photo.x + photo.w * 0.47, photo.y + photo.h * 0.5);
    ctx.restore();
  }

  if (it.sizes?.length) drawSizeTable(ctx, r, it.sizes, theme);

  // nome (à esquerda do selo; alinhado à direita por padrão, como nas peças da rede) e subtítulo logo abaixo
  const nameRight = bx - badgeR * 1.02;
  const nameLeft = r.x + r.w * 0.02;
  const startSize =
    r.w * (cols >= 4 ? 0.085 : 0.075) * ((st.nameScale ?? 100) / 100);
  const bottomY = r.y + r.h - r.h * 0.04;
  let nameBottom = bottomY;
  if (it.note)
    nameBottom -=
      drawNote(
        ctx,
        it.note,
        nameLeft,
        nameRight,
        bottomY,
        c.name,
        startSize * 0.62,
        st.nameAlign ?? "right",
      ) + 2;
  drawName(
    ctx,
    it.name,
    nameLeft,
    nameRight,
    nameBottom,
    c.name,
    startSize,
    st.nameAlign ?? "right",
  );

  // selo de preço (com "De R$" riscado quando houver) e etiqueta
  drawBadge(
    ctx,
    bx,
    by,
    badgeR,
    it.price,
    theme,
    assets.badge ?? null,
    it.oldPrice ?? null,
  );
  const tagText = st.tag !== undefined ? st.tag : theme.tagText;
  const showTag = st.tag !== undefined ? st.tag !== "" : theme.showTag;
  if (showTag && ((st.tag === undefined && assets.tag) || tagText))
    drawTag(
      ctx,
      bx + badgeR * 0.2,
      by - badgeR * 1.0,
      badgeR,
      theme,
      st.tag === undefined ? (assets.tag ?? null) : null,
      tagText,
    ); // etiqueta própria escrita no encarte vale no lugar da arte do tema
}

/** Quadro de tamanhos e unidades (como nas peças de fralda da rede): uma linha por tamanho, no canto de cima à esquerda da foto. */
function drawSizeTable(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  sizes: { label: string; units: number | null }[],
  theme: ThemeConfig,
): void {
  const rows = sizes.slice(0, 6);
  const rh = Math.min((r.h * 0.5) / rows.length, r.w * 0.085);
  const w1 = rh * 1.35,
    w2 = rh * 1.55;
  const x = r.x + r.w * 0.025,
    y = r.y + r.h * 0.06;
  ctx.save();
  ctx.lineWidth = Math.max(2, rh * 0.09);
  ctx.strokeStyle = theme.colors.title;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = `800 ${rh * 0.58}px ${TEXT}`;
  rows.forEach((row, i) => {
    const yy = y + i * rh;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, yy, w1 + (row.units !== null ? w2 : 0), rh);
    ctx.strokeRect(x, yy, w1, rh);
    if (row.units !== null) ctx.strokeRect(x + w1, yy, w2, rh);
    ctx.fillStyle = "#111111";
    ctx.fillText(row.label, x + w1 / 2, yy + rh / 2 + rh * 0.04);
    if (row.units !== null)
      ctx.fillText(String(row.units), x + w1 + w2 / 2, yy + rh / 2 + rh * 0.04);
  });
  ctx.restore();
}

type Align = "left" | "center" | "right";
const anchorX = (a: Align, left: number, right: number) =>
  a === "left" ? left : a === "center" ? (left + right) / 2 : right;

function drawName(
  ctx: CanvasRenderingContext2D,
  text: string,
  left: number,
  right: number,
  bottom: number,
  color: string,
  startSize: number,
  align: Align,
): void {
  const maxW = Math.max(10, right - left);
  let size = startSize;
  let lines: string[] = [];
  for (; size >= 10; size -= 1) {
    ctx.font = `800 ${size}px ${TEXT}`;
    lines = wrap(ctx, text, maxW);
    if (
      lines.length <= 3 &&
      lines.every((l) => ctx.measureText(l).width <= maxW)
    )
      break;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const lh = size * 1.12;
  const x = anchorX(align, left, right);
  lines
    .slice(0, 4)
    .reverse()
    .forEach((l, i) => ctx.fillText(l, x, bottom - i * lh));
}

/** Subtítulo / descrição curta (ex.: "50ml", "Leve 3 pague 2"): até 2 linhas, mais leve que o nome. Devolve a altura ocupada. */
function drawNote(
  ctx: CanvasRenderingContext2D,
  text: string,
  left: number,
  right: number,
  bottom: number,
  color: string,
  size: number,
  align: Align,
): number {
  const maxW = Math.max(10, right - left);
  let s = Math.max(10, size);
  let lines: string[] = [];
  for (; s >= 9; s -= 1) {
    ctx.font = `600 ${s}px ${TEXT}`;
    lines = wrap(ctx, text, maxW);
    if (
      lines.length <= 2 &&
      lines.every((l) => ctx.measureText(l).width <= maxW)
    )
      break;
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const lh = s * 1.15,
    x = anchorX(align, left, right);
  lines
    .slice(0, 2)
    .reverse()
    .forEach((l, i) => ctx.fillText(l, x, bottom - i * lh));
  ctx.globalAlpha = 1;
  return Math.min(lines.length, 2) * lh;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(" "),
    lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  price: number,
  theme: ThemeConfig,
  art: HTMLImageElement | null,
  oldPrice: number | null,
): void {
  const c = theme.colors;
  const spikes = 14;
  const path = (ox: number, oy: number) => {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (Math.PI * i) / spikes - Math.PI / 2;
      const rad = i % 2 === 0 ? R : R * 0.86;
      const x = cx + ox + Math.cos(a) * rad,
        y = cy + oy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  if (art) {
    // selo desenhado pela rede (sem número): a imagem ocupa o lugar do selo padrão e o preço é escrito por cima
    const s = Math.min((R * 2.3) / art.width, (R * 2.3) / art.height);
    ctx.drawImage(
      art,
      cx - (art.width * s) / 2,
      cy - (art.height * s) / 2,
      art.width * s,
      art.height * s,
    );
  } else {
    ctx.save();
    ctx.lineJoin = "round";
    path(R * 0.05, R * 0.08);
    ctx.fillStyle = c.badgeEdge;
    ctx.fill(); // sombra dura
    path(0, 0);
    ctx.fillStyle = c.badge;
    ctx.fill();
    ctx.lineWidth = R * 0.035;
    ctx.strokeStyle = c.badgeEdge;
    ctx.stroke();
    ctx.restore();
  }

  const { reais, centavos } = priceParts(price);
  const maxW = R * 1.42;
  let size = R * (oldPrice ? 0.72 : 0.82);
  const measure = () => {
    ctx.font = `800 ${size}px ${DISPLAY}`;
    return ctx.measureText(reais).width + size * 0.42 + R * 0.38;
  };
  while (measure() > maxW && size > 12) size -= 2;
  ctx.font = `800 ${size}px ${DISPLAY}`;
  const wr = ctx.measureText(reais).width;
  const small = size * 0.4;
  const total = wr + small * 1.9; // "R$" à esquerda + centavos à direita
  const x0 = cx - total / 2;
  const dy = oldPrice ? R * 0.1 : 0; // com preço original, o preço novo desce um pouco
  ctx.fillStyle = c.badgeText;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `800 ${small}px ${DISPLAY}`;
  ctx.fillText("R$", x0, cy - size * 0.12 + dy);
  ctx.font = `800 ${size}px ${DISPLAY}`;
  ctx.fillText(reais, x0 + small * 1.15, cy + size * 0.36 + dy);
  ctx.font = `800 ${small * 1.05}px ${DISPLAY}`;
  ctx.fillText(
    `,${centavos}`,
    x0 + small * 1.15 + wr + 2,
    cy - size * 0.12 + dy,
  );
  if (oldPrice) {
    // "DE R$ 99,99" riscado, no alto do selo
    const op = priceParts(oldPrice);
    const t = `DE R$ ${op.reais},${op.centavos}`;
    const fs = R * 0.2;
    ctx.font = `700 ${fs}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ty = cy - R * 0.5;
    ctx.globalAlpha = 0.9;
    ctx.fillText(t, cx, ty);
    ctx.globalAlpha = 1;
    const tw = ctx.measureText(t).width;
    ctx.strokeStyle = c.badgeText;
    ctx.lineWidth = Math.max(2, fs * 0.09);
    ctx.beginPath();
    ctx.moveTo(cx - tw / 2 - 2, ty);
    ctx.lineTo(cx + tw / 2 + 2, ty);
    ctx.stroke();
  }
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  theme: ThemeConfig,
  art: HTMLImageElement | null,
  text: string,
): void {
  const c = theme.colors;
  if (art) {
    // etiqueta pronta (ex.: "Uaau!" com o rostinho)
    const s = (R * 1.15) / art.width;
    ctx.drawImage(
      art,
      cx - (art.width * s) / 2,
      cy - (art.height * s) / 2,
      art.width * s,
      art.height * s,
    );
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.07);
  const fs = R * 0.3;
  ctx.font = `800 ${fs}px ${DISPLAY}`;
  const tw = ctx.measureText(text).width + fs * 0.9,
    th = fs * 1.35;
  ctx.fillStyle = c.tag;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = fs * 0.1;
  roundRect(ctx, -tw / 2, -th / 2, tw, th, th * 0.32);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.tagText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, fs * 0.04);
  ctx.restore();
}

// ---------- utilidades de desenho ----------
const shiftRect = (r: Rect, dx: number, dy: number): Rect => ({
  x: r.x + dx,
  y: r.y + dy,
  w: r.w,
  h: r.h,
});
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: Rect,
  alpha: number,
): void {
  const s = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * s,
    h = img.height * s;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h), w, h); // encostado embaixo: o produto "pisa" no preço
  ctx.globalAlpha = 1;
}
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s,
    ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Não consegui gerar a imagem.")),
      "image/png",
    ),
  );
}
