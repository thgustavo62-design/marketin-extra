import { ActionForm } from "@/components/action-form";
import { revokeMembershipAction, companyProfileAction } from "../../admin/proprietarios/actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isUuid } from "@/lib/form";
import { companyAdmin, withCompanyScope } from "@/lib/tenancy/service";
import { BranchForm, MembershipForm, MODULE_LABELS } from "@/components/tenancy-forms";
export default async function Company({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const company = (
    await pool.query("select * from companies where id=$1", [id])
  ).rows[0];
  if (!company) notFound();
  const manage = await companyAdmin(id);
  const { branches, memberships } = await withCompanyScope(id, async (db) => ({
    branches: (await db.query('select id,name,city,address,phone,hours from branches where brand_id=$1 order by name', [id])).rows,
    memberships: manage ? (await db.query(
      'select m.id,m.branch_id,u.display_name,u.username,u.active as login_active,u.must_change_password,b.name as branch_name,m.role,m.active,m.permissions from employee_memberships m join users u on u.id=m.user_id left join branches b on b.id=m.branch_id where m.company_id=$1 order by u.display_name,m.created_at', [id],
    )).rows : [],
  }));
  return (
    <>
      <Link href="/configuracoes/empresas">Minhas Empresas</Link>
      <h1>{company.name}</h1>
      <p>
        {company.segment} ·{" "}
        {company.owner_id
          ? "Proprietário confirmado"
          : "Titularidade pendente: solicite confirmação à administração Encartiva."}
      </p>
      {manage && <section className="card tenancy-section">
        <h2>Dados da empresa</h2>
        <ActionForm action={companyProfileAction} submit="Salvar empresa">
          <input type="hidden" name="company_id" value={id} />
          <label>Nome da empresa<input name="name" required maxLength={160} defaultValue={company.name} /></label>
          <label>Segmento<input name="segment" required maxLength={80} defaultValue={company.segment} /></label>
        </ActionForm>
      </section>}
      <section className="card tenancy-section">
        <h2>Filiais</h2>
        {branches.map((b) => (
          <div key={b.id} className="access-entry">
            <p><b>{b.name}</b> · {b.city} · {b.address} · {b.phone}</p>
            {manage && <details><summary>Editar filial {b.name}</summary><BranchForm companyId={id} branch={b} /></details>}
          </div>
        ))}
        {!branches.length && <p>Nenhuma filial cadastrada.</p>}
        {manage && company.owner_id && <details className="access-entry"><summary>Cadastrar nova filial</summary><BranchForm companyId={id} /></details>}
      </section>
      {manage && company.owner_id && (
        <section className="card tenancy-section">
          <h2>Funcionários e permissões</h2>
          <p>Crie um login de gerente para o responsável da empresa e um login individual para cada funcionário. O proprietário já administra suas empresas e filiais automaticamente.</p>
          {user.isPlatformAdmin && <p><Link href="/configuracoes/usuarios">Ativar logins e redefinir senhas →</Link></p>}
          {!memberships.length && <p>Nenhum funcionário vinculado.</p>}
          {memberships.map((m) => (
            <div key={m.id} className="access-entry" data-membership={m.id}>
              <p>
                {m.display_name} ({m.username}) ·{" "}
                {m.branch_name || "Empresa inteira"} · {{ manager: 'Gerente', employee: 'Funcionário', viewer: 'Leitura' }[m.role as string] || m.role} ·{" "}
                {m.active ? "Ativo" : "Revogado"} · {m.login_active ? 'Login ativo' : 'Login desativado'}{m.must_change_password && ' · Senha provisória'}
                <br />
                {m.role === 'manager' ? 'Administração do escopo escolhido' : m.role === 'viewer' ? 'Consulta do escopo escolhido' : Object.entries(m.permissions as Record<string, string>)
                  .filter(([, v]) => v !== "none")
                  .map(([k, v]) => `${MODULE_LABELS[k] || k}: ${v === 'write' ? 'editar' : 'consultar'}`)
                  .join(" · ") || "Sem acesso aos módulos"}
              </p>
              <details><summary>{m.active ? 'Editar permissões' : 'Reativar vínculo'} de {m.display_name}</summary><MembershipForm companyId={id} branches={branches} membership={m} /></details>
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
          <details className="access-entry" open><summary>Novo funcionário ou gerente</summary><MembershipForm companyId={id} branches={branches} /></details>
        </section>
      )}
    </>
  );
}
