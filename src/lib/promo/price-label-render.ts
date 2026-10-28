import { dynamicPriceParts } from "../domain/offer-identity.ts";
import { modelInk } from "../domain/pharmacy-models.ts";
import { type PriceLabelId } from "../domain/price-labels.ts";
import type { Rect } from "../domain/promo.ts";
const FONT = '"PromoText", Montserrat, sans-serif';
function rounded(ctx: CanvasRenderingContext2D, r: Rect, q: number) {
  const { x, y, w, h } = r;
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.lineTo(x + w - q, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + q);
  ctx.lineTo(x + w, y + h - q);
  ctx.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  ctx.lineTo(x + q, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - q);
  ctx.lineTo(x, y + q);
  ctx.quadraticCurveTo(x, y, x + q, y);
  ctx.closePath();
}
export function drawPriceLabel(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  price: number,
  options: {
    style?: PriceLabelId;
    primary: string;
    accent: string;
    priceColor?: string;
  },
) {
  const style = options.style ?? "rounded",
    { x, y, w, h } = box;
  let fill = options.accent,
    ink = options.priceColor ?? modelInk(fill);
  ctx.save();
  if (["solid", "flag", "slanted"].includes(style)) {
    fill = options.primary;
    ink = modelInk(fill);
  }
  if (["outline", "shelf"].includes(style)) {
    fill = "#FFFFFF";
    ink = "#111827";
  }
  if (style === "premium") {
    fill = "#111214";
    ink = "#FFFFFF";
  }
  ctx.fillStyle = fill;
  ctx.strokeStyle = style === "premium" ? options.accent : options.primary;
  ctx.lineWidth = Math.max(1, h * 0.025);
  if (style === "burst") {
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const a = (Math.PI * 2 * i) / 40,
        scale = i % 2 ? 0.94 : 1,
        px = x + w / 2 + ((Math.cos(a) * w) / 2) * scale,
        py = y + h / 2 + ((Math.sin(a) * h) / 2) * scale;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (style === "flag" || style === "slanted") {
    const p = w * 0.07;
    ctx.beginPath();
    ctx.moveTo(x + p, y);
    ctx.lineTo(x + w - (style === "flag" ? p : 0), y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - p, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  } else {
    rounded(ctx, box, style === "shelf" ? h * 0.03 : h * 0.2);
    ctx.fill();
    if (["outline", "premium", "shelf"].includes(style)) ctx.stroke();
    if (style === "ticket") {
      ctx.fillStyle = "#FFFFFF";
      for (const px of [x, x + w]) {
        ctx.beginPath();
        ctx.arc(px, y + h / 2, h * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (style === "shelf") {
      ctx.fillStyle = options.primary;
      ctx.fillRect(x, y, w * 0.07, h);
      ctx.fillStyle = options.accent;
      ctx.fillRect(x + w * 0.07, y, w * 0.025, h);
    }
    if (style === "gloss") {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "rgba(255,255,255,.5)");
      g.addColorStop(0.55, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(0,0,0,.16)");
      ctx.fillStyle = g;
      rounded(ctx, box, h * 0.2);
      ctx.fill();
    }
  }
  const p = dynamicPriceParts(price);
  let size = h * 0.68;
  const measure = () => {
    ctx.font = `900 ${size}px ${FONT}`;
    const integer = ctx.measureText(p.reais).width;
    ctx.font = `800 ${size * 0.43}px ${FONT}`;
    const cents = ctx.measureText("," + p.cents).width;
    ctx.font = `700 ${size * 0.28}px ${FONT}`;
    const currency = ctx.measureText("R$").width;
    return {
      integer,
      cents,
      currency,
      total: integer + cents + currency + size * 0.22,
    };
  };
  let m = measure();
  while (m.total > w * 0.78 && size > 8) {
    size -= 1;
    m = measure();
  }
  const left = x + (w - m.total) / 2,
    baseline = y + h * 0.79;
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${size * 0.28}px ${FONT}`;
  ctx.fillText("R$", left, baseline - size * 0.07);
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.fillText(p.reais, left + m.currency + size * 0.12, baseline);
  ctx.font = `800 ${size * 0.43}px ${FONT}`;
  ctx.fillText(
    "," + p.cents,
    left + m.currency + size * 0.12 + m.integer + size * 0.1,
    baseline - size * 0.48,
  );
  ctx.restore();
}
