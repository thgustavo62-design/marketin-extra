"use server";
import { revalidatePath } from "next/cache";
import { writerOrError, audit } from "@/lib/auth";
import {
  editReview,
  generateReviewed,
  type ReviewEdit,
} from "@/lib/promo/review-store";
import { isUuid } from "@/lib/form";
import { promoLayout } from "@/lib/domain/promo-layouts";
import type { ModelSelection } from "@/lib/promo/model-selection";
export async function changeReview(
  id: string,
  revision: number,
  edit: ReviewEdit,
) {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  if (
    !isUuid(id) ||
    !Number.isInteger(revision) ||
    !["approve", "edit", "merge", "split"].includes(edit.operation)
  )
    return { error: "Revisão inválida." };
  try {
    await editReview(id, revision, edit, g.user);
    await audit("promocao_revisada", {
      userId: g.user.id,
      target: id,
      meta: { operation: edit.operation },
    });
    revalidatePath(`/promocoes/revisao/${id}`);
    return { ok: true };
  } catch (e) {
    return {
      error:
        e instanceof Error && !("code" in e)
          ? e.message
          : "Não foi possível salvar a revisão.",
    };
  }
}
export async function generateReview(
  id: string,
  revision: number,
  opts: ModelSelection & {
    themeId?: string;
    layout: string;
    title: string;
    validity: string;
    square?: boolean;
    confirmed?: boolean;
  },
) {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  if (!opts.confirmed)
    return { error: "Confirme a revisão antes de gerar as artes." };
  if (!isUuid(id) || !promoLayout(opts.layout))
    return { error: "Revisão ou grade inválida." };
  try {
    const campaignId = await generateReviewed(id, revision, g.user, opts);
    await audit("promocao_revisao_gerada", {
      userId: g.user.id,
      target: campaignId,
    });
    revalidatePath("/promocoes");
    return { id: campaignId };
  } catch (e) {
    return {
      error:
        e instanceof Error && !("code" in e)
          ? e.message
          : "Não foi possível gerar a campanha.",
    };
  }
}
export async function refreshPhotos(id: string, revision: number) {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  if (!isUuid(id)) return { error: "Importação inválida." };
  try {
    const { refreshReviewPhotos } = await import("@/lib/promo/review-store");
    await refreshReviewPhotos(id, revision, g.user);
    revalidatePath(`/promocoes/revisao/${id}`);
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao atualizar fotos.",
    };
  }
}
export async function approveSelected(
  id: string,
  revision: number,
  ids: string[],
) {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  if (!isUuid(id) || !Array.isArray(ids)) return { error: "Seleção inválida." };
  try {
    const { approveSelectedGroups } = await import("@/lib/promo/review-store");
    await approveSelectedGroups(id, revision, ids, g.user);
    await audit("promocao_ofertas_aprovadas", {
      userId: g.user.id,
      target: id,
      meta: { count: ids.length },
    });
    revalidatePath(`/promocoes/revisao/${id}`);
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Não foi possível aprovar.",
    };
  }
}
