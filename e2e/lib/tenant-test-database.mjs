// Owns a disposable database. Never consumes DATABASE_URL or a remote server.
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort } from "./server.mjs";
const require = createRequire(import.meta.url);

export async function tenantTestDatabase() {
  if (process.env.NOVA7_TEST_DB !== "postgres") {
    const mods = process.env.NOVA7_TEST_MODULES;
    if (!mods)
      throw Error(
        "Set NOVA7_TEST_DB=postgres or NOVA7_TEST_MODULES for optional PGlite dependencies. No remote DB is used.",
      );
    const { PGlite } = require(mods + "/@electric-sql/pglite");
    const db = new PGlite();
    db.kind = "pglite";
    db.adminUrl = "postgresql://postgres@127.0.0.1:55439/postgres";
    db.runtimeUrl = db.adminUrl;
    return db;
  }
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const directory = await mkdtemp(join(tmpdir(), "nova7-owner-postgres-"));
  const port = await freePort(),
    password = randomBytes(24).toString("hex");
  const postgres = new EmbeddedPostgres({
    databaseDir: directory,
    user: "postgres",
    password,
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: () => {},
  });
  let client;
  try {
    await postgres.initialise();
    await postgres.start();
    const database = "nova7_owners_test_" + randomBytes(6).toString("hex");
    await postgres.createDatabase(database);
    client = postgres.getPgClient(database, "127.0.0.1");
    await client.connect();
    const adminUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = "nova7_runtime";
    let closed = false;
    return {
      kind: "postgres",
      adminUrl,
      runtimeUrl: runtimeUrl.toString(),
      query: async (sql, args = []) => {
        const result = await client.query(sql, args);
        return { ...result, affectedRows: result.rowCount };
      },
      exec: (sql) => client.query(sql),
      prepareRuntime: async () => {
        const statement = (
          await client.query(
            "select format('alter role nova7_runtime login password %L',$1::text)as statement",
            [password],
          )
        ).rows[0].statement;
        await client.query(statement);
      },
      close: async () => {
        if (closed) return;
        closed = true;
        await client.end();
        await postgres.stop();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await client?.end().catch(() => {});
    await postgres.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
