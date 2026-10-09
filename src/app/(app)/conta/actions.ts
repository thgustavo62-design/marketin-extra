'use server'

import { audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/password'
import { clientIp, getSession } from '@/lib/session'

export type PasswordState = { error?: string; ok?: boolean }

const MIN_LENGTH = 10

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await getSession()
  if (!user) return { error: 'Sessão expirada. Entre novamente.' }

  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('next') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (next.length < MIN_LENGTH) return { error: `A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.` }
  if (next !== confirm) return { error: 'A confirmação não confere com a nova senha.' }
  if (next === current) return { error: 'A nova senha precisa ser diferente da atual.' }

  const ip = await clientIp()
  const { rows } = await pool.query(`select password_hash from users where id = $1`, [user.id])
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
    await audit('troca_senha_falhou', { userId: user.id, ip })
    return { error: 'Senha atual incorreta.' }
  }

  await pool.query(`update users set password_hash = $1, password_changed_at = now() where id = $2`, [
    await hashPassword(next),
    user.id,
  ])
  // Encerra todas as outras sessões; mantém só a atual.
  await pool.query(`update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null`, [
    user.id,
    user.sessionId,
  ])
  await audit('troca_senha_ok', { userId: user.id, ip })
  return { ok: true }
}
