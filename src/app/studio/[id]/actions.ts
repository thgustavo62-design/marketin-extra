"use server";
import { writerOrError } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/form";
import { saveStudioPage, addStudioDesignPage } from "@/lib/studio/store";
export async function saveStudioAction(input: {
  id: string;
  format: string;
  page: number;
  scene: unknown;
  expectedRevision: number;
  expectedSourceHash: string;
  documentSourceHash: string;
}) {
  const g = await writerOrError();
  if (!g.ok) return { ok: false, error: g.error };
  if (!isUuid(input.id)) return { ok: false, error: "Arte inválida." };
  try {
    const r = await saveStudioPage({ ...input, userId: g.user.id });
    if (r.ok) {
      revalidatePath("/criacao");
      revalidatePath("/promocoes");
    }
    return r;
  } catch (e) {
    return {
      ok: false,
      error:
        (e as { code?: string }).code === "42P01"
          ? "O banco precisa receber a migração 034_nova7_studio antes de salvar."
          : "Não foi possível salvar. Sua edição continua aberta; tente novamente.",
    };
  }
}
export async function addStudioPageAction(id: string) {
  const g = await writerOrError();
  if (!g.ok) return { ok: false, error: g.error };
  if (!isUuid(id)) return { ok: false, error: "Arte inválida." };
  return addStudioDesignPage(id);
}
