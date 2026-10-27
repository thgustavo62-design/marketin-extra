import { companyAdmin } from "@/lib/tenancy/service";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getScope } from "@/lib/scope";
import { getGroupingRules } from "@/lib/promo/review-store";
import { PromoTabs } from "../promo-tabs";
import { RulesForm } from "./rules-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  await requireUser();
  const scope = await getScope(),
    sp = await searchParams,
    brand =
      scope.brands.find((b) => b.id === sp.empresa) ??
      scope.brand ??
      scope.brands[0];
  if (!brand) return <p>Cadastre uma empresa antes de configurar as regras.</p>;
  if (!(await companyAdmin(brand.id)))
    return (
      <p>Somente administradores autorizados da empresa alteram as regras.</p>
    );
  const saved = await getGroupingRules(brand.id);
  return (
    <>
      <PromoTabs />
      <header className="page-head">
        <h1>Regras inteligentes</h1>
        <p>
          Regras e memória de agrupamentos separadas por empresa. Alterações
          valem para novas importações.
        </p>
      </header>
      <nav className="tabs">
        {scope.brands.map((b) => (
          <Link
            key={b.id}
            className={`tab${b.id === brand.id ? " active" : ""}`}
            href={`/promocoes/regras?empresa=${b.id}`}
          >
            {b.name}
          </Link>
        ))}
      </nav>
      <h2>{brand.name}</h2>
      <RulesForm
        key={brand.id}
        brandId={brand.id}
        config={saved.config}
        revision={saved.revision}
      />
    </>
  );
}
