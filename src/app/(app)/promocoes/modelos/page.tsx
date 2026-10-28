import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { PharmacyModelGallery } from "@/components/pharmacy-model-gallery";
import { PromoTabs } from "../promo-tabs";

export default async function CampaignModels() {
  const user = await requireUser();
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Modelos de farmácia</h1>
        <p>
          Escolha uma composição, importe sua planilha e personalize a campanha
          com a identidade da empresa.
        </p>
      </header>
      <PharmacyModelGallery canEdit={canWrite(user.role)} />
    </>
  );
}
