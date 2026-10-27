import { pool, withTx } from "../db";
import { designPreset, blankDesignScene } from "../domain/design-presets";
import { normalizeLayers } from "../domain/promo-layers";
import { normalizeOverrides } from "../domain/promo";
import { sourceHash } from "./store";
export async function createPresetDesign(
  nameInput: string,
  presetId: string,
  userId: string,
) {
  const preset = designPreset(presetId),
    name = nameInput.trim().replace(/\s+/g, " ");
  if (!preset || name.length < 2 || name.length > 120)
    return {
      ok: false as const,
      error: "Escolha um formato e um nome de 2 a 120 caracteres.",
    };
  return withTx(async (db) => {
    const c = (
      await db.query(
        "insert into promo_campaigns(name,kind,design_format,design_pages,created_by,overrides) values($1,'design',$2,$3,$4,$5::jsonb) returning *",
        [
          name,
          preset.format,
          preset.pages,
          userId,
          JSON.stringify({ background: { kind: "color", color: "#ffffff" } }),
        ],
      )
    ).rows[0];
    const snapshot = {
        campaign: {
          ...c,
          layers: normalizeLayers(c.layers),
          overrides: normalizeOverrides(c.overrides),
        },
        theme: null,
        items: [],
      },
      hash = sourceHash(snapshot);
    for (let page = 0; page < preset.pages; page++)
      await db.query(
        "insert into studio_pages(campaign_id,format,page,scene,source_hash,updated_by) values($1,$2,$3,$4::jsonb,$5,$6)",
        [
          c.id,
          preset.format,
          page,
          JSON.stringify(blankDesignScene(preset.width, preset.height)),
          hash,
          userId,
        ],
      );
    return { ok: true as const, id: c.id };
  });
}

export async function designResourceCounts() {
  const row = (
    await pool.query(
      "select count(*) filter(where kind='design')::int as designs,count(*) filter(where kind='template')::int as templates from promo_campaigns",
    )
  ).rows[0];
  return row as { designs: number; templates: number };
}
