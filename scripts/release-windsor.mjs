// Explicit, idempotent release operation. No key values are logged.
import pg from 'pg'
import { readFileSync } from 'node:fs'
const u = new URL(process.env.DATABASE_URL || '')
if (!u.hostname.includes('ylumiasccwgdoesxuind') && !u.username.includes('ylumiasccwgdoesxuind')) throw Error('Unexpected database project')
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 30000 })
try {
  await db.connect()
  const check = (await db.query("select current_schema() as schema, to_regclass('public.users') as users, to_regclass('public.promo_campaigns') as campaigns")).rows[0]
  if (check.schema !== 'public' || !check.users || !check.campaigns) throw Error('Database schema does not match marketing application')
  if (!(await db.query("select 1 from schema_migrations where name='034_nova7_studio.sql'")).rowCount) throw Error('Expected migration 034 is missing')
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock(hashtext('nova7-windsor-release-035'))")
  if (!(await db.query("select 1 from schema_migrations where name='035_windsor_credentials.sql'")).rowCount) {
    if ((await db.query("select to_regclass('public.integration_credentials') as existing")).rows[0].existing) throw Error('Untracked credentials table; manual review required')
    await db.query(readFileSync('db/migrations/035_windsor_credentials.sql', 'utf8'))
    await db.query("insert into schema_migrations(name) values('035_windsor_credentials.sql')")
  }
  const fields = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='integration_credentials'")).rows.map(r => r.column_name)
  if (!['provider', 'encrypted_secret', 'enabled', 'updated_by', 'updated_at'].every(c => fields.includes(c))) throw Error('Credentials table validation failed')
  if (!(await db.query("select relrowsecurity from pg_class where oid='public.integration_credentials'::regclass")).rows[0].relrowsecurity) throw Error('Credentials RLS validation failed')
  const grants = await db.query("select 1 from information_schema.role_table_grants where table_schema='public' and table_name='integration_credentials' and grantee in ('PUBLIC','anon','authenticated','service_role')")
  if (grants.rowCount) throw Error('Public credentials access detected')
  await db.query('commit')
  console.log('NOVA7_RELEASE: migration 035 verified; credential table protected by RLS; no public grants.')
} catch (e) {
  await db.query('rollback').catch(() => {})
  console.error('NOVA7_RELEASE_FAILED:', e.code || 'validation')
  process.exitCode = 1
} finally { await db.end() }
