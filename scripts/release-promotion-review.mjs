import pg from "pg";
import { readFileSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL || "");
if (
  !url.hostname.includes("ylumiasccwgdoesxuind") &&
  !url.username.includes("ylumiasccwgdoesxuind")
)
  throw Error("Unexpected database project");
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  statement_timeout: 30000,
});
const tables = [
  "promo_imports",
  "promo_grouping_rules",
  "promo_grouping_memory",
  "promo_theme_versions",
];
try {
  await db.connect();
  if (
    (await db.query("select current_schema() as schema")).rows[0].schema !==
    "public"
  )
    throw Error("Unexpected schema");
  if (
    !(
      await db.query(
        "select 1 from schema_migrations where name='035_windsor_credentials.sql'",
      )
    ).rowCount
  )
    throw Error("Migration 035 is required");
  await db.query("begin");
  await db.query(
    "select pg_advisory_xact_lock(hashtext('nova7-promotion-review-036'))",
  );
  if (
    !(
      await db.query(
        "select 1 from schema_migrations where name='036_promotion_review.sql'",
      )
    ).rowCount
  ) {
    const existing = await db.query(
      "select tablename from pg_tables where schemaname='public' and tablename=any($1::text[])",
      [tables],
    );
    if (existing.rowCount)
      throw Error("Untracked review tables; manual review required");
    await db.query(
      readFileSync("db/migrations/036_promotion_review.sql", "utf8"),
    );
    await db.query(
      "insert into schema_migrations(name) values('036_promotion_review.sql')",
    );
  }
  const protectedTables = (
    await db.query(
      "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname=any($1::text[])",
      [tables],
    )
  ).rows;
  if (
    protectedTables.length !== 4 ||
    protectedTables.some((t) => !t.relrowsecurity)
  )
    throw Error("Review table RLS validation failed");
  if (
    (
      await db.query(
        "select 1 from information_schema.role_table_grants where table_schema='public' and table_name=any($1::text[]) and grantee in ('PUBLIC','anon','authenticated','service_role')",
        [tables],
      )
    ).rowCount
  )
    throw Error("Public review grants found");
  for (const [table, column] of [
    ["promo_campaigns", "brand_id"],
    ["promo_items", "photo_image_ids"],
    ["products", "commercial_attributes"],
    ["promo_themes", "version"],
    ["promo_themes", "active"],
  ])
    if (
      !(
        await db.query(
          "select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2",
          [table, column],
        )
      ).rowCount
    )
      throw Error("Review column verification failed");
  await db.query("commit");
  console.log(
    "NOVA7_RELEASE: migration 036 verified; review tables protected by RLS; campaign scope and photo columns verified.",
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("NOVA7_RELEASE_FAILED:", e.code || "validation");
  process.exitCode = 1;
} finally {
  await db.end();
}
