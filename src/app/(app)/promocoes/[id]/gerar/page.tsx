import { PROMO_FORMAT_KEYS, type PromoFormat } from "@/lib/domain/promo";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { getCampaign } from "@/lib/promo/store";
import { sourceHash } from "@/lib/studio/store";
import { pool } from "@/lib/db";
import { GenerateCampaign } from "./generate-campaign";
export default async function Generate({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ formato?: string }>;
}) {
  const user = await requireUser(),
    { id } = await params;
  if (!isUuid(id)) notFound();
  const source = await getCampaign(id, { workspace: false });
  if (!source || source.campaign.kind !== "promocao") notFound();
  if (!canWrite(user.role))
    return (
      <p>
        Seu acesso permite visualizar as campanhas, sem gerar novas páginas.
      </p>
    );
  const saved = await pool.query(
    "select format,page from studio_pages where campaign_id=$1",
    [id],
  );
  const sp = await searchParams;
  const openFormat: PromoFormat = PROMO_FORMAT_KEYS.includes(
    sp.formato as PromoFormat,
  )
    ? (sp.formato as PromoFormat)
    : "feed";
  return (
    <GenerateCampaign
      openFormat={openFormat}
      source={source}
      hash={sourceHash(source)}
      saved={saved.rows.map((r) => `${r.format}:${r.page}`)}
    />
  );
}
