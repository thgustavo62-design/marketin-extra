import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { authDb as pool } from "./db";

const PROD = process.env.NODE_ENV === "production";
// __Host- exige Secure; só usamos em produção (HTTPS).
export const COOKIE_NAME = PROD ? "__Host-extra_session" : "extra_session";
export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: string;
  mustChange: boolean;
  sessionId: string;
  /** filiais que a pessoa pode acessar; null = todas (administrador sempre null) */
  brandIds: string[] | null;
  isPlatformAdmin: boolean;
  ownerIds: string[];
  memberships: {
    companyId: string;
    branchId: string | null;
    role: string;
    permissions: Record<string, string>;
  }[];
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "desconhecido"
  );
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await pool.query(
    `insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5)`,
    [
      userId,
      hashToken(token),
      expires,
      await clientIp(),
      h.get("user-agent")?.slice(0, 300) ?? null,
    ],
  );
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: PROD,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

// Valida o cookie contra o banco a cada requisição (sessão revogada/expirada = null).
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.id, u.username, coalesce(u.display_name, u.username) as display_name, u.email, u.role, u.must_change_password, u.brand_ids, u.is_platform_admin, s.id as session_id
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.active`,
    [hashToken(token)],
  );
  const r = rows[0];
  if (!r) return null;
  const [owned, members] = await Promise.all([
    pool.query(
      `select l.owner_id,c.id as company_id from owner_user_links l join owners o on o.id=l.owner_id left join companies c on c.owner_id=o.id and c.active where l.user_id=$1 and l.active and o.status='active'`,
      [r.id],
    ),
    pool.query(
      `select m.company_id,m.branch_id,m.role,m.permissions from employee_memberships m join companies c on c.id=m.company_id join owners o on o.id=c.owner_id join subscriptions sub on sub.owner_id=o.id where m.user_id=$1 and m.active and c.active and o.status='active' and sub.status='active' and sub.starts_on<=current_date and(sub.ends_on is null or sub.ends_on>=current_date)`,
      [r.id],
    ),
  ]);
  const suspended = await pool.query(
    `select 1 from owner_user_links l join owners o on o.id=l.owner_id where l.user_id=$1 and l.active and o.status='suspended'`,
    [r.id],
  );
  if (!r.is_platform_admin && suspended.rowCount) return null;
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    email: r.email,
    role: r.is_platform_admin
      ? "admin"
      : owned.rowCount
        ? "owner"
        : r.role === "admin"
          ? "employee"
          : r.role,
    mustChange: r.must_change_password,
    sessionId: r.session_id,
    isPlatformAdmin: r.is_platform_admin,
    ownerIds: [...new Set(owned.rows.map((x) => x.owner_id))],
    brandIds: r.is_platform_admin
      ? null
      : [
          ...new Set(
            [
              ...owned.rows.map((x) => x.company_id),
              ...members.rows.map((x) => x.company_id),
            ].filter(Boolean),
          ),
        ],
    memberships: members.rows.map((m) => ({
      companyId: m.company_id,
      branchId: m.branch_id,
      role: m.role,
      permissions: m.permissions,
    })),
  };
});

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await pool.query(
      `update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`,
      [hashToken(token)],
    );
  }
  jar.delete(COOKIE_NAME);
}
