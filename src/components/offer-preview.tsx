"use client";
import { useEffect, useRef, useState } from "react";
import type { ThemeConfig } from "@/lib/domain/promo";
import type { PromoItem } from "@/lib/promo/store";

export function OfferPreview({
  item,
  theme,
  title,
  validity,
}: {
  item: Pick<
    PromoItem,
    | "name"
    | "price"
    | "note"
    | "style"
    | "photo_id"
    | "photo_image_ids"
    | "old_price"
  >;
  theme: ThemeConfig;
  title: string | null;
  validity: string | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState("");
  const photoIds = item.photo_image_ids?.length
    ? item.photo_image_ids.slice(0, 2)
    : item.photo_id
      ? [item.photo_id]
      : [];
  const photosKey = photoIds.join(",");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setError("");
      void import("@/lib/promo/render")
        .then(async ({ drawPage, loadPromoFonts, loadImage }) => {
          await loadPromoFonts();
          const images = await Promise.all(
            photosKey
              .split(",")
              .filter(Boolean)
              .map((id) =>
                Promise.race([
                  loadImage(`/api/produtos/imagem/${id}`),
                  new Promise<null>((resolve) =>
                    setTimeout(() => resolve(null), 15000),
                  ),
                ]),
              ),
          );
          if (!active || !canvas.current) return;
          if (images.some((x) => !x))
            setError("Uma foto não carregou. Confira a imagem no catálogo.");
          const imgs = images.filter((i): i is HTMLImageElement => !!i);
          const { campaignArtwork } = await import(
            "@/lib/promo/campaign-artwork"
          );
          const header = await campaignArtwork(theme);
          if (!active || !canvas.current) return;
          drawPage(canvas.current, {
            format: "feed",
            theme: {
              ...theme,
              grid: { ...theme.grid, feed: { cols: 1, rows: 1 } },
            },
            title,
            validity,
            assets: { header },
            items: [{ ...item, img: imgs[0] ?? null, imgs }],
          });
        })
        .catch(() => {
          if (active)
            setError(
              "Não foi possível carregar a prévia. Sua edição foi mantida.",
            );
        });
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    item.name,
    item.price,
    item.note,
    item.style,
    item.old_price,
    theme,
    title,
    validity,
    photosKey,
  ]);
  return (
    <div className="quick-offer-preview">
      <canvas
        ref={canvas}
        width={216}
        height={270}
        role="img"
        aria-label="Prévia da oferta em edição"
      />
      <small>Prévia individual. Confira a composição completa no Studio.</small>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
