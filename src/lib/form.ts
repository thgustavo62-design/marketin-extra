// Tipos e helpers compartilhados pelos formulários (Server Actions + ActionForm).
export type FormState = { error?: string; ok?: string }

export const str = (fd: FormData, k: string): string => String(fd.get(k) ?? '').trim()

export function optInt(fd: FormData, k: string): number | null | 'invalid' {
  const v = str(fd, k)
  if (v === '') return null
  if (!/^\d+$/.test(v)) return 'invalid'
  const n = Number(v)
  return Number.isSafeInteger(n) ? n : 'invalid'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
