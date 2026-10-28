import type { ThemeConfig } from "../domain/promo.ts";
import { modelInk } from "../domain/pharmacy-models.ts";

/** Vector-only original artwork, shared by preview, export and editable SVG import. */
export function drawPharmacyBackground(
  ctx: CanvasRenderingContext2D,
  theme: ThemeConfig,
  w: number,
  h: number,
) {
  const v = theme.visual;
  if (!v) return;
  ctx.save();
  ctx.fillStyle = theme.colors.skyBottom;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = theme.colors.skyTop;
  if (v.style === "daily" || v.style === "energy") {
    for (let i = -2; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * 0.25, 0);
      ctx.lineTo(i * w * 0.25 + w * 0.1, 0);
      ctx.lineTo(i * w * 0.25 + w * 0.85, h);
      ctx.lineTo(i * w * 0.25 + w * 0.75, h);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    for (const [x, y, r] of [
      [-0.05, 0.45, 0.18],
      [1.06, 0.72, 0.22],
      [0.88, 0.08, 0.25],
    ]) {
      ctx.beginPath();
      ctx.arc(w * x, h * y, w * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function fitLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  weight = 800,
  family = '"PromoText", sans-serif',
) {
  let fontSize = size;
  ctx.font = `${weight} ${fontSize}px ${family}`;
  while (ctx.measureText(text).width > width && fontSize > 12) {
    fontSize -= 1;
    ctx.font = `${weight} ${fontSize}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

export function drawPharmacyHeader(
  ctx: CanvasRenderingContext2D,
  theme: ThemeConfig,
  w: number,
  h: number,
  rawTitle: string,
  validity: string | null,
) {
  const visual = theme.visual!;
  const c = theme.colors;
  ctx.save();
  ctx.fillStyle = c.skyTop;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c.badge;
  ctx.globalAlpha = visual.style === "impact" ? 0.3 : 0.16;
  if (visual.style === "beauty") {
    ctx.fillRect(w * 0.84, 0, w * 0.16, h);
    ctx.fillRect(w * 0.79, 0, w * 0.015, h);
  } else if (visual.style === "energy" || visual.style === "daily") {
    ctx.beginPath();
    ctx.moveTo(w * 0.83, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(w * 0.64, h);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(w * 0.98, h * 0.25, w * 0.23, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.06, -h * 0.38, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.badge;
  ctx.fillRect(w * 0.065, h * 0.14, w * 0.08, h * 0.025);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = modelInk(c.skyTop);
  fitLine(ctx, visual.eyebrow, w * 0.065, h * 0.26, w * 0.84, w * 0.021, 700);
  const title = rawTitle.toLocaleUpperCase("pt-BR").replace(/\s+/g, " ").trim();
  const words = title.split(" ");
  const split = words.length >= 3 ? Math.ceil(words.length / 2) : words.length;
  const lines =
    words.length >= 3
      ? [words.slice(0, split).join(" "), words.slice(split).join(" ")]
      : [title];
  const family =
    visual.style === "beauty" ? "Georgia, serif" : '"PromoText", sans-serif';
  lines.forEach((line, i) =>
    fitLine(
      ctx,
      line,
      w * 0.065,
      h * (lines.length === 1 ? 0.54 : 0.46 + i * 0.23),
      w * 0.85,
      w * 0.072,
      900,
      family,
    ),
  );
  if (validity)
    fitLine(
      ctx,
      validity.toLocaleUpperCase("pt-BR"),
      w * 0.065,
      h * 0.89,
      w * 0.86,
      w * 0.022,
      700,
    );
  ctx.restore();
}
