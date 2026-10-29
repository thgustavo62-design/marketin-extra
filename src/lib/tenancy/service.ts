import { pool, withTx } from "../db";
import { hashPassword } from "../password";
import { normalizeUsername, audit } from "../auth";
import { validatePassword, validateUsername, validateEmail } from "../perms";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../session";
import type { PoolClient } from "pg";

// Settings may manage a different company from the one selected in the header.
// Resolve the authorized company first; keep the same actor, role and RLS.
export async function withCompanyScope<T>(companyId: string, fn: (db: PoolClient) => Promise<T>) {
  return withTx(async (db) => {
    const company = (await db.query(
      "select c.slug from companies c where c.id=$1",
      [companyId],
    )).rows[0];
    if (!company) throw Error("Empresa não autorizada.");
    await db.query(
      "select set_config('nova7.company_slug',$1,true),set_config('nova7.branch_id','',true)",
      [company.slug],
    );
    return fn(db);
  });
}
export const MODULES = [
  "planning",
  "products",
  "promotions",
  "media",
  "results",
  "design",
  "branch_admin",
] as const;
export async function listOwners() {
  return (
    await pool.query(
      `select o.*,s.plan_name,s.status as subscription_status,l.max_companies,l.max_branches,l.max_users,(select count(*)::int from companies c where c.owner_id=o.id)as companies from owners o left join subscriptions s on s.owner_id=o.id left join subscription_limits l on l.owner_id=o.id order by o.name`,
    )
  ).rows;
}
export async function listCompanies(ownerId?: string) {
  return (
    await pool.query(
      `select c.*,o.name as owner_name,(select count(*)::int from branches b where b.brand_id=c.id)as branches from companies c left join owners o on o.id=c.owner_id where ($1::uuid is null or c.owner_id=$1)order by c.name`,
      [ownerId ?? null],
    )
  ).rows;
}
export async function createOwner(
  input: {
    name: string;
    email: string;
    phone: string;
    username: string;
    password: string;
    plan: string;
    companies: number;
    branches: number;
    users: number;
  },
  actor: SessionUser,
) {
  if (!actor.isPlatformAdmin)
    throw Error("Somente a administração Encartiva cadastra proprietários.");
  const err =
    validateUsername(input.username) ||
    validatePassword(input.password) ||
    validateEmail(input.email);
  if (err) throw Error(err);
  if (input.name.trim().length < 2 || !input.plan.trim())
    throw Error("Preencha o proprietário e o plano contratado.");
  for (const n of [input.companies, input.branches, input.users])
    if (!Number.isInteger(n) || n < 1 || n > 100000)
      throw Error("Limites inválidos.");
  const hash = await hashPassword(input.password);
  const id = await withTx(async (db) => {
    const o = (
      await db.query(
        "insert into owners(name,email,phone,created_by)values($1,$2,$3,$4)returning id",
        [
          input.name.trim(),
          input.email.trim() || null,
          input.phone.trim() || null,
          actor.id,
        ],
      )
    ).rows[0].id;
    await db.query(
      "insert into subscriptions(owner_id,plan_name)values($1,$2)",
      [o, input.plan.trim()],
    );
    await db.query(
      "insert into subscription_limits(owner_id,max_companies,max_branches,max_users)values($1,$2,$3,$4)",
      [o, input.companies, input.branches, input.users],
    );
    const u = (
      await db.query(
        "insert into users(username,username_normalized,display_name,email,password_hash,role,must_change_password)values($1,$2,$3,$4,$5,'owner',true)returning id",
        [
          input.username.trim(),
          normalizeUsername(input.username),
          input.name.trim(),
          input.email.trim() || null,
          hash,
        ],
      )
    ).rows[0].id;
    await db.query(
      "insert into owner_user_links(owner_id,user_id)values($1,$2)",
      [o, u],
    );
    return o as string;
  });
  await audit("proprietario_cadastrado", { userId: actor.id, target: id });
  return id;
}
export async function saveCompany(
  ownerId: string,
  name: string,
  segment: string,
  actor: SessionUser,
) {
  if (!name.trim() || !segment.trim())
    throw Error("Informe o nome e o segmento da empresa.");
  const slug =
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) +
    "-" +
    randomUUID().slice(0, 8);
  const id = randomUUID();
  // INSERT ... RETURNING also evaluates SELECT RLS before its STABLE ownership
  // lookup can see the new row. INSERT still enforces the owner and plan guards.
  await pool.query(
    "insert into companies(id,owner_id,ownership_status,name,slug,segment)values($1,$2,'confirmed',$3,$4,$5)",
    [id, ownerId, name.trim().slice(0, 160), slug, segment.trim().slice(0, 80)],
  );
  await audit("empresa_cadastrada", { userId: actor.id, target: id });
  return id;
}
export async function companyAdmin(id: string) {
  return (
    (
      await pool.query("select nova7_private.manage_company($1)as allowed", [
        id,
      ])
    ).rows[0].allowed === true
  );
}
export async function saveMembership(
  o: {
    companyId: string;
    branchId: string | null;
    username: string;
    name: string;
    password: string;
    role: string;
    permissions: Record<string, string>;
  },
  actor: SessionUser,
) {
  if (!(await companyAdmin(o.companyId)))
    throw Error("Sem permissão para administrar funcionários desta empresa.");
  if (!["manager", "employee", "viewer"].includes(o.role))
    throw Error("Perfil inválido.");
  const error = validateUsername(o.username);
  if (error) throw Error(error);
  if (o.name.trim().length > 160) throw Error("O nome pode ter no máximo 160 caracteres.");
  const permissions = Object.fromEntries(
    MODULES.map((m) => [
      m,
      o.role === 'manager' ? 'write' : o.role === 'viewer' ? 'read' : ["read", "write"].includes(o.permissions[m]) ? o.permissions[m] : "none",
    ]),
  );
  if (o.role === "employee" && !Object.values(permissions).some((value) => value !== "none"))
    throw Error("Selecione pelo menos uma funcionalidade para o funcionário.");
  const hash = o.password ? await hashPassword(o.password) : null;
  if (o.password) {
    const e = validatePassword(o.password);
    if (e) throw Error(e);
  }
  await withTx(async (db) => {
    let user = (
      await db.query("select id from users where username_normalized=$1", [
        normalizeUsername(o.username),
      ])
    ).rows[0];
    if (!user) {
      if (!hash)
        throw Error(
          "Para um login novo, defina uma senha provisória. Para login existente sem vínculo visível, solicite a vinculação à administração Encartiva.",
        );
      user = { id: randomUUID() };
      await db.query(
        "insert into users(id,username,username_normalized,display_name,password_hash,role,must_change_password,created_by)values($1,$2,$3,$4,$5,'employee',true,$6)",
        [user.id, o.username, normalizeUsername(o.username), o.name.trim() || o.username, hash, actor.id],
      );
    }
    await db.query(
      "insert into employee_memberships(user_id,company_id,branch_id,role,permissions,created_by)values($1,$2,$3,$4,$5::jsonb,$6)on conflict(user_id,company_id,(coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)))do update set role=excluded.role,permissions=excluded.permissions,active=true",
      [
        user.id,
        o.companyId,
        o.branchId,
        o.role,
        JSON.stringify(permissions),
        actor.id,
      ],
    );
  });
  await audit("funcionario_vinculado", {
    userId: actor.id,
    target: o.companyId,
    meta: { branchId: o.branchId, role: o.role },
  });
}
export async function transferCompany(
  companyId: string,
  ownerId: string,
  reason: string,
  actor: SessionUser,
) {
  if (!actor.isPlatformAdmin || reason.trim().length < 5)
    throw Error("Transferência exige administrador Encartiva e motivo.");
  await withTx(async (db) => {
    await db.query("select set_config('nova7.transfer_reason',$1,true)", [
      reason.trim().slice(0, 1000),
    ]);
    const r = await db.query(
      "update companies set owner_id=$2,ownership_status='confirmed'where id=$1 returning id",
      [companyId, ownerId],
    );
    if (!r.rowCount) throw Error("Empresa não encontrada.");
  });
  await audit("titularidade_transferida", {
    userId: actor.id,
    target: companyId,
    meta: { ownerId, reason },
  });
}
export function safeError(e: unknown) {
  const code = (e as { code?: string }).code;
  if (code === "42501")
    return "Você não tem autorização para esta operação ou para o escopo selecionado.";
  if (code === "23503")
    return "O vínculo informado não existe ou não pertence ao escopo permitido.";
  if (code === "23505")
    return "Já existe um registro com esses dados; nenhum cadastro existente foi sobrescrito.";
  return e instanceof Error
    ? e.message
    : "Não foi possível concluir a operação.";
}
