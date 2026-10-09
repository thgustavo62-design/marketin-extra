import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const dir = join(import.meta.dirname, '..', 'db', 'migrations')
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
await client.query(
  'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
)
await client.query('alter table schema_migrations enable row level security')
const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name))
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

for (const file of files) {
  if (done.has(file)) continue
  const sql = await readFile(join(dir, file), 'utf8')
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('insert into schema_migrations (name) values ($1)', [file])
    await client.query('commit')
    console.log('aplicada:', file)
  } catch (e) {
    await client.query('rollback')
    console.error('falhou:', file, e.message)
    process.exitCode = 1
    break
  }
}
await client.end()
