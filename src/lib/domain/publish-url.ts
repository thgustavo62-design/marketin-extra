// Endereço da publicação (confirmação manual de "Publicado"): só redes conhecidas, https, sem credenciais.
const SOCIAL_HOSTS = ['instagram.com', 'facebook.com', 'fb.watch', 'fb.com', 'tiktok.com', 'youtube.com', 'youtu.be']

export function validatePublishedUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Cole o endereço da publicação.' }
  let u: URL
  try { u = new URL(raw) } catch { return { ok: false, error: 'Endereço inválido.' } }
  if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, error: 'Use o endereço https:// da publicação, sem usuário nem senha.' }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (!SOCIAL_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return { ok: false, error: 'O endereço precisa ser de uma rede social conhecida (Instagram, Facebook, TikTok ou YouTube).' }
  if (raw.length > 500) return { ok: false, error: 'O endereço passa de 500 caracteres.' }
  return { ok: true, url: u.toString() }
}

// Forma comparável de um permalink (sem parâmetros, sem barra final, domínio em minúsculas).
export function normalizePermalink(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`
  } catch { return url }
}

// Endereço https opcional (campo que pode ficar vazio): usado onde se informa um link de fonte.
export function optionalHttps(input: string, max = 500): { ok: true; url: string | null } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: true, url: null }
  if (raw.length > max) return { ok: false, error: `O endereço passa de ${max} caracteres.` }
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, error: 'Use um endereço https:// (sem usuário nem senha).' }
    return { ok: true, url: u.toString() }
  } catch { return { ok: false, error: 'Endereço inválido.' } }
}
