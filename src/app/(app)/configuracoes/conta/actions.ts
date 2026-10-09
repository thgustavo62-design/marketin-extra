'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/auth'
import { pool } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/password'
import { validatePassword } from '@/lib/perms'
import { str, type FormState } from '@/lib/form'
import { clientIp, getSession } from '@/lib/session'

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSession()
  if (!user) return { error: 'Sessão expirada. Entre novamente.' }

  const current = String(fd.get('current') ?? '')
  const next = String(fd.get('next') ?? '')
  const confirm = String(fd.get('confirm') ?? '')

  const weak = validatePassword(next)
  if (weak) return { error: weak }
  if (next !== confirm) return { error: 'A confirmação não confere com a nova senha.' }
  if (next === current) return { error: 'A nova senha precisa ser diferente da atual.' }

  const ip = await clientIp()
  const { rows } = await pool.query(`select password_hash from users where id = $1`, [user.id])
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
    await audit('troca_senha_falhou', { userId: user.id, ip })
    return { error: 'Senha atual incorreta.' }
  }

  await pool.query(`update users set password_hash = $1, password_changed_at = now(), must_change_password = false where id = $2`, [
    await hashPassword(next),
    user.id,
  ])
  // Encerra todas as outras sessões; mantém só a atual.
  await pool.query(`update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null`, [user.id, user.sessionId])
  await audit('troca_senha_ok', { userId: user.id, ip })
  if (user.mustChange) {
    revalidatePath('/', 'layout') // o menu e o seletor de filial passam a aparecer na hora
    redirect('/') // primeiro acesso: segue para o sistema
  }
  return { ok: 'Senha alterada. As outras sessões foram encerradas.' }
}

export async function updateDisplayNameAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSession()
  if (!user) return { error: 'Sessão expirada. Entre novamente.' }
  const name = str(fd, 'display_name')
  if (name.length < 2 || name.length > 60) return { error: 'O nome precisa ter entre 2 e 60 caracteres.' }
  await pool.query(`update users set display_name = $1 where id = $2`, [name, user.id])
  revalidatePath('/', 'layout')
  return { ok: 'Nome atualizado.' }
}
