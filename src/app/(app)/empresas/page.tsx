import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCompanies, listOwners } from "@/lib/tenancy/service";
import { CompanyForm } from "@/components/tenancy-forms";
export default async function Companies() {
  const user = await requireUser();
  const companies = await listCompanies();
  const owners = user.ownerIds.length ? await listOwners() : [];
  return (
    <>
      <h1>Minhas Empresas</h1>
      <p>
        O acesso às empresas e filiais depende da titularidade e dos vínculos
        autorizados.
      </p>
      <section className="card tenancy-section">
        {companies.map((c) => (
          <p key={c.id}>
            <Link href={`/empresas/${c.id}`}>{c.name}</Link> ·{" "}
            {c.segment || "Segmento pendente"} · {c.branches} filiais
            {!c.owner_id && " · Titularidade pendente"}
          </p>
        ))}
        {!companies.length && <p>Nenhuma empresa vinculada ao seu login.</p>}
      </section>
      {owners.map((o) => (
        <section className="card tenancy-section" key={o.id}>
          <h2>Nova empresa de {o.name}</h2>
          <p>
            Plano {o.plan_name} · {o.companies}/{o.max_companies} empresas
          </p>
          <CompanyForm ownerId={o.id} />
        </section>
      ))}
    </>
  );
}
