import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { campaignAccess } from "@/lib/promo/access";
import { saveCampaignAppearance } from "@/lib/promo/campaign-appearance";
import { isModelColor, pharmacyModel } from "@/lib/domain/pharmacy-models";
import { isPriceLabel } from "@/lib/domain/price-labels";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user || user.mustChange)
    return reply({ error: "Entre novamente antes de salvar." }, 401);
  if (!sameOrigin(req)) return reply({ error: "Origem não permitida." }, 403);
  if (!canWrite(user.role))
    return reply({ error: "Seu perfil é somente leitura." }, 403);
  const { id } = await ctx.params;
  if (!isUuid(id)) return reply({ error: "Campanha inválida." }, 400);
  try {
    if (!(await campaignAccess(id)))
      return reply({ error: "Campanha não encontrada." }, 404);
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Envio vazio." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24000) {
        await reader.cancel();
        return reply({ error: "Envio muito grande." }, 413);
      }
      chunks.push(value);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      !pharmacyModel(input.modelKey) ||
      !isModelColor(input.primary) ||
      !isModelColor(input.accent) ||
      !isPriceLabel(input.priceLabel) ||
      typeof input.version !== "string" ||
      input.version.length > 16000
    )
      return reply({ error: "Confira o modelo, as cores e a etiqueta." }, 422);
    const result = await saveCampaignAppearance(
      id,
      {
        modelKey: input.modelKey,
        primary: input.primary,
        accent: input.accent,
        priceLabel: input.priceLabel,
      },
      input.version,
      user.id,
    );
    return reply(result, result.ok ? 200 : result.status);
  } catch (e) {
    if (e instanceof SyntaxError)
      return reply({ error: "Envio inválido." }, 400);
    const code = (e as { code?: string }).code;
    if (code === "42501")
      return reply(
        { error: "Seu acesso não permite editar esta campanha." },
        403,
      );
    console.error("campaign_appearance_save_failed", {
      campaignId: id,
      code: code ?? "unknown",
    });
    return reply(
      {
        error:
          "Não foi possível salvar o visual. Suas escolhas continuam abertas para tentar novamente.",
      },
      503,
    );
  }
}
