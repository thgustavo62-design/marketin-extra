import { blankDesignScene } from "../domain/design-presets";
import { createHash } from "node:crypto";
import { pool, withTx } from "../db";
import { getCampaign } from "../promo/store";
import {
  studioKey,
  validateStudioScene,
  type StudioPage,
} from "../domain/studio";
export type StudioSource = NonNullable<Awaited<ReturnType<typeof getCampaign>>>;
type SourceSnapshot = {
  campaign: Pick<
    StudioSource["campaign"],
    | "name"
    | "title"
    | "validity"
    | "kind"
    | "design_format"
    | "design_pages"
    | "layers"
    | "overrides"
  >;
  theme: StudioSource["theme"];
  items: StudioSource["items"];
};
export function sourceHash(data: SourceSnapshot): string {
  const { campaign: c, theme, items } = data;
  return createHash("sha256")
    .update(
      JSON.stringify({
        name: c.name,
        title: c.title,
        validity: c.validity,
        kind: c.kind,
        format: c.design_format,
        pages: c.design_pages,
        layers: c.layers,
        overrides: c.overrides,
        theme,
        items,
      }),
    )
    .digest("hex");
}
export async function getStudioPage(
  id: string,
  format: string,
  page: number,
): Promise<StudioPage | null> {
  if (!studioKey(format, page)) return null;
  return (
    (
      await pool.query(
        "select scene,revision,source_hash,updated_at::text from studio_pages where campaign_id=$1 and format=$2 and page=$3",
        [id, format, page],
      )
    ).rows[0] ?? null
  );
}
export async function saveStudioPage(o: {
  id: string;
  format: string;
  page: number;
  scene: unknown;
  expectedRevision: number;
  expectedSourceHash: string;
  documentSourceHash: string;
  userId: string;
}) {
  if (
    !studioKey(o.format, o.page) ||
    !Number.isSafeInteger(o.expectedRevision) ||
    o.expectedRevision < 0 ||
    !/^[a-f0-9]{64}$/.test(o.documentSourceHash)
  )
    return { ok: false, error: "Página inválida." };
  const valid = validateStudioScene(o.scene);
  if (!valid.ok) return valid;
  const data = await getCampaign(o.id);
  if (!data || data.campaign.kind === "template")
    return { ok: false, error: "Arte não encontrada." };
  if (sourceHash(data) !== o.expectedSourceHash)
    return {
      ok: false,
      conflict: true,
      error:
        "Os dados da promoção mudaram. Reabra a página para conferir e regenerar a arte.",
    };
  return withTx(async (db) => {
    if (
      !(
        await db.query(
          "select id from promo_campaigns where id=$1 for update",
          [o.id],
        )
      ).rowCount
    )
      return { ok: false, error: "Arte não encontrada." };
    const old = (
      await db.query(
        "select revision from studio_pages where campaign_id=$1 and format=$2 and page=$3 for update",
        [o.id, o.format, o.page],
      )
    ).rows[0];
    if ((old?.revision ?? 0) !== o.expectedRevision)
      return {
        ok: false,
        conflict: true,
        error:
          "Esta página foi salva em outra aba. Recarregue antes de continuar.",
      };
    const revision = o.expectedRevision + 1;
    await db.query(
      `insert into studio_pages(campaign_id,format,page,scene,revision,source_hash,updated_by) values($1,$2,$3,$4::jsonb,$5,$6,$7) on conflict(campaign_id,format,page) do update set scene=excluded.scene,revision=excluded.revision,source_hash=excluded.source_hash,updated_by=excluded.updated_by,updated_at=now()`,
      [
        o.id,
        o.format,
        o.page,
        JSON.stringify(valid.scene),
        revision,
        o.documentSourceHash,
        o.userId,
      ],
    );
    await db.query(
      "update promo_campaigns set status='rascunho',approved_by=null,approved_at=null,updated_at=now() where id=$1",
      [o.id],
    );
    return { ok: true, revision };
  });
}
export async function addStudioDesignPage(id: string) {
  return withTx(async (db) => {
    const row = (
      await db.query(
        "select design_pages from promo_campaigns where id=$1 and kind='design' for update",
        [id],
      )
    ).rows[0];
    if (!row) return { ok: false, error: "Design não encontrado." };
    if (row.design_pages >= 30)
      return { ok: false, error: "O limite é de 30 páginas." };
    await db.query(
      "update promo_campaigns set design_pages=design_pages+1,status='rascunho',approved_by=null,approved_at=null,updated_at=now() where id=$1",
      [id],
    );
    const first = (
      await db.query(
        "select format,scene,source_hash from studio_pages where campaign_id=$1 and page=0 limit 1",
        [id],
      )
    ).rows[0];
    const clip = first?.scene.objects?.find(
      (o: { name?: string }) => o.name === "clip",
    );
    if (clip)
      await db.query(
        "insert into studio_pages(campaign_id,format,page,scene,source_hash) values($1,$2,$3,$4::jsonb,$5)",
        [
          id,
          first.format,
          row.design_pages,
          JSON.stringify(blankDesignScene(clip.width, clip.height)),
          first.source_hash,
        ],
      );
    return { ok: true, page: row.design_pages as number };
  });
}
