import { ActionForm } from "./action-form";
import {
  companyAction,
  branchAction,
  membershipAction,
} from "@/app/(app)/admin/proprietarios/actions";
import { MODULES } from "@/lib/tenancy/service";
export function CompanyForm({ ownerId }: { ownerId: string }) {
  return (
    <ActionForm action={companyAction} submit="Cadastrar empresa">
      <input type="hidden" name="owner_id" value={ownerId} />
      <label>
        Nome da empresa
        <input name="name" required maxLength={160} />
      </label>
      <label>
        Segmento
        <input
          name="segment"
          required
          placeholder="Farmácia, supermercado…"
          maxLength={80}
        />
      </label>
    </ActionForm>
  );
}
export function BranchForm({ companyId }: { companyId: string }) {
  return (
    <ActionForm action={branchAction} submit="Cadastrar filial">
      <input type="hidden" name="company_id" value={companyId} />
      {[
        ["name", "Nome da filial"],
        ["city", "Cidade"],
        ["address", "Endereço"],
        ["phone", "Telefone"],
        ["hours", "Horário de funcionamento"],
      ].map(([name, label]) => (
        <label key={name}>
          {label}
          <input name={name} required={name === "name"} />
        </label>
      ))}
    </ActionForm>
  );
}
const LABELS: Record<string, string> = {
  planning: "Planejamento",
  products: "Produtos",
  promotions: "Promoções",
  media: "Arquivos e mídias",
  results: "Resultados",
  design: "Design",
  branch_admin: "Administração de filiais",
};
export function MembershipForm({
  companyId,
  branches,
}: {
  companyId: string;
  branches: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={membershipAction} submit="Salvar vínculo">
      <input type="hidden" name="company_id" value={companyId} />
      <label>
        Login
        <input name="username" autoComplete="off" required />
      </label>
      <label>
        Nome
        <input name="name" />
      </label>
      <label>
        Senha provisória para login novo
        <input type="password" name="password" autoComplete="new-password" />
      </label>
      <p>
        Logins existentes mantêm suas credenciais. Para vincular alguém de outra
        empresa sem vínculo visível, solicite à administração Nova7.
      </p>
      <label>
        Escopo
        <select name="branch_id">
          <option value="">Empresa inteira e suas filiais</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Perfil
        <select name="role">
          <option value="employee">Funcionário</option>
          <option value="manager">Gerente</option>
          <option value="viewer">Leitura</option>
        </select>
      </label>
      {MODULES.map((m) => (
        <label key={m}>
          {LABELS[m]}
          <select name={m} defaultValue="none">
            <option value="none">Sem acesso</option>
            <option value="read">Consultar</option>
            <option value="write">Consultar e editar</option>
          </select>
        </label>
      ))}
    </ActionForm>
  );
}
