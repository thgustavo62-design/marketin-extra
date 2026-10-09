// Perfis de acesso (puro, testável). Inspirado nos papéis de plataformas de gestão de redes sociais.
export const ROLES = {
  admin: { label: 'Administrador', desc: 'Tudo, incluindo usuários, integrações e configurações.' },
  editor: { label: 'Editor', desc: 'Cria e edita conteúdos, campanhas, unidades e base de informações.' },
  viewer: { label: 'Leitura', desc: 'Só visualiza calendário, conteúdos e resultados.' },
} as const

export type Role = keyof typeof ROLES
export const isRole = (v: unknown): v is Role => typeof v === 'string' && v in ROLES

export const canWrite = (role: string): boolean => role === 'admin' || role === 'editor'
export const isAdmin = (role: string): boolean => role === 'admin'

// Acesso por filial: null = todas. (Administrador sempre tem acesso a todas.)
export const brandAllowed = (user: { role: string; brandIds: string[] | null }, brandId: string): boolean =>
  user.role === 'admin' || user.brandIds === null || user.brandIds.includes(brandId)

export const NO_BRAND_ACCESS = 'Você não tem acesso a esta filial.'

export function validateEmail(e: string): string | null {
  const v = e.trim()
  if (!v) return null // opcional
  if (v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'E-mail inválido.'
  return null
}

export const roleLabel =(role: string): string => (isRole(role) ? ROLES[role].label : role)

// Regras para não travar o sistema: nunca deixar de ter um administrador ativo,
// e ninguém altera a si mesmo em perfil/situação (evita se trancar para fora).
export function userChangeBlockedReason(opts: {
  actorId: string
  targetId: string
  targetRole: string
  targetActive: boolean
  change: { role?: string; active?: boolean }
  activeAdmins: number
}): string | null {
  const { actorId, targetId, targetRole, targetActive, change, activeAdmins } = opts
  if (actorId === targetId && (change.role !== undefined || change.active !== undefined)) {
    return 'Você não pode alterar o próprio perfil nem desativar a própria conta.'
  }
  const losesAdmin = targetRole === 'admin' && targetActive && (change.role === 'editor' || change.role === 'viewer' || change.active === false)
  if (losesAdmin && activeAdmins <= 1) return 'É preciso manter pelo menos um administrador ativo.'
  return null
}

// Senha provisória legível (sem caracteres ambíguos), usada na criação e na redefinição.
export function generateTempPassword(random: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += alphabet[random(alphabet.length)]
  return out + '-' + (10 + random(90))
}

export function validatePassword(p: string): string | null {
  if (p.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.'
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'A senha precisa ter letras e números.'
  return null
}

export function validateUsername(u: string): string | null {
  const v = u.trim()
  if (v.length < 3 || v.length > 40) return 'O usuário precisa ter entre 3 e 40 caracteres.'
  if (!/^[\p{L}\p{N}._-]+$/u.test(v)) return 'Use apenas letras, números, ponto, hífen e sublinhado (sem espaços).'
  return null
}
