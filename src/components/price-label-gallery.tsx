"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRICE_LABELS, type PriceLabelId } from "@/lib/domain/price-labels";
import { parsePrice } from "@/lib/domain/promo";
export function PriceLabelPreview({
  style,
  price,
}: {
  style: PriceLabelId;
  price: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      import("@/lib/promo/price-label-render"),
      import("@/lib/promo/fonts-loader").then((m) => m.loadPromoFonts()),
    ]).then(([m]) => {
      if (!active || !canvas.current) return;
      const ctx = canvas.current.getContext("2d")!;
      ctx.clearRect(0, 0, 500, 180);
      m.drawPriceLabel(ctx, { x: 25, y: 30, w: 450, h: 120 }, price, {
        style,
        primary: "#175E54",
        accent: "#FFE16B",
      });
    });
    return () => {
      active = false;
    };
  }, [style, price]);
  return (
    <canvas
      ref={canvas}
      width={500}
      height={180}
      role="img"
      aria-label={`Prévia da etiqueta ${style}`}
      style={{ width: "100%", height: "auto" }}
    />
  );
}
export function PriceLabelGallery({ canEdit }: { canEdit: boolean }) {
  const [raw, setRaw] = useState("29,99");
  const price = parsePrice(raw);
  return (
    <section aria-label="Biblioteca de etiquetas">
      <div className="design-section-head">
        <div>
          <span className="design-kicker">10 ETIQUETAS PRONTAS</span>
          <h2>Uma oferta, diferentes destaques.</h2>
          <p>Preços dinâmicos, cores da campanha e elementos editáveis.</p>
        </div>
        <label>
          Preço para prévia
          <input
            aria-label="Preço para prévia das etiquetas"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
      </div>
      {price === null && (
        <p role="alert">
          Informe um valor válido. A prévia mantém o exemplo de R$ 29,99.
        </p>
      )}
      <div className="price-label-grid">
        {PRICE_LABELS.map((l) => (
          <article className="card" key={l.id} data-price-label={l.id}>
            <PriceLabelPreview style={l.id} price={price ?? 29.99} />
            <h3>{l.name}</h3>
            <p className="muted">{l.description}</p>
            {canEdit && (
              <Link
                className="btn primary-link"
                href={`/promocoes/importar?modelo=ofertas-impacto&etiqueta=${l.id}`}
              >
                Usar esta etiqueta
              </Link>
            )}
          </article>
        ))}
      </div>
      <p className="muted">
        Valores ilustrativos. Escolha também a etiqueta ao gerar a campanha ou
        editar uma oferta de modelo genérico.
      </p>
    </section>
  );
}
