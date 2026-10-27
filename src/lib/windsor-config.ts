import { getSession } from "./session";
import { pool } from "./db";
import { encryptionKey, openSecret } from "./windsor-secret";
type Config = { encrypted_secret: string | null; enabled: boolean };
async function stored(): Promise<Config | undefined> {
  try {
    return (
      await pool.query<Config>(
        "select encrypted_secret, enabled from integration_credentials where provider = 'windsor' and company_id=nova7_private.active_company()",
      )
    ).rows[0];
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return undefined;
    throw e;
  }
}
// Credenciais comerciais são isoladas por empresa; a chave legada é exclusiva da administração.
export async function getWindsorKey(): Promise<string | undefined> {
  const row = await stored();
  if (row)
    return row.enabled && row.encrypted_secret
      ? openSecret(row.encrypted_secret)
      : undefined;
  return (await getSession())?.isPlatformAdmin
    ? process.env.WINDSOR_API_KEY || undefined
    : undefined;
}
export async function windsorConfigStatus() {
  const row = await stored();
  const serverKey =
    (await getSession())?.isPlatformAdmin && !!process.env.WINDSOR_API_KEY;
  let protectedStorage = true;
  try {
    encryptionKey();
  } catch {
    protectedStorage = false;
  }
  return {
    configured: row ? row.enabled && !!row.encrypted_secret : !!serverKey,
    source: row ? "workspace" : "server",
    protectedStorage,
  };
}
