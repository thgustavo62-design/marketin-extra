import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { PriceLabelGallery } from "@/components/price-label-gallery";
import { PromoTabs } from "../promo-tabs";
export default async function Labels() {
  const user = await requireUser();
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Etiquetas de preço</h1>
        <p>Compare os dez modelos e escolha o destaque da sua campanha.</p>
      </header>
      <PriceLabelGallery canEdit={canWrite(user.role)} />
    </>
  );
}
