import { NextResponse } from "next/server";
import { sameOrigin, audit } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { importForReview, previewRules } from "@/lib/promo/review-store";
export const maxDuration = 60;
export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.mustChange)
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!sameOrigin(req) || !canWrite(user.role))
    return NextResponse.json(
      { error: "Sem permissão para importar." },
      { status: 403 },
    );
  if (Number(req.headers.get("content-length") || 0) > 4_400_000)
    return NextResponse.json(
      { error: "Envie uma planilha de até 4 MB." },
      { status: 413 },
    );
  try {
    const fd = await req.formData(),
      file = fd.get("file"),
      brandId = String(fd.get("brand_id") || "");
    if (!(file instanceof File) || !isUuid(brandId))
      return NextResponse.json(
        { error: "Escolha a empresa e a planilha XLS/XLSX." },
        { status: 400 },
      );
    if (fd.get("test") === "1") {
      if (user.role !== "admin")
        return NextResponse.json(
          { error: "Somente administradores podem testar regras." },
          { status: 403 },
        );
      return NextResponse.json(
        await previewRules(
          Buffer.from(await file.arrayBuffer()),
          JSON.parse(String(fd.get("rules") || "{}")),
        ),
      );
    }
    const id = await importForReview({
      bytes: Buffer.from(await file.arrayBuffer()),
      name: String(fd.get("name") || ""),
      filename: file.name,
      brandId,
      user,
    });
    await audit("promocao_importada_revisao", { userId: user.id, target: id });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && !("code" in e)
            ? e.message
            : "Não foi possível importar. Confira a migração e tente novamente.",
      },
      { status: 422 },
    );
  }
}
