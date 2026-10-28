import { withTx } from "../db.ts";
import { normalizeOverrides, type PromoOverrides } from "../domain/promo.ts";
import {
  appearanceEditVersion,
  appearanceSelection,
  updateModelAppearance,
  type AppearanceSelection,
} from "../domain/campaign-appearance.ts";
import { logItemChange, snapshotVersion } from "./history.ts";

type Result =
  | { ok: true; version: string; overrides: PromoOverrides }
  | { ok: false; status: number; error: string };

/** Caller authenticates; restricted runtime queries enforce campaign/company RLS. */
export async function saveCampaignAppearance(
  id: string,
  selection: AppearanceSelection,
  expectedVersion: string,
  userId: string,
): Promise<Result> {
  return withTx(async (db) => {
    const current = (
      await db.query(
        "select brand_id,kind,overrides from promo_campaigns where id=$1 for update",
        [id],
      )
    ).rows[0];
    if (!current)
      return { ok: false, status: 404, error: "Campanha não encontrada." };
    const overrides = normalizeOverrides(current.overrides);
    if (current.kind !== "promocao" || !current.brand_id || !overrides.model)
      return {
        ok: false,
        status: 422,
        error:
          "Esta opção está disponível nas campanhas com modelo genérico. A identidade própria da empresa foi preservada.",
      };
    const model = updateModelAppearance(overrides.model, selection);
    const next = { ...overrides, model };
    const version = appearanceEditVersion(next),
      before = appearanceEditVersion(overrides);
    // A timed-out request may already have committed. Its exact retry is safe.
    if (version === before) return { ok: true, version, overrides };
    if (expectedVersion !== before)
      return {
        ok: false,
        status: 409,
        error:
          "O visual mudou em outra aba. Recarregue a página para conferir antes de salvar.",
      };
    await snapshotVersion(
      db,
      id,
      "manual",
      "Antes de alterar o visual da campanha",
      userId,
    );
    await logItemChange(db, {
      campaignId: id,
      itemId: null,
      itemName: "Visual da campanha",
      userId,
      field: "modelo, cores e etiqueta",
      oldV: JSON.stringify(appearanceSelection(overrides.model)),
      newV: JSON.stringify(selection),
    });
    await db.query(
      "update promo_campaigns set overrides=$2::jsonb,updated_at=now(),status='rascunho',approved_by=null,approved_at=null where id=$1",
      [id, JSON.stringify(next)],
    );
    return { ok: true, version, overrides: next };
  });
}
