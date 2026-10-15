// Ambiente de teste isolado: cada suíte ganha um SCHEMA próprio no mesmo Postgres (tabelas, usuários e dados só dela).
// Nada do que o teste faz toca os dados reais, e suítes diferentes rodam em paralelo sem se atrapalhar.
import { randomBytes, scrypt } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { sslFor } from './pg-local.mjs'

const require = createRequire(new URL('../../package.json', import.meta.url))
const pg = require('pg')
const MIGRATIONS = fileURLToPath(new URL('../../db/migrations/', import.meta.url))

export const PASSWORD = 'Senha-Teste-1'
export const USERS = [
  { u: 'teste_e2e', name: 'Admin Teste', role: 'admin' },
  { u: 'e2e_ed', name: 'Editor Teste', role: 'editor' },
  { u: 'e2e_vw', name: 'Leitor Teste', role: 'viewer' },
]


/** URL do banco apontando para um schema (SÓ ele: sem `public`, para nunca cair nas tabelas reais por engano). */
export function withSchema(url, schema) {
  const u = new URL(url)
  // fuso UTC: igual ao banco real (Supabase), para as horas gravadas e lidas pelos testes não variarem com o fuso da máquina
  u.searchParams.set('options', `-c search_path=${schema} -c timezone=UTC`)
  return u.toString()
}

export const newSchemaName = (suite) => `e2e_${suite.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 24)}_${randomBytes(3).toString('hex')}`

async function admin(url, fn) {
  const c = new pg.Client({ connectionString: url, ssl: sslFor(url) })
  await c.connect()
  try { return await fn(c) } finally { await c.end() }
}

export const dropSchema = (url, schema) => admin(url, (c) => c.query(`drop schema if exists ${schema} cascade`))

/** Apaga schemas de teste que sobraram de execuções interrompidas. */
export async function sweepSchemas(url) {
  return admin(url, async (c) => {
    const rows = (await c.query(`select schema_name from information_schema.schemata where schema_name like 'e2e\\_%'`)).rows
    for (const r of rows) await c.query(`drop schema if exists ${r.schema_name} cascade`)
    return rows.length
  })
}

const hash = () => {
  const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64, salt = randomBytes(16)
  return new Promise((res, rej) => scrypt(PASSWORD.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? rej(e) : res(['scrypt', N, R, P, salt.toString('base64'), k.toString('base64')].join('$')))))
}

/**
 * Cria o schema, aplica TODAS as migrações em uma única chamada ao banco (uma ida e volta, não dezenas) e cria os três usuários
 * de teste (administrador, editor e leitor). Tudo em uma conexão só: leva poucos segundos em vez de ~20.
 */
export async function provision(url, schema) {
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()
  const sql = (await Promise.all(files.map((f) => readFile(MIGRATIONS + f, 'utf8')))).join('\n;\n')
  const h = await hash() // um hash serve para os três (mesma senha)
  await admin(url, async (c) => {
    await c.query(`create schema ${schema}`)
    await c.query(`set search_path to ${schema}`)
    try {
      await c.query(`begin;\n${sql}\n;commit;`)
    } catch (e) {
      await c.query('rollback').catch(() => {})
      throw new Error(`migração falhou: ${e.message}`)
    }
    for (const x of USERS) {
      await c.query(
        `insert into users (username, username_normalized, password_hash, role, display_name, must_change_password) values ($1, $1, $2, $3, $4, false)`,
        [x.u, h, x.role, x.name])
    }
  })
}
