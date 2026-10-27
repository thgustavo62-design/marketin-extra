"use server";
import { revalidatePath } from "next/cache";
import { writerOrError, audit } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isUuid } from "@/lib/form";
import {
  duplicateThemeModel,
  versionThemeModel,
  importThemeConfig,
} from "@/lib/promo/theme-models";
export async function themeModelAction(
  id: string,
  op: "duplicate" | "activate" | "deactivate" | "category",
  value = "",
) {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  if (
    !isUuid(id) ||
    !["duplicate", "activate", "deactivate", "category"].includes(op)
  )
    return { error: "Modelo inválido." };
  try {
    if (op === "duplicate") {
      const copied = await duplicateThemeModel(id, g.user.id);
      revalidatePath("/promocoes/temas");
      return { id: copied };
    }
    await versionThemeModel(id, g.user.id);
    if (op === "category")
      await pool.query("update promo_themes set category=$2 where id=$1", [
        id,
        value.trim().slice(0, 60) || "outro",
      ]);
    else
      await pool.query("update promo_themes set active=$2 where id=$1", [
        id,
        op === "activate",
      ]);
    await audit("promocao_layout_atualizado", {
      userId: g.user.id,
      target: id,
      meta: { operation: op },
    });
    revalidatePath("/promocoes/temas");
    return { ok: true };
  } catch {
    return { error: "Não foi possível atualizar o modelo." };
  }
}
export async function importModelConfig(name: string, raw: string) {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  if (raw.length > 100000)
    return {
      error:
        "Configuração acima de 100 KB. As imagens são enviadas separadamente no editor de layouts.",
    };
  try {
    const id = await importThemeConfig(name, JSON.parse(raw), g.user.id);
    revalidatePath("/promocoes/temas");
    return { id };
  } catch {
    return { error: "Configuração JSON inválida." };
  }
}
