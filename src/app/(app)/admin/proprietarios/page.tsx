import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listOwners, listCompanies } from "@/lib/tenancy/service";
import { ActionForm } from "@/components/action-form";
import { createOwnerAction, transferAction } from "./actions";
export default async function Owners() {
  await requireAdmin();
  const [owners, companies] = await Promise.all([
    listOwners(),
    listCompanies(),
  ]);
  return (
    <>
      <h1>Proprietários</h1>
      <p>
        Cadastre o proprietário, abra seu perfil e depois crie empresas e
        filiais.
      </p>
      <section className="card tenancy-section">
        <h2>Cadastros</h2>
        {owners.map((o) => (
          <p key={o.id}>
            <Link href={`/admin/proprietarios/${o.id}`}>{o.name}</Link> ·{" "}
            {o.status === "active" ? "Ativo" : "Suspenso"} · {o.plan_name} ·{" "}
            {o.companies}/{o.max_companies} empresas
          </p>
        ))}
        {!owners.length && <p>Nenhum proprietário cadastrado.</p>}
      </section>
      <section className="card tenancy-section">
        <h2>Novo proprietário</h2>
        <ActionForm action={createOwnerAction} submit="Cadastrar proprietário">
          {[
            ["name", "Nome"],
            ["email", "E-mail"],
            ["phone", "Telefone"],
            ["username", "Login"],
            ["password", "Senha provisória"],
            ["plan", "Plano contratado"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                type={
                  name === "password"
                    ? "password"
                    : name === "email"
                      ? "email"
                      : "text"
                }
                required={!["phone", "email"].includes(name)}
                autoComplete={name === "password" ? "new-password" : "off"}
              />
            </label>
          ))}
          {[
            ["companies", "Limite de empresas", 1],
            ["branches", "Limite total de filiais", 5],
            ["users", "Limite de usuários", 10],
          ].map(([name, label, value]) => (
            <label key={String(name)}>
              {label}
              <input
                type="number"
                min={1}
                max={name === "companies" ? 10000 : 100000}
                name={String(name)}
                defaultValue={value}
                required
              />
            </label>
          ))}
        </ActionForm>
      </section>
      <section className="card tenancy-section">
        <h2>Empresas existentes e titularidade</h2>
        <p>
          Empresas sem titular confirmado permanecem preservadas e acessíveis
          somente à administração. Confirme o dono real antes de liberar o
          acesso.
        </p>
        <ActionForm action={transferAction} submit="Registrar titularidade">
          <label>
            Empresa
            <select name="company_id">
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.owner_name || "Titularidade pendente"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Proprietário confirmado
            <select name="owner_id">
              <option value="">Selecione</option>
              {owners
                .filter((o) => o.status === "active")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Motivo e evidência da autorização
            <textarea name="reason" required minLength={5} />
          </label>
          <label>
            <input type="checkbox" name="confirmed" value="1" />
            Conferi a titularidade. Entendo que uma transferência revoga
            vínculos antigos de funcionários.
          </label>
        </ActionForm>
      </section>
    </>
  );
}
