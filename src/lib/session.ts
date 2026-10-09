import { createHash, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { pool } from './db'

const PROD = process.env.NODE_ENV === 'production'
// __Host- exige Secure; só usamos em produção (HTTPS).
export const COOKIE_NAME = PROD ? '__Host-extra_session' : 'extra_session'
export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12)

export type SessionUser = { id: string; username: string; displayName: string; role: string; mustChange: boolean; sessionId: string }

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'desconhecido'
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const h = await headers()
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000)
  await pool.query(
    `insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5)`,
    [userId, hashToken(token), expires, await clientIp(), h.get('user-agent')?.slice(0, 300) ?? null],
  )
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: PROD,
    sameSite: 'lax',
    path: '/',
    expires,
  })
}

// Valida o cookie contra o banco a cada requisição (sessão revogada/expirada = null).
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const { rows } = await pool.query(
    `select u.id, u.username, coalesce(u.display_name, u.username) as display_name, u.role, u.must_change_password, s.id as session_id
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.active`,
    [hashToken(token)],
  )
  const r = rows[0]
  return r
    ? { id: r.id, username: r.username, displayName: r.display_name, role: r.role, mustChange: r.must_change_password, sessionId: r.session_id }
    : null
})

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (token) {
    await pool.query(`update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`, [
      hashToken(token),
    ])
  }
  jar.delete(COOKIE_NAME)
}
