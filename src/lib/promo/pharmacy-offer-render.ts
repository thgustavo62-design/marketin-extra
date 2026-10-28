import type { Rect, ThemeConfig } from "../domain/promo.ts";
import { drawPriceLabel } from "./price-label-render.ts";
import type { RenderItem } from "./render.ts";

const FONT = '"PromoText", Montserrat, sans-serif';
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" "),
    lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (ctx.measureText(word).width > max) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const letter of word) {
        if (line && ctx.measureText(line + letter).width > max) {
          lines.push(line);
          line = "";
        }
        line += letter;
      }
    } else if (line && ctx.measureText(line + " " + word).width > max) {
      lines.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines;
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  box: Rect,
  initial: number,
  weight: number,
  color: string,
  align: CanvasTextAlign = "center",
) {
  let size = initial,
    lines: string[] = [];
  for (;;) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    lines = wrap(ctx, value, box.w);
    if (lines.length * size * 1.12 <= box.h || size <= 8) break;
    size -= 1;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const lh = size * 1.12,
    top = box.y + (box.h - lines.length * lh) / 2;
  lines.forEach((line, i) =>
    ctx.fillText(
      line,
      align === "left"
        ? box.x
        : align === "right"
          ? box.x + box.w
          : box.x + box.w / 2,
      top + (i + 0.5) * lh,
    ),
  );
}

/** Photo, description and price occupy disjoint bands in the generic models. */
export function drawPharmacyOffer(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  item: RenderItem,
  theme: ThemeConfig,
) {
  ctx.save();
  const tag = item.style?.tag ?? theme.tagText;
  if ((item.style?.tag !== undefined ? !!item.style.tag : theme.showTag) && tag)
    text(
      ctx,
      tag,
      {
        x: r.x + r.w * 0.08,
        y: r.y + r.h * 0.012,
        w: r.w * 0.84,
        h: r.h * 0.035,
      },
      r.w * 0.028,
      800,
      theme.colors.tag,
    );
  const photos = (
    item.imgs?.length ? item.imgs : item.img ? [item.img] : []
  ).slice(0, 2);
  const photo = {
    x: r.x + r.w * 0.09,
    y: r.y + r.h * 0.055,
    w: r.w * 0.82,
    h: r.h * 0.42,
  };
  photos.forEach((img, i) => {
    const slot = photo.w / photos.length,
      scale = Math.min((slot * 0.9) / img.width, photo.h / img.height),
      w = img.width * scale,
      h = img.height * scale;
    ctx.drawImage(
      img,
      photo.x + i * slot + (slot - w) / 2,
      photo.y + (photo.h - h) / 2,
      w,
      h,
    );
  });
  if (!photos.length) text(ctx, "SEM FOTO", photo, r.w * 0.04, 700, "#6B7280");
  if (item.sizes?.length)
    text(
      ctx,
      item.sizes
        .map((s) => `${s.label}${s.units === null ? "" : `: ${s.units} UN`}`)
        .join(" • "),
      {
        x: r.x + r.w * 0.07,
        y: r.y + r.h * 0.475,
        w: r.w * 0.86,
        h: r.h * 0.06,
      },
      r.w * 0.033,
      700,
      theme.colors.name,
    );
  text(
    ctx,
    item.name.toLocaleUpperCase("pt-BR"),
    {
      x: r.x + r.w * 0.075,
      y: r.y + r.h * 0.54,
      w: r.w * 0.85,
      h: r.h * (item.note ? 0.12 : 0.18),
    },
    r.w * 0.06 * ((item.style?.nameScale ?? 100) / 100),
    800,
    theme.colors.name,
    item.style?.nameAlign ?? "center",
  );
  if (item.note)
    text(
      ctx,
      item.note,
      {
        x: r.x + r.w * 0.075,
        y: r.y + r.h * 0.67,
        w: r.w * 0.85,
        h: r.h * 0.065,
      },
      r.w * 0.032,
      600,
      theme.colors.name,
    );
  const box = {
    x: r.x + r.w * 0.075,
    y: r.y + r.h * 0.77,
    w: r.w * 0.85,
    h: r.h * 0.18,
  };
  drawPriceLabel(ctx, box, item.price, {
    style: item.style?.priceLabel ?? theme.priceLabel,
    primary: theme.colors.tag,
    accent: theme.colors.badge,
    priceColor: theme.colors.badgeText,
  });
  if (item.oldPrice && item.oldPrice > item.price)
    text(
      ctx,
      `DE R$ ${item.oldPrice.toFixed(2).replace(".", ",")}`,
      { x: box.x, y: r.y + r.h * 0.735, w: box.w, h: r.h * 0.03 },
      r.w * 0.028,
      600,
      theme.colors.name,
    );
  ctx.restore();
}
