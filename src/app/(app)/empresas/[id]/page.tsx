import { ActionForm } from "@/components/action-form";
import { revokeMembershipAction } from "../../admin/proprietarios/actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isUuid } from "@/lib/form";
import { companyAdmin } from "@/lib/tenancy/service";
import { BranchForm, MembershipForm } from "@/components/tenancy-forms";
export default async function Company({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const company = (
    await pool.query("select * from companies where id=$1", [id])
  ).rows[0];
  if (!company) notFound();
  const branches = (
    await pool.query(
      "select id,name,city,address,phone from branches where brand_id=$1 order by name",
      [id],
    )
  ).rows;
  const manage = await companyAdmin(id);
  const memberships = manage
    ? (
        await pool.query(
          "select m.id,u.display_name,u.username,b.name as branch_name,m.role,m.active,m.permissions from employee_memberships m join users u on u.id=m.user_id left join branches b on b.id=m.branch_id where m.company_id=$1 order by u.display_name",
          [id],
        )
      ).rows
    : [];
  return (
    <>
      <Link href="/empresas">Minhas Empresas</Link>
      <h1>{company.name}</h1>
      <p>
        {company.segment} ·{" "}
        {company.owner_id
          ? "Proprietário confirmado"
          : "Titularidade pendente: solicite confirmação à administração Encartiva."}
      </p>
      <section className="card tenancy-section">
        <h2>Filiais</h2>
        {branches.map((b) => (
          <p key={b.id}>
            <b>{b.name}</b> · {b.city} · {b.address} · {b.phone}
          </p>
        ))}
        {!branches.length && <p>Nenhuma filial cadastrada.</p>}
        {manage && company.owner_id && <BranchForm companyId={id} />}
      </section>
      {manage && company.owner_id && (
        <section className="card tenancy-section">
          <h2>Funcionários e permissões</h2>
          <p>
            O proprietário administra automaticamente todas as filiais.
            Funcionários recebem somente os acessos definidos abaixo.
          </p>
          {memberships.map((m) => (
            <div key={m.id}>
              <p>
                {m.display_name} ({m.username}) ·{" "}
                {m.branch_name || "Empresa inteira"} · {m.role} ·{" "}
                {m.active ? "Ativo" : "Revogado"}
                <br />
                {Object.entries(m.permissions as Record<string, string>)
                  .filter(([, v]) => v !== "none")
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ") || "Sem acesso aos módulos"}
              </p>
              {m.active && (
                <ActionForm
                  action={revokeMembershipAction}
                  submit="Revogar vínculo"
                >
                  <input type="hidden" name="company_id" value={id} />
                  <input type="hidden" name="membership_id" value={m.id} />
                </ActionForm>
              )}
            </div>
          ))}
          <MembershipForm companyId={id} branches={branches} />
        </section>
      )}
    </>
  );
}
