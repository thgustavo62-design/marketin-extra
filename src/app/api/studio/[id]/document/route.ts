import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { MAX_STUDIO_BYTES } from "@/lib/domain/studio";
import { saveStudioPage } from "@/lib/studio/store";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params,
    user = await getSession();
  if (!user || user.mustChange)
    return reply(
      {
        ok: false,
        error:
          "Sessão expirada ou senha pendente. Entre novamente antes de salvar.",
      },
      401,
    );
  if (!sameOrigin(req))
    return reply({ ok: false, error: "Origem não permitida." }, 403);
  if (!canWrite(user.role))
    return reply({ ok: false, error: "Seu perfil é somente leitura." }, 403);
  if (!isUuid(id)) return reply({ ok: false, error: "Arte inválida." }, 400);
  const limit = MAX_STUDIO_BYTES + 4096;
  if (Number(req.headers.get("content-length")) > limit)
    return reply(
      {
        ok: false,
        error: "A arte ficou grande demais. Divida o conteúdo em mais páginas.",
      },
      413,
    );
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({ ok: false, error: "Documento vazio." }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return reply(
          {
            ok: false,
            error:
              "A arte ficou grande demais. Divida o conteúdo em mais páginas.",
          },
          413,
        );
      }
      chunks.push(value);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input))
      return reply({ ok: false, error: "Documento inválido." }, 400);
    const result = await saveStudioPage({
      id,
      format: input.format,
      page: input.page,
      scene: input.scene,
      expectedRevision: input.expectedRevision,
      expectedSourceHash: input.expectedSourceHash,
      documentSourceHash: input.documentSourceHash,
      userId: user.id,
    });
    return reply(
      result,
      result.ok ? 200 : "conflict" in result && result.conflict ? 409 : 422,
    );
  } catch (e) {
    if (e instanceof SyntaxError)
      return reply({ ok: false, error: "Documento inválido." }, 400);
    const code = (e as { code?: string }).code;
    if (code === "P0001")
      return reply(
        {
          ok: false,
          error:
            "A empresa ou os vínculos desta arte precisam ser revisados pela administração. Sua edição foi preservada.",
        },
        422,
      );
    if (code === "42501")
      return reply(
        {
          ok: false,
          error:
            "Seu acesso não permite salvar esta arte no escopo atual. Sua edição foi preservada.",
        },
        403,
      );
    // No scene, credentials or commercial data in runtime logs.
    console.error("studio_save_failed", {
      campaignId: id,
      code: (e as { code?: string }).code ?? "unknown",
    });
    return reply(
      {
        ok: false,
        error:
          "O servidor não conseguiu salvar. Sua edição continua aberta; tentaremos novamente.",
      },
      503,
    );
  }
}
