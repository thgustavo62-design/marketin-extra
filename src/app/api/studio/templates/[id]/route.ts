import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isUuid } from "@/lib/form";
import { getCampaign } from "@/lib/promo/store";
import { getStudioPage } from "@/lib/studio/store";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user || user.mustChange)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id))
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const source = await getCampaign(id);
  if (!source || source.campaign.kind !== "template")
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const saved = await getStudioPage(
    id,
    source.campaign.design_format ?? "story",
    0,
  );
  return NextResponse.json(
    { source, scene: saved?.scene ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
