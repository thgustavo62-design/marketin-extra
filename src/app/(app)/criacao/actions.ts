"use server";
import { revalidatePath } from "next/cache";
import { writerOrError, audit } from "@/lib/auth";
import { createPresetDesign } from "@/lib/studio/designs";
export async function createPresetAction(name: string, preset: string) {
  const g = await writerOrError();
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    const r = await createPresetDesign(name, preset, g.user.id);
    if (r.ok) {
      revalidatePath("/criacao");
      await audit("design_criado", {
        userId: g.user.id,
        target: r.id,
        meta: { preset },
      });
    }
    return r;
  } catch {
    return {
      ok: false as const,
      error: "Não foi possível criar o design. Tente novamente.",
    };
  }
}
