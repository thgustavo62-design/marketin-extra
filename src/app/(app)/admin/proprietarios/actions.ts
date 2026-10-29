"use server";
import { revalidatePath } from "next/cache";
import { adminOrError, audit, writerOrError } from "@/lib/auth";
import { str, isUuid, type FormState } from "@/lib/form";
import { pool, withTx } from "@/lib/db";
import {
  createOwner,
  saveCompany,
  saveMembership,
  transferCompany,
  safeError,
  MODULES,
  companyAdmin,
  withCompanyScope,
} from "@/lib/tenancy/service";

function refreshAccess(companyId?: string, ownerId?: string) {
  revalidatePath('/configuracoes', 'layout');
  revalidatePath('/empresas');
  revalidatePath('/admin/proprietarios');
  if (companyId) revalidatePath(`/empresas/${companyId}`);
  if (ownerId) revalidatePath(`/admin/proprietarios/${ownerId}`);
}
export async function createOwnerAction(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await adminOrError();
  if (!g.ok) return { error: g.error };
  try {
    const id = await createOwner(
      {
        name: str(fd, "name"),
        email: str(fd, "email"),
        phone: str(fd, "phone"),
        username: str(fd, "username"),
        password: String(fd.get("password") || ""),
        plan: str(fd, "plan"),
        companies: Number(fd.get("companies")),
        branches: Number(fd.get("branches")),
        users: Number(fd.get("users")),
      },
      g.user,
    );
    revalidatePath("/admin/proprietarios");
    refreshAccess();
    return {
      ok: `Proprietário cadastrado. Abra seu perfil para cadastrar as empresas. Código: ${id}`,
    };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function companyAction(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  const owner = str(fd, "owner_id");
  if (!isUuid(owner))
    return { error: "Escolha um proprietário real antes da empresa." };
  try {
    await saveCompany(owner, str(fd, "name"), str(fd, "segment"), g.user);
    revalidatePath("/empresas");
    revalidatePath(`/admin/proprietarios/${owner}`);
    refreshAccess(undefined, owner);
    return {
      ok: "Empresa cadastrada com proprietário. Abra a empresa para cadastrar as filiais.",
    };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function membershipAction(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  const c = str(fd, "company_id"),
    b = str(fd, "branch_id");
  if (!isUuid(c) || (b && !isUuid(b))) return { error: "Escopo inválido." };
  try {
    await saveMembership(
      {
        companyId: c,
        branchId: b || null,
        username: str(fd, "username"),
        name: str(fd, "name"),
        password: String(fd.get("password") || ""),
        role: str(fd, "role"),
        permissions: Object.fromEntries(MODULES.map((m) => [m, str(fd, m)])),
      },
      g.user,
    );
    revalidatePath(`/empresas/${c}`);
    refreshAccess(c);
    return {
      ok: "Vínculo e permissões salvos. O seletor de empresa não altera essas permissões.",
    };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function transferAction(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await adminOrError();
  if (!g.ok) return { error: g.error };
  const c = str(fd, "company_id"),
    o = str(fd, "owner_id");
  if (!isUuid(c) || !isUuid(o) || fd.get("confirmed") !== "1")
    return { error: "Confirme a titularidade e escolha o proprietário." };
  try {
    await transferCompany(c, o, str(fd, "reason"), g.user);
    revalidatePath("/admin/proprietarios");
    revalidatePath("/empresas");
    refreshAccess();
    return {
      ok: "Titularidade registrada com auditoria. Em transferências entre donos, vínculos antigos de funcionários são revogados.",
    };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function ownerStatusAction(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await adminOrError();
  if (!g.ok) return { error: g.error };
  const id = str(fd, "id"),
    status = str(fd, "status");
  if (!isUuid(id) || !["active", "suspended"].includes(status))
    return { error: "Proprietário inválido." };
  try {
    await withTx(async (db) => {
      await db.query(
        "update owners set status=$2,name=$3,email=$4,phone=$5,updated_at=now()where id=$1",
        [
          id,
          status,
          str(fd, "name"),
          str(fd, "email") || null,
          str(fd, "phone") || null,
        ],
      );
      if (status === "suspended")
        await db.query(
          "update sessions set revoked_at=now()where user_id in(select user_id from owner_user_links where owner_id=$1)",
          [id],
        );
      await db.query(
        "update subscriptions set plan_name=$2,status=$3,updated_at=now()where owner_id=$1",
        [id, str(fd, "plan"), status === "active" ? "active" : "suspended"],
      );
      await db.query(
        "update subscription_limits set max_companies=$2,max_branches=$3,max_users=$4 where owner_id=$1",
        [
          id,
          Number(fd.get("companies")),
          Number(fd.get("branches")),
          Number(fd.get("users")),
        ],
      );
    });
    await audit("proprietario_atualizado", {
      userId: g.user.id,
      target: id,
      meta: { status },
    });
    revalidatePath(`/admin/proprietarios/${id}`);
    refreshAccess(undefined, id);
    return { ok: "Cadastro e contrato atualizados." };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function branchAction(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  const c = str(fd, "company_id");
  if (!isUuid(c) || !(await companyAdmin(c)))
    return { error: "Sem permissão para cadastrar filiais." };
  try {
    const branch = str(fd, 'branch_id');
    if (branch && !isUuid(branch)) return { error: 'Filial inválida.' };
    const name = str(fd, 'name');
    if (!name || name.length > 160) return { error: 'Informe um nome de filial com até 160 caracteres.' };
    await withCompanyScope(c, async (db) => {
      const values = [c, name, str(fd, 'city'), str(fd, 'address'), str(fd, 'phone'), str(fd, 'hours')];
      if (branch) {
        const updated = await db.query(
          'update branches set name=$2,city=$3,address=$4,phone=$5,hours=$6 where brand_id=$1 and id=$7 returning id',
          [...values, branch],
        );
        if (!updated.rowCount) throw Error('Filial não encontrada nesta empresa.');
      } else await db.query('insert into branches(brand_id,name,city,address,phone,hours)values($1,$2,$3,$4,$5,$6)', values);
    });
    await audit(branch ? 'filial_atualizada' : 'filial_cadastrada', { userId: g.user.id, target: branch || c, meta: { companyId: c } });
    revalidatePath(`/empresas/${c}`);
    refreshAccess(c);
    return {
      ok: branch ? 'Filial atualizada.' : "Filial cadastrada. O proprietário já tem acesso automaticamente.",
    };
  } catch (e) {
    return { error: safeError(e) };
  }
}

export async function revokeMembershipAction(
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  const company = str(fd, "company_id"),
    id = str(fd, "membership_id");
  if (!isUuid(company) || !isUuid(id) || !(await companyAdmin(company)))
    return { error: "Vínculo não autorizado." };
  try {
    const r = await pool.query(
      "update employee_memberships set active=false where id=$1 and company_id=$2 returning user_id",
      [id, company],
    );
    if (!r.rowCount) return { error: "Vínculo não encontrado." };
    await audit("funcionario_vinculo_revogado", {
      userId: g.user.id,
      target: id,
      meta: { company },
    });
    revalidatePath(`/empresas/${company}`);
    refreshAccess(company);
    return {
      ok: "Vínculo revogado. Os demais vínculos do funcionário são preservados.",
    };
  } catch (e) {
    return { error: safeError(e) };
  }
}

export async function companyProfileAction(_p: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError();
  if (!g.ok) return { error: g.error };
  const id = str(fd, 'company_id');
  if (!isUuid(id) || !(await companyAdmin(id))) return { error: 'Empresa não autorizada.' };
  const name = str(fd, 'name'), segment = str(fd, 'segment');
  if (!name || name.length > 160 || !segment || segment.length > 80)
    return { error: 'Informe o nome (até 160 caracteres) e o segmento (até 80 caracteres).' };
  try {
    const result = await pool.query('update companies set name=$2,segment=$3 where id=$1 returning id', [id, name, segment]);
    if (!result.rowCount) return { error: 'Empresa não encontrada.' };
    await audit('empresa_atualizada', { userId: g.user.id, target: id });
    refreshAccess(id);
    return { ok: 'Dados da empresa atualizados.' };
  } catch (e) { return { error: safeError(e) }; }
}
