import pg from 'pg'
import { scrypt, randomBytes } from 'node:crypto'

const username = process.env.INITIAL_ADMIN_USER
const password = process.env.INITIAL_ADMIN_PASSWORD
if (!username || !password) {
  console.error('Defina INITIAL_ADMIN_USER e INITIAL_ADMIN_PASSWORD (só para esta execução).')
  process.exit(1)
}

// Mesmo formato de src/lib/password.ts
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64
const salt = randomBytes(16)
const key = await new Promise((res, rej) =>
  scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? rej(e) : res(k))),
)
const hash = ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const normalized = username.trim().normalize('NFKC').toLowerCase()
const r = await client.query(
  `insert into users (username, username_normalized, password_hash, role)
   values ($1, $2, $3, 'admin') on conflict (username_normalized) do nothing returning id`,
  [username.trim(), normalized, hash],
)
console.log(r.rowCount ? `Usuário "${username}" criado.` : `Usuário "${username}" já existe; nada foi alterado.`)
await client.end()
