import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { readReview } from "@/lib/promo/review-store";
import { listThemes } from "@/lib/promo/store";
import { PromoTabs } from "../../promo-tabs";
import { ReviewEditor } from "./review-editor";
import { pharmacyModel } from "@/lib/domain/pharmacy-models";
import { modelBrandColors } from "@/lib/promo/model-selection";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modelo?: string }>;
}) {
  const user = await requireUser(),
    { id } = await params,
    r = await readReview(id, user);
  if (!r) notFound();
  const [themes, brandColors, query] = await Promise.all([
    listThemes(),
    modelBrandColors(r.brand_id),
    searchParams,
  ]);
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Revisão · {r.name}</h1>
        <p>
          {r.filename} · originais preservados · alterações salvas por oferta
        </p>
      </header>
      <a className="btn" href={`/api/promocoes/revisao/${id}/original`}>
        Baixar planilha original
      </a>
      <ReviewEditor
        data={r}
        themes={themes}
        canEdit={canWrite(user.role)}
        initialModel={pharmacyModel(query.modelo)?.key}
        brandColors={brandColors}
      />
    </>
  );
}
