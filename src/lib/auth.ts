import { redirect } from 'next/navigation'
import { pool } from './db'
import { DUMMY_HASH, verifyPassword } from './password'
import { canWrite, isAdmin } from './perms'
import { getSession, type SessionUser } from './session'

export function normalizeUsername(u: string): string {
  return u.trim().normalize('NFKC').toLowerCase()
}

const WINDOW_MIN = 15
const MAX_FAILS_PER_USER = 5
const MAX_FAILS_PER_IP = 20

export async function audit(action: string, opts: { userId?: string | null; target?: string; ip?: string; meta?: object } = {}) {
  await pool.query(`insert into audit_events (user_id, action, target, ip, meta) values ($1,$2,$3,$4,$5)`, [
    opts.userId ?? null,
    action,
    opts.target ?? null,
    opts.ip ?? null,
    JSON.stringify(opts.meta ?? {}),
  ])
}

async function isRateLimited(normalized: string, ip: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select
       count(*) filter (where username_normalized = $1) as by_user,
       count(*) filter (where ip = $2) as by_ip
     from login_attempts
     where success = false and created_at > now() - make_interval(mins => $3)`,
    [normalized, ip, WINDOW_MIN],
  )
  return Number(rows[0].by_user) >= MAX_FAILS_PER_USER || Number(rows[0].by_ip) >= MAX_FAILS_PER_IP
}

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'rate_limited' }

// A senha nunca é logada nem gravada; só o resultado.
export async function checkCredentials(username: string, password: string, ip: string): Promise<LoginResult> {
  const normalized = normalizeUsername(username)
  if (await isRateLimited(normalized, ip)) {
    await audit('login_bloqueado', { ip, target: normalized })
    return { ok: false, reason: 'rate_limited' }
  }
  const { rows } = await pool.query(
    `select id, password_hash from users where username_normalized = $1 and active`,
    [normalized],
  )
  const user = rows[0]
  // Gasta o mesmo tempo mesmo quando o usuário não existe.
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH)
  const ok = Boolean(user) && valid
  await pool.query(`insert into login_attempts (username_normalized, ip, success) values ($1,$2,$3)`, [
    normalized,
    ip,
    ok,
  ])
  if (!ok) {
    await audit('login_falhou', { ip, target: normalized })
    return { ok: false, reason: 'invalid' }
  }
  await audit('login_ok', { userId: user.id, ip })
  return { ok: true, userId: user.id }
}

// Toda página chama requireUser(). Quem ainda tem senha provisória só pode ver a tela de troca.
export async function requireUser(opts: { allowMustChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSession()
  if (!user) redirect('/login')
  if (user.mustChange && !opts.allowMustChange) redirect('/configuracoes/conta?trocar=1')
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!isAdmin(user.role)) redirect('/?sem-permissao=1')
  return user
}

type Guard = { ok: true; user: SessionUser } | { ok: false; error: string }

// Para Server Actions de escrita: devolve o usuário se puder escrever, ou o motivo.
export async function writerOrError(): Promise<Guard> {
  const user = await getSession()
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' }
  if (user.mustChange) return { ok: false, error: 'Troque a senha provisória antes de continuar.' }
  if (!canWrite(user.role)) return { ok: false, error: 'Seu perfil é somente leitura.' }
  return { ok: true, user }
}

// Para Server Actions que terminam em redirect (excluir, confirmar, ativar...).
export async function writerOrRedirect(): Promise<SessionUser> {
  const user = await getSession()
  if (!user) redirect('/login')
  if (user.mustChange) redirect('/configuracoes/conta?trocar=1')
  if (!canWrite(user.role)) redirect('/?sem-permissao=1')
  return user
}

export async function adminOrError(): Promise<Guard> {
  const user = await getSession()
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' }
  if (user.mustChange) return { ok: false, error: 'Troque a senha provisória antes de continuar.' }
  if (!isAdmin(user.role)) return { ok: false, error: 'Só administradores podem fazer isso.' }
  return { ok: true, user }
}

// Proteção CSRF para route handlers de escrita (Server Actions já checam Origin).
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  return new URL(origin).host === req.headers.get('host')
}
