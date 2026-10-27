import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listOwners, listCompanies } from "@/lib/tenancy/service";
import { isUuid } from "@/lib/form";
import { CompanyForm } from "@/components/tenancy-forms";
import { ActionForm } from "@/components/action-form";
import { ownerStatusAction } from "../actions";
export default async function Owner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const owner = (await listOwners()).find((o) => o.id === id);
  if (!owner) notFound();
  const companies = await listCompanies(id);
  return (
    <>
      <Link href="/admin/proprietarios">Proprietários</Link>
      <h1>{owner.name}</h1>
      <section className="card tenancy-section">
        <h2>Minhas Empresas</h2>
        {companies.map((c) => (
          <p key={c.id}>
            <Link href={`/empresas/${c.id}`}>{c.name}</Link> ·{" "}
            {c.segment || "Segmento pendente"} · {c.branches} filiais
          </p>
        ))}
        <CompanyForm ownerId={id} />
      </section>
      <section className="card tenancy-section">
        <h2>Cadastro e contrato</h2>
        <ActionForm action={ownerStatusAction}>
          <input type="hidden" name="id" value={id} />
          {[
            ["name", "Nome", owner.name],
            ["email", "E-mail", owner.email],
            ["phone", "Telefone", owner.phone],
            ["plan", "Plano", owner.plan_name],
          ].map(([name, label, value]) => (
            <label key={name}>
              {label}
              <input name={name} defaultValue={value || ""} />
            </label>
          ))}
          <label>
            Situação
            <select name="status" defaultValue={owner.status}>
              <option value="active">Ativo</option>
              <option value="suspended">Suspenso</option>
            </select>
          </label>
          {[
            ["companies", "Limite de empresas", owner.max_companies],
            ["branches", "Limite de filiais", owner.max_branches],
            ["users", "Limite de usuários", owner.max_users],
          ].map(([name, label, value]) => (
            <label key={name}>
              {label}
              <input name={name} type="number" min={1} defaultValue={value} />
            </label>
          ))}
        </ActionForm>
      </section>
    </>
  );
}
