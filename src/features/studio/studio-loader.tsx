"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { persistSceneImages } from "./image-assets";
import type { StudioSource } from "@/lib/studio/store";
import type { StudioPage, StudioScene } from "@/lib/domain/studio";
import type { PromoFormat } from "@/lib/domain/promo";
import type { TemplateLite } from "@/lib/promo/store";
const Editor = dynamic(
  () => import("./studio-editor").then((m) => m.StudioEditor),
  {
    ssr: false,
    loading: () => (
      <div className="n7-studio">
        <div className="studio-loading">Abrindo editor…</div>
      </div>
    ),
  },
);
export type StudioLoaderProps = {
  source: StudioSource;
  format: PromoFormat;
  page: number;
  saved: StudioPage | null;
  sourceHash: string;
  canEdit: boolean;
  needsMigration: boolean;
  aiConfigured: {generate:boolean;removeBg:boolean};
  templates?: TemplateLite[];
};
export function StudioLoader(props: StudioLoaderProps) {
  const [scene, setScene] = useState<StudioScene | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (props.saved) {
        const { loadPromoFonts, loadFonts } = await import(
            "@/lib/promo/render"
          ),
          { PROMO_FONTS } = await import("@/lib/domain/promo-fonts");
        await loadPromoFonts();
        const families = JSON.stringify(props.saved.scene);
        await loadFonts(
          PROMO_FONTS.filter(
            (f) => f.family && families.includes(f.family),
          ).map((f) => f.id),
        );
        if (!cancelled) setScene(props.saved.scene);
      } else {
        const { promotionScene } = await import("./promotion-scene"),
          v = await promotionScene(props.source, props.format, props.page),
          scene =
            props.canEdit && !props.needsMigration
              ? await persistSceneImages(v, props.source.campaign.id, true)
              : v;
        if (!cancelled) setScene(scene);
      }
    })().catch((e) => {
      if (!cancelled)
        setError(e.message || "Não foi possível abrir esta arte.");
    });
    return () => {
      cancelled = true;
    };
  }, [
    props.saved,
    props.source,
    props.format,
    props.page,
    props.canEdit,
    props.needsMigration,
  ]);
  if (!scene)
    return (
      <div className="n7-studio">
        <div className="studio-loading">
          <h1>Encartiva Studio</h1>
          <p>{error || "Preparando os elementos editáveis da sua arte…"}</p>
          {error && (
            <>
              <Link href={`/promocoes/${props.source.campaign.id}?classico=1`}>
                Dados e geração automática
              </Link>
              <button onClick={() => location.reload()}>
                Tentar novamente
              </button>
            </>
          )}
        </div>
      </div>
    );
  return <Editor {...props} initialScene={scene} />;
}
