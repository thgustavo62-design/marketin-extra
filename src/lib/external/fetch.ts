// Busca em fontes abertas, com trava de segurança: só https, só estes domínios, sem seguir redirecionamento para outro domínio,
// com tempo e tamanho máximos. Nenhum endereço vem do usuário (evita SSRF) e nenhuma chave é enviada.
const ALLOWED_HOSTS = new Set(['brasilapi.com.br', 'servicodados.ibge.gov.br', 'www.gov.br'])
export const USER_AGENT = 'ExtraMarketing/1.0 (uso interno; dados abertos)' // cabecalho HTTP: somente ASCII (o IBGE devolve 400 com acento)

export async function safeFetch(url: string, opts: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}): Promise<{ ok: true; body: Buffer } | { ok: false; error: string }> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024
  let current = url
  for (let hop = 0; hop < 3; hop++) {
    let u: URL
    try { u = new URL(current) } catch { return { ok: false, error: 'Endereço inválido.' } }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return { ok: false, error: 'Fonte não permitida.' }
    let res: Response
    try {
      res = await fetch(u, { redirect: 'manual', cache: 'no-store', headers: { 'User-Agent': USER_AGENT, Accept: opts.accept ?? '*/*' }, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) })
    } catch (e) {
      return { ok: false, error: e instanceof Error && e.name === 'TimeoutError' ? 'A fonte demorou demais para responder.' : 'Não foi possível acessar a fonte.' }
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { ok: false, error: 'Redirecionamento inválido.' }
      current = new URL(loc, u).toString()
      continue
    }
    if (!res.ok) return { ok: false, error: `A fonte respondeu com erro ${res.status}.` }
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > maxBytes) return { ok: false, error: 'O arquivo da fonte é maior que o limite aceito.' }
    const chunks: Buffer[] = []
    let total = 0
    const reader = res.body?.getReader()
    if (!reader) return { ok: false, error: 'Resposta vazia da fonte.' }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel(); return { ok: false, error: 'O arquivo da fonte é maior que o limite aceito.' } }
      chunks.push(Buffer.from(value))
    }
    return { ok: true, body: Buffer.concat(chunks) }
  }
  return { ok: false, error: 'Redirecionamentos demais.' }
}

export async function fetchJson(url: string, timeoutMs = 20_000): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const r = await safeFetch(url, { timeoutMs, maxBytes: 5 * 1024 * 1024, accept: 'application/json' })
  if (!r.ok) return r
  try { return { ok: true, json: JSON.parse(r.body.toString('utf8')) } } catch { return { ok: false, error: 'A fonte devolveu algo que não é JSON.' } }
}
