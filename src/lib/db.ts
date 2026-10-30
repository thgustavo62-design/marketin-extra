import pg from "pg";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

declare global {
  var __pgPool: pg.Pool | undefined;
  var __nova7RuntimePool: pg.Pool | undefined;
}
const ca = process.env.DATABASE_CA?.replace(/\\n/g, "\n");
const local = (url: string | undefined) =>
  /@(127\.0\.0\.1|localhost)[:/]/.test(url ?? "");
function makePool(url: string | undefined) {
  return new pg.Pool({
    connectionString: url,
    ssl: local(url)
      ? false
      : ca
        ? { ca, rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 20000,
  });
}
// Internal authentication only. Commercial repositories must use pool/withTx below.
export const authDb: pg.Pool =
  globalThis.__pgPool ?? makePool(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== "production") globalThis.__pgPool = authDb;
let runtime: pg.Pool | undefined = globalThis.__nova7RuntimePool;
function runtimePool() {
  if (runtime) return runtime;
  const url =
    process.env.DATABASE_RUNTIME_URL ??
    (local(process.env.DATABASE_URL) ? process.env.DATABASE_URL : undefined);
  if (!url)
    throw Error(
      "Configure DATABASE_RUNTIME_URL com o papel restrito antes de ativar a hierarquia.",
    );
  runtime = makePool(url);
  if (process.env.NODE_ENV !== "production")
    globalThis.__nova7RuntimePool = runtime;
  return runtime;
}
async function context() {
  try {
    const jar = await cookies(),
      token =
        jar.get(
          process.env.NODE_ENV === "production"
            ? "__Host-extra_session"
            : "extra_session",
        )?.value ?? "",
      scope = (jar.get("extra_scope")?.value ?? "").split("|");
    return {
      hash: token ? createHash("sha256").update(token).digest("hex") : "",
      slug: scope[0] ?? "",
      branch: scope[1] ?? "",
    };
  } catch {
    return { hash: "", slug: "", branch: "" };
  }
}
export async function withTx<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  anonymous = false,
): Promise<T> {
  const client = await runtimePool().connect();
  try {
    const ctx = anonymous ? { hash: "", slug: "", branch: "" } : await context(),
      role = process.env.NOVA7_DB_ROLE || "nova7_app";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(role))
      throw Error("Papel de banco inválido.");
    if (!local(process.env.DATABASE_RUNTIME_URL ?? process.env.DATABASE_URL)) {
      const login = (
        await client.query(
          "select rolname,rolsuper,rolbypassrls from pg_roles where rolname=session_user",
        )
      ).rows[0];
      if (
        login?.rolname !== "nova7_runtime" ||
        login.rolsuper ||
        login.rolbypassrls
      )
        throw Error(
          "A conexão comercial exige o login nova7_runtime sem privilégios elevados.",
        );
    }
    await client.query("begin");
    await client.query(
      "select set_config('role',$1,true),set_config('nova7.session_hash',$2,true),set_config('nova7.company_slug',$3,true),set_config('nova7.branch_id',$4,true)",
      [role, ctx.hash, ctx.slug, ctx.branch],
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
const query = (async (...args: unknown[]) =>
  withTx((client) =>
    (client.query as (...v: unknown[]) => Promise<pg.QueryResult>).apply(
      client,
      args,
    ),
  )) as pg.Pool["query"];
export const pool: Pick<pg.Pool, "query" | "end"> = {
  query,
  end: async () => {
    await runtime?.end();
    await authDb.end();
  },
};
