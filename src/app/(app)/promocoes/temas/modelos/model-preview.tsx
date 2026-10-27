"use client";
import { useEffect, useRef } from "react";
import { normalizeTheme } from "@/lib/domain/promo";
import { drawPage, loadImage, loadPromoFonts } from "@/lib/promo/render";
export function ModelPreview({
  id,
  config,
  roles,
}: {
  id: string;
  config: unknown;
  roles: { role: string; format: string }[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    async function render() {
      await loadPromoFonts();
      const theme = normalizeTheme(config),
        grid = theme.grid.feed;
      const assets: Record<string, HTMLImageElement | null> = {};
      await Promise.all(
        ["background", "header", "footer", "badge", "tag"].map(async (role) => {
          const art =
            roles.find((a) => a.role === role && a.format === "feed") ??
            (["badge", "tag"].includes(role)
              ? roles.find((a) => a.role === role)
              : undefined);
          assets[role] = art
            ? await loadImage(`/api/promocoes/tema/${id}/${role}/${art.format}`)
            : null;
        }),
      );
      if (active && canvas.current)
        drawPage(canvas.current, {
          format: "feed",
          theme,
          title: "PRÉVIA DO LAYOUT",
          validity: null,
          assets,
          items: Array.from(
            { length: Math.min(30, grid.cols * grid.rows) },
            (_, i) => ({
              name: `PRODUTO EXEMPLO ${i + 1}`,
              price: 9.99,
              img: null,
            }),
          ),
        });
    }
    void render().catch(() => {});
    return () => {
      active = false;
    };
  }, [id, config, roles]);
  return (
    <canvas
      ref={canvas}
      width={1080}
      height={1350}
      aria-label="Prévia visual do layout com produtos de exemplo"
      style={{
        width: "100%",
        maxWidth: 260,
        height: "auto",
        borderRadius: 10,
        margin: "12px 0",
      }}
    />
  );
}
