import { itemAccess } from "@/lib/promo/access";
import { NextResponse } from "next/server";
import { audit, sameOrigin } from "@/lib/auth";
import { MAX_IMAGE_INPUT_BYTES } from "@/lib/catalog/images";
import { isUuid } from "@/lib/form";
import { canWrite } from "@/lib/perms";
import { attachItemPhoto } from "@/lib/promo/store";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

// Foto enviada direto no encarte que está sem foto: entra no banco de imagens (fundo transparente quando o fundo é liso) e fica ligada ao produto e ao encarte.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getSession();
  if (!user || user.mustChange)
    return NextResponse.json(
      { error: "Sessão expirada. Entre novamente." },
      { status: 401 },
    );
  if (!sameOrigin(req))
    return NextResponse.json(
      { error: "Origem não permitida." },
      { status: 403 },
    );
  if (!canWrite(user.role))
    return NextResponse.json(
      { error: "Seu perfil é somente leitura." },
      { status: 403 },
    );
  if (!isUuid(id))
    return NextResponse.json({ error: "Encarte inválido." }, { status: 400 });
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Envio inválido ou grande demais (máximo 4 MB)." },
      { status: 413 },
    );
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "Escolha a imagem." }, { status: 400 });
  if (file.size > MAX_IMAGE_INPUT_BYTES)
    return NextResponse.json(
      { error: "A imagem passa de 8 MB." },
      { status: 413 },
    );
  if (!(await itemAccess(id)))
    return NextResponse.json(
      { error: "Oferta não encontrada." },
      { status: 404 },
    );
  const r = await attachItemPhoto(
    id,
    Buffer.from(await file.arrayBuffer()),
    file.name,
    user.id,
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  await audit("promocao_foto_enviada", { userId: user.id, target: id });
  return NextResponse.json({ ok: true, imageId: r.imageId });
}
