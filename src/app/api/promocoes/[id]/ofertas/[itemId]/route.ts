import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { parsePrice } from "@/lib/domain/promo";
import { campaignAccess } from "@/lib/promo/access";
import { patchItem } from "@/lib/promo/store";
import { isPriceLabel } from "@/lib/domain/price-labels";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getSession();
  if (!user || user.mustChange)
    return reply({ error: "Entre novamente antes de salvar." }, 401);
  if (!sameOrigin(req)) return reply({ error: "Origem não permitida." }, 403);
  if (!canWrite(user.role))
    return reply({ error: "Seu perfil é somente leitura." }, 403);
  const { id, itemId } = await ctx.params;
  if (!isUuid(id) || !isUuid(itemId))
    return reply({ error: "Oferta inválida." }, 400);
  try {
    if (!(await campaignAccess(id, itemId)))
      return reply({ error: "Oferta não encontrada." }, 404);
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Envio vazio." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12000) {
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
      typeof input.name !== "string" ||
      typeof input.note !== "string" ||
      typeof input.version !== "string" ||
      input.version.length > 4000 ||
      input.name.length > 160 ||
      input.note.length > 100
    )
      return reply({ error: "Confira o nome e a descrição da oferta." }, 400);
    const price = parsePrice(input.price);
    if (price === null)
      return reply({ error: "Preço inválido. Use, por exemplo, 29,99." }, 422);
    if (
      input.photoId !== undefined &&
      input.photoId !== null &&
      !isUuid(input.photoId)
    )
      return reply({ error: "Foto inválida." }, 400);
    if (input.priceLabel !== undefined && !isPriceLabel(input.priceLabel))
      return reply({ error: "Etiqueta inválida." }, 400);
    const result = await patchItem(
      itemId,
      {
        name: input.name,
        note: input.note,
        price,
        photoImageId: input.photoId,
        expectedOfferVersion: input.version,
        priceLabel: input.priceLabel,
      },
      user.id,
    );
    return reply(result, result.ok ? 200 : result.conflict ? 409 : 422);
  } catch (e) {
    if (e instanceof SyntaxError)
      return reply({ error: "Envio inválido." }, 400);
    const code = (e as { code?: string }).code;
    if (code === "42501")
      return reply(
        { error: "Seu acesso não permite editar esta oferta." },
        403,
      );
    if (code === "P0001")
      return reply(
        { error: "Confira a empresa e os vínculos desta oferta." },
        422,
      );
    console.error("quick_offer_save_failed", {
      campaignId: id,
      code: code ?? "unknown",
    });
    return reply(
      {
        error:
          "Não foi possível salvar. Sua edição continua aberta para tentar novamente.",
      },
      503,
    );
  }
}
