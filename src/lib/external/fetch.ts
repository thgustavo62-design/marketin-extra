// Busca em fontes abertas, com trava de segurança: só https, só estes domínios, sem seguir redirecionamento para outro domínio,
// com tempo e tamanho máximos. Nenhum endereço vem do usuário (evita SSRF) e nenhuma chave é enviada.
import https from 'node:https'
import tls from 'node:tls'
import { EXTRA_CA } from './ca.ts'

const ALLOWED_HOSTS = new Set([
  'brasilapi.com.br', 'servicodados.ibge.gov.br', 'www.gov.br',
  // bancos abertos de produtos por código de barras (imagens CC BY-SA)
  'world.openbeautyfacts.org', 'images.openbeautyfacts.org', 'world.openfoodfacts.org', 'images.openfoodfacts.org',
])
export const USER_AGENT = 'ExtraMarketing/1.0 (uso interno; dados abertos)' // cabecalho HTTP: somente ASCII (o IBGE devolve 400 com acento)

type Opts = { timeoutMs?: number; maxBytes?: number; accept?: string }
type Raw = { ok: true; status: number; location: string | null; body: Buffer } | { ok: false; error: string }

const TOO_BIG = 'O arquivo da fonte é maior que o limite aceito.'

// Domínios que não enviam a cadeia completa de certificados (ver ca.ts): usa o https do Node com o intermediário público acrescentado.
function getWithCa(u: URL, ca: string[], o: Required<Opts>): Promise<Raw> {
  return new Promise((resolve) => {
    const req = https.get(u, { ca: [...tls.rootCertificates, ...ca], headers: { 'User-Agent': USER_AGENT, Accept: o.accept }, timeout: o.timeoutMs }, (res) => {
      const status = res.statusCode ?? 0
      const location = typeof res.headers.location === 'string' ? res.headers.location : null
      if (status >= 300 && status < 400) { res.resume(); resolve({ ok: true, status, location, body: Buffer.alloc(0) }); return }
      if (Number(res.headers['content-length'] ?? '0') > o.maxBytes) { res.destroy(); resolve({ ok: false, error: TOO_BIG }); return }
      const chunks: Buffer[] = []
      let total = 0
      res.on('data', (c: Buffer) => { total += c.length; if (total > o.maxBytes) { res.destroy(); resolve({ ok: false, error: TOO_BIG }); return } chunks.push(c) })
      res.on('end', () => resolve({ ok: true, status, location: null, body: Buffer.concat(chunks) }))
      res.on('error', () => resolve({ ok: false, error: 'Não foi possível acessar a fonte.' }))
    })
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'A fonte demorou demais para responder.' }) })
    req.on('error', (e: NodeJS.ErrnoException) => resolve({ ok: false, error: `Não foi possível acessar a fonte (${e.code ?? e.message.slice(0, 60)}).` }))
  })
}

async function getWithFetch(u: URL, o: Required<Opts>): Promise<Raw> {
  let res: Response
  try {
    res = await fetch(u, { redirect: 'manual', cache: 'no-store', headers: { 'User-Agent': USER_AGENT, Accept: o.accept }, signal: AbortSignal.timeout(o.timeoutMs) })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') return { ok: false, error: 'A fonte demorou demais para responder.' }
    const code = (e as { cause?: { code?: string } }).cause?.code // ex.: ENOTFOUND, ECONNRESET, UNABLE_TO_VERIFY_LEAF_SIGNATURE
    return { ok: false, error: `Não foi possível acessar a fonte${code ? ` (${code})` : ''}.` }
  }
  if (res.status >= 300 && res.status < 400) return { ok: true, status: res.status, location: res.headers.get('location'), body: Buffer.alloc(0) }
  if (!res.ok) return { ok: true, status: res.status, location: null, body: Buffer.alloc(0) }
  if (Number(res.headers.get('content-length') ?? '0') > o.maxBytes) return { ok: false, error: TOO_BIG }
  const chunks: Buffer[] = []
  let total = 0
  const reader = res.body?.getReader()
  if (!reader) return { ok: false, error: 'Resposta vazia da fonte.' }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > o.maxBytes) { await reader.cancel(); return { ok: false, error: TOO_BIG } }
    chunks.push(Buffer.from(value))
  }
  return { ok: true, status: res.status, location: null, body: Buffer.concat(chunks) }
}

export async function safeFetch(url: string, opts: Opts = {}): Promise<{ ok: true; body: Buffer } | { ok: false; error: string }> {
  const o: Required<Opts> = { timeoutMs: opts.timeoutMs ?? 20_000, maxBytes: opts.maxBytes ?? 5 * 1024 * 1024, accept: opts.accept ?? '*/*' }
  let current = url
  for (let hop = 0; hop < 3; hop++) {
    let u: URL
    try { u = new URL(current) } catch { return { ok: false, error: 'Endereço inválido.' } }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return { ok: false, error: 'Fonte não permitida.' }
    const extra = EXTRA_CA[u.hostname]
    const get = () => (extra ? getWithCa(u, extra, o) : getWithFetch(u, o))
    let r = await get()
    // falha de rede passageira (conexão derrubada, fonte lenta): uma segunda tentativa antes de desistir
    if (!r.ok && /acessar a fonte|demorou demais/.test(r.error)) { await new Promise((res) => setTimeout(res, 800)); r = await get() }
    if (!r.ok) return r
    if (r.status >= 300 && r.status < 400) {
      if (!r.location) return { ok: false, error: 'Redirecionamento inválido.' }
      current = new URL(r.location, u).toString()
      continue
    }
    if (r.status < 200 || r.status >= 300) return { ok: false, error: `A fonte respondeu com erro ${r.status}.` }
    return { ok: true, body: r.body }
  }
  return { ok: false, error: 'Redirecionamentos demais.' }
}

export async function fetchJson(url: string, timeoutMs = 20_000): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const r = await safeFetch(url, { timeoutMs, maxBytes: 5 * 1024 * 1024, accept: 'application/json' })
  if (!r.ok) return r
  try { return { ok: true, json: JSON.parse(r.body.toString('utf8')) } } catch { return { ok: false, error: 'A fonte devolveu algo que não é JSON.' } }
}
