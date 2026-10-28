"use client";
import { useEffect, useRef, useState } from "react";
import type { PromoFormat } from "@/lib/domain/promo";

export function CampaignModelPreview({
  modelKey,
  primary,
  accent,
  priceLabel,
  format = "feed",
}: {
  modelKey: string;
  primary?: string;
  accent?: string;
  priceLabel?: string;
  format?: PromoFormat;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setFailed(false);
    void import("@/lib/promo/model-preview")
      .then(async ({ drawModelPreview }) => {
        if (active && canvas.current)
          await drawModelPreview(
            canvas.current,
            { modelKey, primary, accent, format, priceLabel },
            () => active,
          );
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [visible, modelKey, primary, accent, format, priceLabel]);
  return (
    <div className="campaign-model-preview">
      <canvas
        ref={canvas}
        width={216}
        height={270}
        role="img"
        aria-label={`Prévia ilustrativa do modelo ${modelKey}`}
        data-model-preview={modelKey}
      />
      {failed && (
        <span role="status">
          Prévia indisponível. Tente abrir o modelo novamente.
        </span>
      )}
      <small>Produtos e preços ilustrativos</small>
    </div>
  );
}
