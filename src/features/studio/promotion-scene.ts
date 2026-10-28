// Existing automatic layout -> SVG -> editable Fabric objects (not a flattened screenshot).
import { campaignArtwork } from "@/lib/promo/campaign-artwork";
import { fabric } from "fabric";
import { Context } from "svgcanvas";
import {
  applyOverrides,
  BLANK_THEME,
  normalizeTheme,
  paginateSections,
  PROMO_FORMATS,
  type PromoFormat,
} from "@/lib/domain/promo";
import { layersForPage } from "@/lib/domain/promo-layers";
import {
  drawPage,
  loadImage,
  loadFonts,
  loadPromoFonts,
  type RenderAssets,
  type RenderBackground,
  type RenderItem,
} from "@/lib/promo/render";
import type { StudioSource } from "@/lib/studio/store";
import {
  relativeStudioImageSource,
  type StudioScene,
} from "@/lib/domain/studio";
import { JSON_KEYS } from "./types";
import { promotionPageCount } from "./page-count";
export { promotionPageCount } from "./page-count";
async function image(url: string): Promise<HTMLImageElement> {
  const img = await loadImage(url);
  if (!img)
    throw new Error(
      "Não foi possível carregar uma imagem da arte. Tente novamente para evitar uma importação incompleta.",
    );
  return img;
}
export async function promotionScene(
  source: StudioSource,
  format: PromoFormat,
  page: number,
): Promise<StudioScene> {
  const { campaign: c, theme, items } = source,
    design = c.kind !== "promocao";
  const config = design
      ? BLANK_THEME
      : applyOverrides(theme?.config ?? normalizeTheme({}), c.overrides),
    { w: W, h: H } = config.dimensions?.[format] ?? PROMO_FORMATS[format];
  const find = (role: string) =>
      theme?.assets.find((a) => a.role === role && a.format === format),
    shared = (role: string) =>
      find(role) ?? theme?.assets.find((a) => a.role === role);
  const get = async (role: string) => {
    const a = role === "tag" || role === "badge" ? shared(role) : find(role);
    return !design && a
      ? image(`/api/promocoes/tema/${theme!.id}/${role}/${a.format}`)
      : null;
  };
  await loadPromoFonts();
  const [background, header, footer, badge, tag] = await Promise.all(
      ["background", "header", "footer", "badge", "tag"].map(get),
    ),
    assets: RenderAssets = { background, header, footer, badge, tag };
  assets.header = (await campaignArtwork(config)) ?? assets.header;
  const g = config.grid[format],
    pages = design
      ? []
      : paginateSections(items, g.cols * g.rows, config.breakBySection[format]),
    count = promotionPageCount(source, format);
  if (page < 0 || page >= count)
    throw new Error("Essa página não existe na arte.");
  const renderItems: RenderItem[] = await Promise.all(
    (pages[page] ?? []).map(async (it) => {
      const v = it.variants,
        options =
          v?.kind === "options" && v.show === true
            ? v.members.map((m) => m.variant).join(" · ")
            : null;
      return {
        name: it.name,
        price: it.price,
        oldPrice: it.old_price,
        style: it.style,
        note: [it.note, options].filter(Boolean).join(" · ") || null,
        imgs: await Promise.all(
          (it.photo_image_ids ?? []).map((id) =>
            image(`/api/produtos/imagem/${id}`),
          ),
        ),
        img: it.photo_id
          ? await image(`/api/produtos/imagem/${it.photo_id}`)
          : null,
        sizes:
          v?.kind === "sizes" && v.show !== false
            ? v.rows.map((r) => ({ label: r.label, units: r.units }))
            : undefined,
      };
    }),
  );
  const choice = c.overrides.background;
  let bg: RenderBackground | null = null;
  if (choice?.kind === "preset" || choice?.kind === "color") bg = choice;
  else if (choice?.kind === "asset")
    bg = {
      kind: "image",
      img: await image(`/api/promocoes/asset/${choice.asset}`),
    };
  else if (choice?.kind === "theme") {
    const tb = c.themeBackgrounds.find((t) => t.id === choice.themeId),
      fmt = tb?.formats.includes(format) ? format : tb?.formats[0];
    if (fmt)
      bg = {
        kind: "image",
        img: await image(
          `/api/promocoes/tema/${choice.themeId}/background/${fmt}`,
        ),
      };
  }
  const layers = layersForPage(c.layers[format], page),
    hide = c.overrides.hideFixed ?? [],
    fixed = design
      ? []
      : layersForPage(
          (theme?.fixed[format] ?? []).filter((l) => !hide.includes(l.id)),
          page,
          count,
        );
  await loadFonts([...layers, ...fixed].map((l) => l.font));
  const layerImages: Record<string, HTMLImageElement | null> = {},
    fixedImages: Record<string, HTMLImageElement | null> = {};
  await Promise.all(
    [...new Set(layers.flatMap((l) => (l.asset ? [l.asset] : [])))].map(
      async (id) => {
        layerImages[id] = await image(`/api/promocoes/asset/${id}`);
      },
    ),
  );
  await Promise.all(
    [...new Set(fixed.flatMap((l) => (l.asset ? [l.asset] : [])))].map(
      async (id) => {
        fixedImages[id] = await image(`/api/promocoes/tema-arte/${id}`);
      },
    ),
  );
  const ctx = new Context(W, H),
    virtual = {
      width: W,
      height: H,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
  drawPage(virtual, {
    format,
    theme: config,
    title: c.title,
    validity: c.validity,
    extraText: c.overrides.extraText,
    assets,
    items: renderItems,
    bg,
    layers,
    layerImages,
    fixed: {
      under: fixed.filter((l) => l.under),
      over: fixed.filter((l) => !l.under),
      images: fixedImages,
    },
  });
  const objects = await new Promise<fabric.Object[]>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("A importação demorou demais. Tente novamente.")),
      30000,
    );
    fabric.loadSVGFromString(ctx.getSerializedSvg(true), (all) => {
      clearTimeout(timeout);
      resolve(all.filter(Boolean));
    });
  });
  const serialized: Record<string, unknown>[] = [],
    texts = new Map<string, number>();
  for (const o of objects) {
    const v = o.toObject(JSON_KEYS) as Record<string, unknown>;
    if (o.type === "image") {
      const local = relativeStudioImageSource(v.src, window.location.origin);
      if (local) v.src = local;
    }
    if (o.type === "text") {
      v.type = "i-text";
      const key = JSON.stringify([v.text, v.left, v.top, v.fontSize, v.angle]),
        prior = texts.get(key);
      if (prior !== undefined) {
        const before = serialized[prior];
        if (!v.stroke && before.stroke) {
          v.stroke = before.stroke;
          v.strokeWidth = before.strokeWidth;
        }
        serialized[prior] = v;
        continue;
      }
      texts.set(key, serialized.length);
    }
    v.name =
      o.type === "text"
        ? String(v.text ?? "Texto").slice(0, 60)
        : o.type === "image"
          ? "Foto / arte"
          : "Elemento";
    serialized.push(v);
  }
  const clip = new fabric.Rect({
    name: "clip",
    left: 0,
    top: 0,
    width: W,
    height: H,
    fill: "#ffffff",
    selectable: false,
    evented: false,
    hasControls: false,
  });
  return {
    version: fabric.version,
    objects: [clip.toObject(JSON_KEYS), ...serialized],
  };
}
