"use server";
import { revalidatePath } from "next/cache";
import { writerOrError, audit } from "@/lib/auth";
import { companyAdmin } from "@/lib/tenancy/service";
import { pool } from "@/lib/db";
import { isUuid, type FormState } from "@/lib/form";
import { normalizeGroupingRules } from "@/lib/domain/promotion-review";
export async function saveGroupingRules(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  const brandId = String(fd.get("brand_id")),
    revision = Number(fd.get("revision"));
  if (!isUuid(brandId) || !Number.isInteger(revision))
    return { error: "Empresa ou versão inválida." };
  if (!(await companyAdmin(brandId)))
    return {
      error: "Somente administradores desta empresa alteram suas regras.",
    };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("config")));
  } catch {
    return { error: "Regras inválidas." };
  }
  const rules = normalizeGroupingRules(raw);
  const r =
    revision === 0
      ? await pool.query(
          "insert into promo_grouping_rules(brand_id,config,updated_by) values($1,$2::jsonb,$3) on conflict do nothing returning revision",
          [brandId, JSON.stringify(rules), g.user.id],
        )
      : await pool.query(
          "update promo_grouping_rules set config=$2::jsonb,revision=revision+1,updated_by=$3,updated_at=now() where brand_id=$1 and revision=$4 returning revision",
          [brandId, JSON.stringify(rules), g.user.id, revision],
        );
  if (!r.rowCount)
    return {
      error:
        "Estas regras foram alteradas em outra sessão. Recarregue a página.",
    };
  await audit("promocao_regras_salvas", { userId: g.user.id, target: brandId });
  revalidatePath("/promocoes/regras");
  return {
    ok: "Regras salvas para as próximas importações. Rascunhos existentes preservam as regras originais.",
  };
}
