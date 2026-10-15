// Postgres local (embutido, sem Docker) para os testes: consultas em ~0,3 ms em vez de ~200 ms até o banco remoto,
// e o app, durante o teste, não tem como alcançar o banco real (a única URL que ele recebe é a local).
import EmbeddedPostgres from 'embedded-postgres'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { freePort } from './server.mjs'

const DATA = fileURLToPath(new URL('../.pgdata', import.meta.url))
const PASSWORD = 'e2e'

/**
 * Se uma execução anterior foi interrompida, o servidor dela (ou um processo filho) pode ter ficado vivo segurando a pasta.
 * Derruba SÓ os processos do Postgres embutido deste projeto (pela linha de comando, que traz o caminho do pacote; nenhum outro Postgres da máquina) e limpa a trava.
 */
function clearStale() {
  const pidFile = `${DATA}/postmaster.pid`
  if (process.platform === 'win32') {
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Where-Object { $_.CommandLine -like '*embedded-postgres*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' })
  } else if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').split('\n')[0])
    if (pid) { try { process.kill(pid, 'SIGKILL') } catch { /* já não existe */ } }
  }
  rmSync(pidFile, { force: true })
}

export async function startLocalPg() {
  const port = await freePort()
  const make = () => new EmbeddedPostgres({ databaseDir: DATA, user: 'postgres', password: PASSWORD, port, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
  let pg = make()
  // o cluster é criado uma vez (leva ~10 s) e reaproveitado nas execuções seguintes
  if (!existsSync(`${DATA}/PG_VERSION`)) await pg.initialise()
  try {
    await pg.start()
  } catch {
    // execução anterior interrompida: derruba o que sobrou (passo lento, por isso só depois da primeira falha) e tenta de novo
    clearStale()
    pg = make()
    try { await pg.start() } catch (e) { throw new Error(`não consegui iniciar o Postgres local: ${e?.message ?? e ?? 'erro desconhecido'}`) }
  }
  return {
    url: `postgres://postgres:${PASSWORD}@127.0.0.1:${port}/postgres`,
    // desligamento normal; só se a trava ficou para trás (desligou mal) é que derruba à força
    stop: async () => { await pg.stop().catch(() => {}); if (existsSync(`${DATA}/postmaster.pid`)) clearStale() },
  }
}

/** O banco local não usa SSL; o remoto (Supabase) exige. */
export const sslFor = (url) => (/@(127\.0\.0\.1|localhost)[:/]/.test(url) ? false : { rejectUnauthorized: false })
