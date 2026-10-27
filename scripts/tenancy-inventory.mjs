// No migration or data updates. Rejects an unrelated Supabase project before connecting.
import pg from "pg";
import { tenancyInventory } from "./lib/tenancy-inventory.mjs";
const value = process.env.DATABASE_URL;
if (!value)
  throw Error(
    "Configure DATABASE_URL no ambiente autorizado; a credencial não será exibida.",
  );
let url;
try {
  url = new URL(value);
} catch {
  throw Error("DATABASE_URL inválida; nenhuma consulta foi executada.");
}
if (!["postgres:", "postgresql:"].includes(url.protocol))
  throw Error("Use uma conexão PostgreSQL válida.");
const ref = process.env.NOVA7_PROJECT_REF;
const local = ["localhost", "127.0.0.1"].includes(url.hostname);
const fixture =
  local &&
  process.env.NOVA7_INVENTORY_LOCAL_FIXTURE === "1" &&
  /^\/nova7_owners_test_[a-f0-9]+$/.test(url.pathname);
const expected =
  !local &&
  ref &&
  /^[a-z0-9]{20}$/.test(ref) &&
  (url.hostname === `db.${ref}.supabase.co` ||
    (url.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(url.username).endsWith("." + ref)));
if (!fixture && !expected)
  throw Error(
    "Inventário bloqueado: confirme NOVA7_PROJECT_REF e a conexão do projeto correto. Nenhuma consulta foi executada.",
  );
const ca = process.env.DATABASE_CA?.replace(/\\n/g, "\n");
const client = new pg.Client({
  connectionString: value,
  ssl: local
    ? false
    : ca
      ? { ca, rejectUnauthorized: true }
      : { rejectUnauthorized: true },
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});
try {
  await client.connect();
  console.log(JSON.stringify(await tenancyInventory(client), null, 2));
} catch (error) {
  console.error("Inventário não concluído.", error.code || error.name);
  process.exitCode = 1;
} finally {
  await client.end();
}
