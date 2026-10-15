// Sobe e derruba um servidor do app (build de produção) para uma suíte.
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const NEXT = fileURLToPath(new URL('../../node_modules/next/dist/bin/next', import.meta.url))
const reserved = new Set() // portas já sorteadas nesta execução: duas suítes nunca recebem a mesma

export async function freePort() {
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const s = net.createServer()
      s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
      s.on('error', reject)
    })
    if (!reserved.has(port)) { reserved.add(port); return port }
  }
}

/**
 * Sobe o `next start` numa porta livre. Só considera o servidor pronto quando o PRÓPRIO processo imprime "Ready":
 * se a porta já estivesse em uso por outro servidor, responder à requisição não bastaria (a suíte falaria com o servidor
 * de outra suíte e enxergaria dados alheios). Se o processo cair, tenta outra porta.
 */
export async function startServer({ env }) {
  let lastLog = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const port = await freePort()
    const child = spawn(process.execPath, [NEXT, 'start', '-p', String(port)], { cwd: ROOT, env: { ...process.env, ...env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    child.stdout.on('data', (d) => { log += d }); child.stderr.on('data', (d) => { log += d })
    const t0 = Date.now()
    let ready = false
    while (!ready && child.exitCode === null && Date.now() - t0 < 45_000) {
      if (/Ready in/i.test(log)) ready = true
      else await new Promise((r) => setTimeout(r, 100))
    }
    if (ready && child.exitCode === null) {
      const base = `http://127.0.0.1:${port}`
      for (let i = 0; i < 40; i++) { // confirma que responde
        try { const r = await fetch(base + '/login', { redirect: 'manual' }); if (r.status < 500) return { base, child, log: () => log } } catch { /* ainda aquecendo */ }
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    lastLog = log
    stopServer(child)
  }
  throw new Error('não consegui subir o servidor do app em 3 tentativas:\n' + lastLog.slice(-500))
}

export function stopServer(child) {
  if (!child || child.exitCode !== null) return
  // no Windows o processo do Next tem filhos: derruba a árvore inteira
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}
