import { pool } from './db'
import { encryptionKey, openSecret } from './windsor-secret'
type Config = { encrypted_secret: string | null; enabled: boolean }
async function stored(): Promise<Config | undefined> {
  try { return (await pool.query<Config>("select encrypted_secret, enabled from integration_credentials where provider = 'windsor'")).rows[0] }
  catch (e) { if ((e as { code?: string }).code === '42P01') return undefined; throw e }
}
// Credential is shared by this workspace. Account/brand permissions remain applied by insights loaders.
export async function getWindsorKey(): Promise<string | undefined> {
  const row = await stored()
  if (row) return row.enabled && row.encrypted_secret ? openSecret(row.encrypted_secret) : undefined
  return process.env.WINDSOR_API_KEY || undefined
}
export async function windsorConfigStatus() {
  const row = await stored()
  let protectedStorage = true
  try { encryptionKey() } catch { protectedStorage = false }
  return { configured: row ? row.enabled && !!row.encrypted_secret : !!process.env.WINDSOR_API_KEY, source: row ? 'workspace' : 'server', protectedStorage }
}
