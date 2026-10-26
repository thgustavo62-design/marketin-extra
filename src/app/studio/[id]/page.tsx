import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/form";
import { canWrite } from "@/lib/perms";
import { getCampaign, listTemplates } from "@/lib/promo/store";
import { PROMO_FORMAT_KEYS, type PromoFormat } from "@/lib/domain/promo";
import { getStudioPage, sourceHash } from "@/lib/studio/store";
import { StudioLoader } from "@/features/studio/studio-loader";
export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ formato?: string; pagina?: string }>;
}) {
  const user = await requireUser(),
    { id } = await params,
    sp = await searchParams;
  if (!isUuid(id)) notFound();
  const source = await getCampaign(id);
  if (!source || source.campaign.kind === "template") notFound();
  const format: PromoFormat =
    source.campaign.kind === "design"
      ? (source.campaign.design_format ?? "story")
      : PROMO_FORMAT_KEYS.includes(sp.formato as PromoFormat)
        ? (sp.formato as PromoFormat)
        : "story";
  const page = Math.max(0, Math.min(199, Math.floor(Number(sp.pagina) || 0))),
    templates = await listTemplates();
  let saved = null,
    needsMigration = false;
  try {
    saved = await getStudioPage(id, format, page);
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") needsMigration = true;
    else throw e;
  }
  return (
    <StudioLoader
      key={`${id}:${format}:${page}`}
      source={source}
      format={format}
      page={page}
      saved={saved}
      sourceHash={sourceHash(source)}
      canEdit={canWrite(user.role)}
      needsMigration={needsMigration}
      templates={templates}
      aiConfigured={Boolean(process.env.REPLICATE_API_TOKEN)}
    />
  );
}
