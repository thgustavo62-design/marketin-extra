// Regras puras da biblioteca de mídias: o que pode entrar, como nomear e etiquetar.

// Limite por arquivo: a Vercel recusa corpo de requisição acima de ~4,5 MB; ficamos abaixo disso.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export const ALLOWED_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
} as const
export type AllowedMime = keyof typeof ALLOWED_MIME

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)

// Descobre o tipo pelo CONTEÚDO (bytes iniciais), nunca pelo nome ou pelo tipo que o navegador declarou.
export function sniffMime(b: Uint8Array): AllowedMime | null {
  if (b.length < 12) return null
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  return null
}

// Nome seguro para exibir/baixar: sem caminho, sem caracteres de controle, tamanho limitado.
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|?*:]/g, '').replace(/\s+/g, ' ').trim()
  return (clean || 'arquivo').slice(0, 120)
}

export function normalizeTag(t: string): string {
  return t.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40)
}

export function parseTags(text: string, max = 10): string[] {
  return [...new Set(text.split(/[,;\n]/).map(normalizeTag).filter(Boolean))].slice(0, max)
}

// Link externo (vídeos grandes, pastas do Drive...): só https, com host público.
export function validateExternalUrl(raw: string): string | null {
  const v = raw.trim()
  if (v.length > 500) return 'O endereço é longo demais.'
  let u: URL
  try { u = new URL(v) } catch { return 'Endereço inválido.' }
  if (u.protocol !== 'https:') return 'Use um endereço https://.'
  if (u.username || u.password) return 'O endereço não pode conter usuário e senha.'
  const h = u.hostname.toLowerCase()
  const privateHost = h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(':')
  if (privateHost || !h.includes('.')) return 'Use um endereço público (não IP, localhost ou rede interna).'
  return null
}

export const formatBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
