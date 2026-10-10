// Links de campanha (UTM + QR) e endereço de publicação. Tudo puro e testado.
// Validação do destino é ESTÁTICA (sem o servidor abrir o endereço: evita SSRF); quem aprova confirma que abriu o link.

export type DestinationOk = { ok: true; url: string; host: string; removedParams: string[] }
export type DestinationErr = { ok: false; error: string }

const PRIVATE_SUFFIX = /\.(local|localhost|internal|lan|home|corp|intranet)$/i
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

export function validateDestination(input: string): DestinationOk | DestinationErr {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Informe o endereço de destino.' }
  if (raw.length > 2000) return { ok: false, error: 'O endereço passa de 2000 caracteres.' }
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return { ok: false, error: 'O endereço não pode ter espaços nem caracteres de controle.' }
  let u: URL
  try { u = new URL(raw) } catch { return { ok: false, error: 'Endereço inválido. Use algo como https://www.seusite.com.br/pagina.' } }
  if (u.protocol !== 'https:') return { ok: false, error: 'O destino precisa começar com https://.' }
  if (u.username || u.password) return { ok: false, error: 'O endereço não pode conter usuário ou senha.' }
  if (u.port && u.port !== '443') return { ok: false, error: 'Portas diferentes da padrão não são aceitas.' }
  const host = u.hostname.toLowerCase()
  if (host.includes(':') || IPV4.test(host)) return { ok: false, error: 'Use um domínio, não um número de IP.' }
  if (!host.includes('.') || host === 'localhost' || PRIVATE_SUFFIX.test(host)) return { ok: false, error: 'Este domínio não é público.' }
  if (host.length > 253 || host.split('.').some((p) => p.length === 0 || p.length > 63)) return { ok: false, error: 'Domínio inválido.' }
  // parâmetros UTM já presentes são substituídos pelos definidos aqui (para o link não ter dois valores)
  const removedParams: string[] = []
  for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) { removedParams.push(k.toLowerCase()); u.searchParams.delete(k) }
  u.hash = '' // o que vem depois de # não chega ao servidor e quebraria o fim da URL
  const url = u.toString()
  return { ok: true, url, host, removedParams: [...new Set(removedParams)] }
}

// minúsculas, sem acento, espaços viram "-", só a-z 0-9 _ -
export function slugUtm(v: string, max = 60): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[\s.]+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, max)
}

export type Utm = { source: string; medium: string; campaign: string; term?: string; content?: string }
export const UTM_SUGGESTED_MEDIUMS = ['social', 'story', 'bio', 'qr', 'whatsapp', 'email', 'cpc'] as const

export function normalizeUtm(i: { source: string; medium: string; campaign: string; term?: string; content?: string }): { ok: true; utm: Utm } | { ok: false; error: string } {
  const source = slugUtm(i.source), medium = slugUtm(i.medium), campaign = slugUtm(i.campaign, 80)
  if (!source) return { ok: false, error: 'Informe a origem (utm_source), ex.: instagram, cartaz, whatsapp.' }
  if (!medium) return { ok: false, error: 'Informe o meio (utm_medium), ex.: social, qr.' }
  if (!campaign) return { ok: false, error: 'Informe o nome da campanha (utm_campaign).' }
  const term = i.term ? slugUtm(i.term) : '', content = i.content ? slugUtm(i.content) : ''
  return { ok: true, utm: { source, medium, campaign, ...(term ? { term } : {}), ...(content ? { content } : {}) } }
}

// Destino já validado + UTM normalizado → URL final. Mantém os demais parâmetros do destino.
export function buildFinalUrl(destination: string, utm: Utm): string {
  const u = new URL(destination)
  u.searchParams.set('utm_source', utm.source)
  u.searchParams.set('utm_medium', utm.medium)
  u.searchParams.set('utm_campaign', utm.campaign)
  if (utm.term) u.searchParams.set('utm_term', utm.term)
  if (utm.content) u.searchParams.set('utm_content', utm.content)
  return u.toString()
}

// Quem cria não aprova o próprio link (exceto administrador): é a conferência humana do destino.
export function canApproveLink(o: { userId: string; role: string; createdBy: string | null }): string | null {
  if (o.role === 'admin') return null
  if (o.role !== 'editor') return 'Seu perfil não pode aprovar links.'
  return o.createdBy === o.userId ? 'Quem criou o link não pode aprová-lo. Peça a outra pessoa (ou a um administrador).' : null
}

// ---------- endereço da publicação (confirmação manual) ----------
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

// ---------- referências (concorrentes) ----------
export const NETWORKS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', site: 'Site', outro: 'Outro' } as const
export type Network = keyof typeof NETWORKS
export const isNetwork = (v: unknown): v is Network => typeof v === 'string' && Object.hasOwn(NETWORKS, v)
export const RELEVANCE = { 1: 'Baixa', 2: 'Média', 3: 'Alta' } as const
export const INSPIRATION_KINDS = { ideia: 'Ideia', formato: 'Formato', data_sazonal: 'Data sazonal', exemplo: 'Exemplo' } as const
export type InspirationKind = keyof typeof INSPIRATION_KINDS
export const isInspirationKind = (v: unknown): v is InspirationKind => typeof v === 'string' && Object.hasOwn(INSPIRATION_KINDS, v)

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
