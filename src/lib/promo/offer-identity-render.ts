import {
  dynamicPriceParts,
  fitPrice,
  safeRibbonText,
  type OfferIdentity,
} from "../domain/offer-identity.ts";
import type { Rect } from "../domain/promo.ts";
const FONT = '"PromoText", Montserrat, sans-serif';
function rounded(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}
/** Native paths and independent fillText become editable objects through the existing SVG → Fabric bridge. */
export function drawGlossyPrice(
  c: CanvasRenderingContext2D,
  box: Rect,
  price: number,
  cfg: OfferIdentity,
) {
  dynamicPriceParts(price);
  c.save();
  c.translate(box.x + box.w / 2, box.y + box.h / 2);
  c.rotate((cfg.angle * Math.PI) / 180);
  const w = box.w,
    h = box.h,
    x = -w / 2,
    y = -h / 2;
  c.shadowColor = "rgba(91,39,0,.3)";
  c.shadowBlur = h * 0.035;
  c.shadowOffsetY = h * 0.035;
  let g = c.createLinearGradient(0, y + h * 0.25, 0, y + h);
  g.addColorStop(0, "#fff174");
  g.addColorStop(0.25, "#fff000");
  g.addColorStop(0.8, "#ffdf00");
  g.addColorStop(1, "#ffbc00");
  rounded(c, x, y + h * 0.2, w, h * 0.8, h * 0.1);
  c.fillStyle = g;
  c.fill();
  c.shadowColor = "transparent";
  c.lineWidth = h * 0.035;
  c.strokeStyle = "#ef9800";
  c.stroke();
  rounded(c, x + h * 0.025, y + h * 0.22, w - h * 0.05, h * 0.73, h * 0.08);
  c.strokeStyle = "rgba(255,255,255,.65)";
  c.lineWidth = h * 0.012;
  c.stroke();
  g = c.createLinearGradient(0, y, 0, y + h * 0.36);
  g.addColorStop(0, "#ff6264");
  g.addColorStop(0.18, "#ff1724");
  g.addColorStop(0.55, "#eb0014");
  g.addColorStop(1, "#a9000e");
  rounded(c, x + w * 0.08, y, w * 0.84, h * 0.32, h * 0.09);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = h * 0.012;
  c.strokeStyle = "#ff9293";
  c.stroke();
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `italic 900 ${h * 0.225}px ${FONT}`;
  c.fillText("APENAS", 0, y + h * 0.16);
  const measure = (t: string, n: number) => {
    c.font = `italic 900 ${n}px ${FONT}`;
    return c.measureText(t).width;
  };
  const p = fitPrice(
    (h * 0.63 * cfg.priceScale) / 100,
    w * 0.85,
    measure,
    price,
    (w * cfg.centsGap) / 100,
  );
  let px = -p.width / 2;
  const baseline = y + h * 0.86;
  c.fillStyle = "#080808";
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.font = `italic 900 ${p.size * 0.25}px ${FONT}`;
  c.fillText(p.currency, px, baseline - p.size * 0.26);
  px += measure(p.currency, p.size * 0.25) + p.size * 0.08;
  c.font = `italic 900 ${p.size}px ${FONT}`;
  c.fillText(p.reais, px, baseline);
  px += measure(p.reais, p.size) + p.gap;
  c.font = `italic 900 ${p.size * 0.4}px ${FONT}`;
  c.fillText(p.separator, px, baseline - p.size * 0.42);
  px += measure(p.separator, p.size * 0.4);
  c.fillText(p.cents, px, baseline - p.size * 0.42);
  c.restore();
}
export function drawGoldRibbon(
  c: CanvasRenderingContext2D,
  r: Rect,
  text: string,
  confirmed = false,
) {
  c.save();
  const y = r.y,
    h = r.h,
    w = r.w,
    x = r.x;
  c.fillStyle = "#97600a";
  c.beginPath();
  c.moveTo(x, y + h * 0.15);
  c.lineTo(x + w * 0.14, y + h * 0.2);
  c.lineTo(x + w * 0.14, y + h);
  c.lineTo(x, y + h * 0.85);
  c.lineTo(x + w * 0.04, y + h * 0.5);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(x + w, y + h * 0.15);
  c.lineTo(x + w * 0.86, y + h * 0.2);
  c.lineTo(x + w * 0.86, y + h);
  c.lineTo(x + w, y + h * 0.85);
  c.lineTo(x + w * 0.96, y + h * 0.5);
  c.closePath();
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#fff4b3");
  g.addColorStop(0.25, "#f7d16a");
  g.addColorStop(0.5, "#cf920d");
  g.addColorStop(0.72, "#ffe297");
  g.addColorStop(1, "#a66d00");
  rounded(c, x + w * 0.07, y, w * 0.86, h * 0.8, h * 0.04);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "#fff0a3";
  c.lineWidth = h * 0.025;
  c.stroke();
  const t = safeRibbonText(text, confirmed);
  let fs = h * 0.38;
  c.font = `italic 900 ${fs}px ${FONT}`;
  while (c.measureText(t).width > w * 0.78 && fs > 2) {
    fs -= 0.5;
    c.font = `italic 900 ${fs}px ${FONT}`;
  }
  c.fillStyle = "#171408";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(t, x + w * 0.5, y + h * 0.4);
  c.restore();
}
export function drawOfferDescription(
  c: CanvasRenderingContext2D,
  r: Rect,
  text: string,
  scale: number,
) {
  c.save();
  c.fillStyle = "#080808";
  c.textAlign = "center";
  c.textBaseline = "top";
  let fs = (r.w * 0.075 * scale) / 100,
    lines: string[] = [];
  const words = text.toLocaleUpperCase("pt-BR").split(/\s+/);
  for (let attempt = 0; attempt < 50; attempt++) {
    c.font = `900 ${fs}px ${FONT}`;
    lines = [""];
    for (const word of words) {
      let last = lines.length - 1;
      if (
        c.measureText((lines[last] + " " + word).trim()).width > r.w &&
        lines[last]
      )
        lines.push(word);
      else lines[last] = (lines[last] + " " + word).trim();
    }
    if (
      lines.length * fs * 1.04 <= r.h &&
      lines.every((l) => c.measureText(l).width <= r.w)
    )
      break;
    fs *= 0.94;
  }
  // Fit before drawing. A per-text canvas clip becomes a relative Fabric clip
  // after SVG import and cuts off the first line when Text turns into IText.
  // The measured wrapping above already keeps every line inside this region.
  lines.forEach((l, i) => c.fillText(l, r.x + r.w / 2, r.y + i * fs * 1.04));
  c.restore();
}
