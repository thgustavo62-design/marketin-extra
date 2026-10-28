import { normalizeKit } from "../domain/promo-brand";
import { normalizeTheme, type PromoOverrides } from "../domain/promo";
import {
  isModelColor,
  pharmacyModel,
  pharmacyModelTheme,
} from "../domain/pharmacy-models";
import { pool } from "../db";

export type ModelSelection = {
  modelKey?: string;
  primary?: string;
  accent?: string;
  useBrandColors?: boolean;
};

export async function modelBrandColors(
  companyId: string | null,
): Promise<string[]> {
  if (!companyId) return [];
  const row = (
    await pool.query("select colors from brand_kits where brand_id=$1", [
      companyId,
    ])
  ).rows[0];
  return normalizeKit(row).colors.map((c) => c.hex);
}

/** The caller passes the campaign's authoritative company, never a frontend replacement. */
export async function campaignModel(
  selection: ModelSelection,
  companyId: string | null,
  db: Pick<typeof pool, "query"> = pool,
): Promise<PromoOverrides["model"]> {
  if (!selection.modelKey) return undefined;
  const model = pharmacyModel(selection.modelKey);
  if (!model) throw Error("Escolha um modelo global válido.");
  if (!companyId)
    throw Error(
      "Selecione a empresa da campanha antes de usar um modelo global.",
    );
  const company = (
    await db.query("select name from companies where id=$1", [companyId])
  ).rows[0];
  if (!company) throw Error("Empresa não disponível.");
  let primary = selection.primary,
    accent = selection.accent;
  for (const value of [primary, accent])
    if (value && !isModelColor(value))
      throw Error("Cor inválida. Use #RRGGBB.");
  if (selection.useBrandColors) {
    const row = (
      await db.query("select colors from brand_kits where brand_id=$1", [
        companyId,
      ])
    ).rows[0];
    const colors = normalizeKit(row).colors;
    primary = colors[0]?.hex ?? primary;
    accent = colors[1]?.hex ?? accent;
  }
  const theme = pharmacyModelTheme(model.key, normalizeTheme({}), {
    primary,
    accent,
  });
  theme.footerLines = [String(company.name).slice(0, 80)];
  return { key: model.key, version: 1, theme };
}
