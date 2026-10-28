import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/perms";
import { getScope } from "@/lib/scope";
import { PromoTabs } from "../promo-tabs";
import { ReviewUpload } from "./import-form";
import { isPriceLabel } from "@/lib/domain/price-labels";
import { pharmacyModel } from "@/lib/domain/pharmacy-models";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ modelo?: string; etiqueta?: string }>;
}) {
  const user = await requireUser(),
    scope = await getScope();
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Importar e revisar campanha</h1>
        <p>
          Planilha original à esquerda, ofertas para o encarte à direita.
          Confirme os agrupamentos antes de gerar.
        </p>
      </header>
      <p>
        <Link href="/promocoes/regras">Conferir as regras da empresa</Link>
      </p>
      {canWrite(user.role) ? (
        <ReviewUpload
          modelKey={pharmacyModel((await searchParams).modelo)?.key}
          labelKey={
            isPriceLabel((await searchParams).etiqueta)
              ? (await searchParams).etiqueta
              : undefined
          }
          brands={scope.brands}
          selected={scope.brand?.id ?? scope.brands[0]?.id ?? ""}
        />
      ) : (
        <p>Seu perfil permite consultar campanhas, sem importar.</p>
      )}
    </>
  );
}
