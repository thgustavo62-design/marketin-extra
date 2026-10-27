import { campaignAccess } from "@/lib/promo/access";
import { studioModelVersion } from "@/lib/domain/studio-ai";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { pool, withTx } from "@/lib/db";
import { addAsset } from "@/lib/promo/store";

export const maxDuration = 60;
const api = "https://api.replicate.com/v1/predictions";
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function writer(id: string) {
  const user = await getSession();
  return user &&
    !user.mustChange &&
    canWrite(user.role) &&
    isUuid(id) &&
    (await campaignAccess(id))
    ? user
    : null;
}
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params,
    user = await writer(id);
  if (!user)
    return json({ error: "Seu perfil não permite esta operação." }, 403);
  if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token)
    return json(
      { error: "A integração de IA ainda não está configurada." },
      503,
    );
  if (Number(req.headers.get("content-length")) > 4_000_000)
    return json({ error: "Imagem grande demais." }, 413);
  const body = await req.json().catch(() => null);
  if (!body || !["generate", "remove-bg"].includes(body.kind))
    return json({ error: "Operação inválida." }, 400);
  const version = studioModelVersion(
    body.kind === "generate"
      ? process.env.REPLICATE_GENERATE_VERSION
      : process.env.REPLICATE_REMOVE_BG_VERSION,
  );
  if (!version)
    return json({ error: "Configure a versão do modelo de IA." }, 503);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (body.kind === "generate" && (prompt.length < 5 || prompt.length > 1200))
    return json({ error: "Descreva a imagem em 5 a 1200 caracteres." }, 400);
  if (
    body.kind === "remove-bg" &&
    (typeof body.image !== "string" ||
      body.image.length > 3_500_000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.image))
  )
    return json({ error: "Selecione uma imagem menor." }, 400);
  const eventId = await withTx(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [
      `studio-ai:${user.id}`,
    ]);
    const campaign = await c.query(
      "select id from promo_campaigns where id=$1 and kind<>'template'",
      [id],
    );
    if (!campaign.rowCount) return null;
    const count = await c.query(
      "select count(*) from audit_events where user_id=$1 and action='studio_ai_requested' and created_at>now()-interval '1 hour'",
      [user.id],
    );
    if (Number(count.rows[0].count) >= 10) return null;
    const event = await c.query(
      "insert into audit_events(user_id,action,target,meta) values($1,'studio_ai_requested',$2,$3) returning id",
      [user.id, id, JSON.stringify({ kind: body.kind })],
    );
    return event.rows[0].id;
  });
  if (!eventId)
    return json(
      {
        error:
          "Arte indisponível ou limite de 10 solicitações por hora atingido.",
      },
      429,
    );
  try {
    const r = await fetch(api, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version,
        input: body.kind === "generate" ? { prompt } : { image: body.image },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const job = await r.json();
    if (!r.ok || typeof job.id !== "string")
      return json({ error: "O serviço de IA não aceitou a solicitação." }, 502);
    await pool.query(
      "update audit_events set meta=meta || $1::jsonb where id=$2",
      [JSON.stringify({ predictionId: job.id }), eventId],
    );
    return json({ job: job.id });
  } catch {
    return json(
      {
        error:
          "O serviço de IA não respondeu. Confira sua conta antes de repetir.",
      },
      502,
    );
  }
}
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params,
    user = await writer(id);
  if (!user)
    return json({ error: "Seu perfil não permite esta operação." }, 403);
  const token = process.env.REPLICATE_API_TOKEN,
    job = new URL(req.url).searchParams.get("job") ?? "";
  if (!token || !/^[a-zA-Z0-9]{8,100}$/.test(job))
    return json({ error: "Solicitação inválida." }, 400);
  const audit = await pool.query(
      "select id,meta from audit_events where user_id=$1 and target=$2 and action='studio_ai_requested' and meta->>'predictionId'=$3 order by created_at desc limit 1",
      [user.id, id, job],
    ),
    event = audit.rows[0];
  if (!event) return json({ error: "Solicitação não encontrada." }, 404);
  if (event.meta.assetId)
    return json({ src: `/api/promocoes/asset/${event.meta.assetId}` });
  try {
    const r = await fetch(`${api}/${job}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      }),
      data = await r.json();
    if (!r.ok)
      return json({ error: "Não foi possível consultar a imagem." }, 502);
    if (["failed", "canceled"].includes(data.status))
      return json({ error: "O processamento não foi concluído." }, 422);
    if (data.status !== "succeeded") return json({ job });
    const output = Array.isArray(data.output) ? data.output[0] : data.output,
      url = new URL(output);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "replicate.delivery" ||
        url.hostname.endsWith(".replicate.delivery")
      )
    )
      return json(
        { error: "O serviço retornou uma imagem não suportada." },
        422,
      );
    const image = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (
      !image.ok ||
      !image.body ||
      Number(image.headers.get("content-length")) > 8_000_000
    )
      return json({ error: "Imagem indisponível ou grande demais." }, 422);
    const reader = image.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 8_000_000) {
        await reader.cancel();
        return json({ error: "Imagem grande demais." }, 413);
      }
      chunks.push(part.value);
    }
    const asset = await addAsset(id, Buffer.concat(chunks), user.id);
    if (!asset.ok) return json({ error: asset.error }, 422);
    await pool.query(
      "update audit_events set meta=meta || $1::jsonb where id=$2",
      [JSON.stringify({ assetId: asset.id }), event.id],
    );
    return json({ src: `/api/promocoes/asset/${asset.id}` });
  } catch {
    return json({ error: "Não foi possível importar a imagem gerada." }, 502);
  }
}
