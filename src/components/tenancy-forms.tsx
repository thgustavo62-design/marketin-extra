import { ActionForm } from "./action-form";
import {
  companyAction,
  branchAction,
  membershipAction,
} from "@/app/(app)/admin/proprietarios/actions";
import { MODULES } from "@/lib/tenancy/service";
export function CompanyForm({ ownerId, owners = [] }: { ownerId?: string; owners?: { id: string; name: string }[] }) {
  return (
    <ActionForm action={companyAction} submit="Cadastrar empresa">
      {ownerId ? <input type="hidden" name="owner_id" value={ownerId} /> : (
        <label>Proprietário
          <select name="owner_id" aria-label="Proprietário" required defaultValue="">
            <option value="">Selecione o proprietário</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        </label>
      )}
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
export function BranchForm({ companyId, branch }: { companyId: string; branch?: { id: string; name: string; city: string | null; address: string | null; phone: string | null; hours: string | null } }) {
  return (
    <ActionForm action={branchAction} submit={branch ? 'Salvar filial' : 'Cadastrar filial'}>
      <input type="hidden" name="company_id" value={companyId} />
      {branch && <input type="hidden" name="branch_id" value={branch.id} />}
      {[
        ["name", "Nome da filial"],
        ["city", "Cidade"],
        ["address", "Endereço"],
        ["phone", "Telefone"],
        ["hours", "Horário de funcionamento"],
      ].map(([name, label]) => (
        <label key={name}>
          {label}
          <input name={name} required={name === "name"} maxLength={name === 'name' ? 160 : 1000} defaultValue={branch?.[name as keyof typeof branch] ?? ''} />
        </label>
      ))}
    </ActionForm>
  );
}
export const MODULE_LABELS: Record<string, string> = {
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
  membership,
}: {
  companyId: string;
  branches: { id: string; name: string }[];
  membership?: { username: string; display_name: string; branch_id: string | null; role: string; permissions: Record<string, string> };
}) {
  return (
    <ActionForm action={membershipAction} submit={membership ? 'Salvar permissões' : 'Criar ou vincular login'}>
      <input type="hidden" name="company_id" value={companyId} />
      <label>
        Login
        <input name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={40} readOnly={!!membership} defaultValue={membership?.username} />
      </label>
      <label>
        Nome
        <input name="name" maxLength={160} readOnly={!!membership} defaultValue={membership?.display_name} />
      </label>
      {!membership && <label>
        Senha provisória para login novo
        <input type="password" name="password" autoComplete="new-password" minLength={10} />
        <small>Mínimo de 10 caracteres, com letras e números. A pessoa deverá trocar a senha no primeiro acesso.</small>
      </label>}
      <p>
        Logins existentes mantêm suas credenciais. Para vincular alguém de outra
        empresa sem vínculo visível, solicite à administração Encartiva. Cada pessoa usa seu próprio login.
      </p>
      <label>
        Escopo
        {membership && <input type="hidden" name="branch_id" value={membership.branch_id ?? ''} />}
        <select aria-label="Escopo" name={membership ? undefined : "branch_id"} disabled={!!membership} defaultValue={membership?.branch_id ?? ''}>
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
        <select name="role" aria-label="Perfil" defaultValue={membership?.role ?? 'employee'}>
          <option value="employee">Funcionário</option>
          <option value="manager">Gerente</option>
          <option value="viewer">Leitura</option>
        </select>
      </label>
      <p className="muted">Gerente administra o escopo escolhido. Leitura permite consultar esse escopo. Para funcionário, escolha as funcionalidades abaixo. Para mudar o escopo de um vínculo, revogue-o e cadastre o novo.</p>
      {MODULES.map((m) => (
        <label key={m}>
          {MODULE_LABELS[m]}
          <select name={m} aria-label={MODULE_LABELS[m]} defaultValue={membership?.permissions[m] ?? 'none'}>
            <option value="none">Sem acesso</option>
            <option value="read">Consultar</option>
            <option value="write">Consultar e editar</option>
          </select>
        </label>
      ))}
    </ActionForm>
  );
}
