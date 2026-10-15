// Executor dos testes de ponta a ponta (navegador de verdade). Uso:
//   npm run e2e                      roda tudo, em paralelo, cada suíte com banco (schema) e servidor próprios
//   npm run e2e -- --only botao-coleta,inteligencia
//   npm run e2e -- --skip net,windsor   pula suítes que dependem de internet/Windsor (rápido e sem rede)
//   npm run e2e -- --jobs 6 --keep      mais paralelismo / não apagar o schema ao final (para investigar)
//   npm run e2e -- --remote             usa o banco do .env (schemas isolados) em vez do Postgres local embutido
//   npm run e2e -- --list
// Por padrão os testes rodam num Postgres LOCAL embutido (rápido) e o app só recebe a URL local: nunca toca nos dados reais.
// Os logs de cada suíte ficam em e2e/.out/<suite>.log (cada linha com o tempo desde o início da suíte).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dropSchema, newSchemaName, provision, sweepSchemas, withSchema } from './lib/schema.mjs'
import { startLocalPg } from './lib/pg-local.mjs'
import { startServer, stopServer } from './lib/server.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SUITES = join(ROOT, 'e2e', 'suites')
const OUT = join(ROOT, 'e2e', '.out')

const argv = process.argv.slice(2)
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i < 0 ? def : argv[i + 1] }
const flag = (name) => argv.includes(`--${name}`)
const JOBS = Number(opt('jobs', 6))
const ONLY = opt('only', '')?.split(',').filter(Boolean) ?? []
const SKIP = opt('skip', '')?.split(',').filter(Boolean) ?? []
const TIMEOUT_MS = Number(opt('timeout', 360)) * 1000

if (flag('remote') && !process.env.DATABASE_URL) { console.error('Sem DATABASE_URL. Rode com: npm run e2e -- --remote (que carrega o .env).'); process.exit(2) }
let localPg = null
let DB = process.env.DATABASE_URL // com o Postgres local (padrão) é trocada pela URL local em main()

async function discover() {
  const out = []
  for (const f of (await readdir(SUITES)).filter((x) => x.endsWith('.mjs')).sort()) {
    const head = (await readFile(join(SUITES, f), 'utf8')).split('\n').slice(0, 8).join('\n')
    out.push({ name: basename(f, '.mjs'), file: join(SUITES, f), needs: (/@needs:[ \t]*(.*)/.exec(head)?.[1] ?? '').split(/\s+/).filter(Boolean), title: /@title:[ \t]*(.*)/.exec(head)?.[1] ?? '' })
  }
  return out
}

/** Data da modificação mais recente entre arquivos e pastas (varre as pastas). */
function newestMtime(paths) {
  let newest = 0
  const walk = (p) => {
    if (!existsSync(p)) return
    const st = statSync(p)
    newest = Math.max(newest, st.mtimeMs)
    if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f))
  }
  paths.forEach(walk)
  return newest
}

const fmt = (ms) => (ms < 60_000 ? `${(ms / 1000).toFixed(0)}s` : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`)

async function runSuite(s) {
  const t0 = Date.now()
  const schema = newSchemaName(s.name)
  const url = withSchema(DB, schema)
  let server = null
  const res = { name: s.name, ok: false, summary: '', fails: [], ms: 0, error: '' }
  try {
    await provision(DB, schema)
    const tSetup = Date.now() - t0
    server = await startServer({ env: { DATABASE_URL: url } })
    const log = await new Promise((resolve) => {
      const child = spawn(process.execPath, [s.file], { cwd: ROOT, env: { ...process.env, BASE: server.base, DATABASE_URL: url, E2E_OUT: OUT, E2E_SUITE: s.name }, stdio: ['ignore', 'pipe', 'pipe'] })
      // cada linha do log leva o tempo desde o início da suíte: dá para ver na hora o que é lento
      let buf = '', pend = ''
      const t1 = Date.now()
      const stamp = (l) => `[+${((Date.now() - t1) / 1000).toFixed(0).padStart(3)}s] ${l}\n`
      const feed = (d) => { pend += d; const parts = pend.split('\n'); pend = parts.pop(); for (const l of parts) buf += stamp(l) }
      child.stdout.on('data', feed); child.stderr.on('data', feed)
      const timer = setTimeout(() => { buf += stamp(`FAIL  tempo esgotado (${TIMEOUT_MS / 1000}s)`); spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); child.kill() }, TIMEOUT_MS)
      child.on('close', () => { clearTimeout(timer); if (pend) buf += stamp(pend); resolve(buf) })
    })
    await writeFile(join(OUT, `${s.name}.log`), log)
    const m = /(\d+)\/(\d+) verificações passaram/.exec(log)
    res.fails = log.split('\n').filter((l) => /\] (FAIL|PAGEERROR)/.test(l)).map((l) => l.replace(/^\[\+\s*\d+s\] /, '').slice(0, 240))
    res.summary = m ? `${m[1]}/${m[2]}` : 'sem resultado'
    res.setup = tSetup
    res.ok = Boolean(m) && m[1] === m[2] && res.fails.length === 0
  } catch (e) {
    res.error = String(e.message ?? e).slice(0, 500)
  } finally {
    stopServer(server?.child)
    if (!flag('keep')) await dropSchema(DB, schema).catch(() => {})
    res.ms = Date.now() - t0
  }
  return res
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const all = await discover()
  if (flag('list')) { for (const s of all) console.log(`${s.name.padEnd(28)} ${s.needs.join(',').padEnd(14)} ${s.title}`); return }
  let chosen = all.filter((s) => (!ONLY.length || ONLY.includes(s.name)) && !s.needs.some((n) => SKIP.includes(n)))
  if (!chosen.length) { console.error('Nenhuma suíte escolhida.'); process.exit(2) }
  // as que dependem de rede/Windsor são as mais lentas: saem primeiro, para o conjunto terminar antes
  chosen = chosen.sort((a, b) => b.needs.length - a.needs.length)

  // o build é refeito sozinho quando algum arquivo do app mudou depois dele (teste de build velho engana)
  const buildId = join(ROOT, '.next', 'BUILD_ID')
  const stale = existsSync(buildId) && newestMtime([join(ROOT, 'src'), join(ROOT, 'next.config.ts'), join(ROOT, 'package.json'), join(ROOT, 'db', 'migrations')]) > statSync(buildId).mtimeMs
  if (flag('build') || stale || !existsSync(buildId)) {
    console.log(stale ? 'O código mudou desde o último build: gerando de novo (npm run build)…' : 'Gerando o build de produção (npm run build)…')
    const b = spawnSync('npm run build', { cwd: ROOT, shell: true, stdio: 'inherit' })
    if (b.status !== 0) { console.error('Build falhou.'); process.exit(2) }
  }
  let local = null
  if (!flag('remote')) {
    const tp = Date.now()
    local = localPg = await startLocalPg()
    DB = local.url
    console.log(`Postgres local pronto em ${fmt(Date.now() - tp)}.`)
  }
  const swept = await sweepSchemas(DB)
  if (swept) console.log(`(limpei ${swept} schema(s) de teste que tinham sobrado)`)

  const t0 = Date.now()
  console.log(`Rodando ${chosen.length} suíte(s), ${Math.min(JOBS, chosen.length)} em paralelo…\n`)
  const results = []
  const queue = [...chosen]
  await Promise.all(Array.from({ length: Math.min(JOBS, chosen.length) }, async () => {
    while (queue.length) {
      const s = queue.shift()
      const r = await runSuite(s)
      results.push(r)
      console.log(`${r.ok ? '✔' : '✖'} ${r.name.padEnd(28)} ${(r.summary || '—').padEnd(9)} ${fmt(r.ms).padEnd(6)} (preparo ${fmt(r.setup ?? 0)})${r.error ? '  ERRO: ' + r.error.split('\n')[0] : ''}`)
      for (const f of r.fails.slice(0, 6)) console.log(`    ${f}`)
    }
  }))
  const bad = results.filter((r) => !r.ok)
  console.log(`\n${results.length - bad.length}/${results.length} suítes passaram em ${fmt(Date.now() - t0)}.${bad.length ? ' Falharam: ' + bad.map((b) => b.name).join(', ') + '. Logs em e2e/.out/' : ''}`)
  await local?.stop()
  process.exit(bad.length ? 1 : 0)
}
// o Postgres local sempre é parado, mesmo com erro ou Ctrl+C
const bye = async (code) => { await localPg?.stop(); process.exit(code) }
process.on('SIGINT', () => bye(130))
main().catch(async (e) => { console.error(e); await bye(2) })
