import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCompanies, listOwners } from "@/lib/tenancy/service";
import { CompanyForm } from "@/components/tenancy-forms";
export default async function Companies() {
  const user = await requireUser();
  const companies = await listCompanies();
  const owners = user.isPlatformAdmin || user.ownerIds.length ? await listOwners() : [];
  return (
    <>
      <h1>Minhas Empresas</h1>
      <p>
        Cadastre empresas, filiais e logins separados. Escolha uma empresa para administrar seus funcionários e permissões.
      </p>
      <section className="card tenancy-section">
        {companies.map((c) => (
          <p key={c.id}>
            <Link href={`/configuracoes/empresas/${c.id}`}>{c.name}</Link> ·{" "}
            {c.segment || "Segmento pendente"} · {c.owner_name || 'Proprietário pendente'}
            {!c.owner_id && " · Titularidade pendente"}
          </p>
        ))}
        {!companies.length && <p>Nenhuma empresa vinculada ao seu login.</p>}
      </section>
      {user.isPlatformAdmin && <section className="card tenancy-section">
        <h2>Nova empresa</h2>
        <p>Selecione o dono real. O cadastro será salvo diretamente no banco de dados.</p>
        {owners.some((o) => o.status === 'active') ? <CompanyForm owners={owners.filter((o) => o.status === 'active')} /> : <p>Cadastre primeiro um proprietário.</p>}
        <Link href="/configuracoes/proprietarios">Cadastrar ou gerenciar proprietários →</Link>
      </section>}
      {!user.isPlatformAdmin && owners.map((o) => (
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
