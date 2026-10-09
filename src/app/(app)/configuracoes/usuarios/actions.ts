'use server'

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { adminOrError, audit, normalizeUsername } from '@/lib/auth'
import { pool } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { generateTempPassword, isRole, userChangeBlockedReason, validatePassword, validateUsername } from '@/lib/perms'
import { isUuid, str, type FormState } from '@/lib/form'
import { clientIp } from '@/lib/session'

const PAGE = '/configuracoes/usuarios'

async function loadTarget(id: string) {
  if (!isUuid(id)) return null
  const t = (await pool.query(`select id, username, role, active from users where id = $1`, [id])).rows[0]
  if (!t) return null
  const activeAdmins = (await pool.query(`select count(*)::int n from users where role = 'admin' and active`)).rows[0].n
  return { ...t, activeAdmins } as { id: string; username: string; role: string; active: boolean; activeAdmins: number }
}

export async function createUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await adminOrError()
  if (!g.ok) return { error: g.error }
  const username = str(fd, 'username')
  const displayName = str(fd, 'display_name') || username
  const role = str(fd, 'role')
  const typed = String(fd.get('password') ?? '')

  const uErr = validateUsername(username)
  if (uErr) return { error: uErr }
  if (!isRole(role)) return { error: 'Escolha o perfil.' }
  if (displayName.length > 60) return { error: 'O nome de exibição pode ter no máximo 60 caracteres.' }
  if (typed) {
    const pErr = validatePassword(typed)
    if (pErr) return { error: pErr }
  }
  const password = typed || generateTempPassword((n) => randomInt(n))

  try {
    await pool.query(
      `insert into users (username, display_name, username_normalized, password_hash, role, must_change_password)
       values ($1, $2, $3, $4, $5, true)`,
      [username, displayName, normalizeUsername(username), await hashPassword(password), role],
    )
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { error: 'Já existe um usuário com esse nome.' }
    throw e
  }
  await audit('usuario_criado', { userId: g.user.id, ip: await clientIp(), target: normalizeUsername(username), meta: { role } })
  revalidatePath(PAGE)
  return {
    ok: `Usuário "${username}" criado. Senha provisória: ${password} — copie agora, ela não será mostrada de novo. A pessoa precisará trocá-la no primeiro acesso.`,
  }
}

export async function setRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await adminOrError()
  if (!g.ok) return { error: g.error }
  const role = str(fd, 'role')
  const t = await loadTarget(str(fd, 'id'))
  if (!t || !isRole(role)) return { error: 'Usuário ou perfil inválido.' }
  if (role === t.role) return { ok: 'Perfil já era esse.' }
  const blocked = userChangeBlockedReason({ actorId: g.user.id, targetId: t.id, targetRole: t.role, targetActive: t.active, change: { role }, activeAdmins: t.activeAdmins })
  if (blocked) return { error: blocked }
  await pool.query(`update users set role = $1 where id = $2`, [role, t.id])
  await audit('usuario_perfil', { userId: g.user.id, ip: await clientIp(), target: t.username, meta: { de: t.role, para: role } })
  revalidatePath(PAGE)
  return { ok: 'Perfil atualizado.' }
}

export async function setActiveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await adminOrError()
  if (!g.ok) return { error: g.error }
  const t = await loadTarget(str(fd, 'id'))
  if (!t) return { error: 'Usuário inválido.' }
  const active = str(fd, 'active') === '1'
  const blocked = userChangeBlockedReason({ actorId: g.user.id, targetId: t.id, targetRole: t.role, targetActive: t.active, change: { active }, activeAdmins: t.activeAdmins })
  if (blocked) return { error: blocked }
  await pool.query(`update users set active = $1 where id = $2`, [active, t.id])
  // Desativar encerra todas as sessões da pessoa na hora.
  if (!active) await pool.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [t.id])
  await audit(active ? 'usuario_reativado' : 'usuario_desativado', { userId: g.user.id, ip: await clientIp(), target: t.username })
  revalidatePath(PAGE)
  return { ok: active ? 'Usuário reativado.' : 'Usuário desativado e desconectado.' }
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await adminOrError()
  if (!g.ok) return { error: g.error }
  const t = await loadTarget(str(fd, 'id'))
  if (!t) return { error: 'Usuário inválido.' }
  if (t.id === g.user.id) return { error: 'Para trocar a sua própria senha use “Minha conta”.' }
  const password = generateTempPassword((n) => randomInt(n))
  await pool.query(`update users set password_hash = $1, must_change_password = true, password_changed_at = now() where id = $2`, [await hashPassword(password), t.id])
  await pool.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [t.id])
  await audit('usuario_senha_redefinida', { userId: g.user.id, ip: await clientIp(), target: t.username })
  revalidatePath(PAGE)
  return { ok: `Nova senha provisória de ${t.username}: ${password} — copie agora, ela não será mostrada de novo. As sessões dele(a) foram encerradas.` }
}
