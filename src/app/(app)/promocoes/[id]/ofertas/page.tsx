import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { isUuid } from "@/lib/form";
import { applyOverrides, normalizeTheme } from "@/lib/domain/promo";
import { getCampaign } from "@/lib/promo/store";
import { OfferEditor } from "./offer-editor";

export default async function Offers({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(),
    { id } = await params;
  if (!isUuid(id)) notFound();
  const source = await getCampaign(id, { workspace: false });
  if (!source || source.campaign.kind !== "promocao") notFound();
  return (
    <OfferEditor
      campaign={source.campaign}
      theme={applyOverrides(
        source.theme?.config ?? normalizeTheme({}),
        source.campaign.overrides,
      )}
      items={source.items}
      canEdit={canWrite(user.role)}
    />
  );
}
