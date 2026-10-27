import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const secret = "fixture-password-must-not-appear";
const ref = "abcdefghijklmnopqrst";
for (const [name, url, fixture] of [
  [
    "outro projeto",
    `postgresql://postgres:${secret}@db.zyxwvutsrqponmlkjihg.supabase.co/postgres`,
    "",
  ],
  [
    "host arbitrário com login parecido",
    `postgresql://postgres.${ref}:${secret}@example.invalid/postgres`,
    "",
  ],
  [
    "sufixo de pooler falso",
    `postgresql://postgres.${ref}:${secret}@a.pooler.supabase.com.example.invalid/postgres`,
    "",
  ],
  [
    "banco local fora da suíte",
    `postgresql://postgres:${secret}@127.0.0.1:1/postgres`,
    "1",
  ],
  ["URL malformada com senha", `invalid ${secret}`, ""],
])
  test(`inventário recusa ${name} antes de consultar e sem imprimir credenciais`, () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/tenancy-inventory.mjs"],
      {
        encoding: "utf8",
        timeout: 3000,
        env: {
          ...process.env,
          DATABASE_URL: url,
          NOVA7_PROJECT_REF: ref,
          NOVA7_INVENTORY_LOCAL_FIXTURE: fixture,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes(secret));
    assert.ok(!result.stderr.includes("ECONNREFUSED"));
  });

test("inventário aceita somente o banco descartável local explicitamente autorizado", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/tenancy-inventory.mjs"],
    {
      encoding: "utf8",
      timeout: 3000,
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://postgres:${secret}@127.0.0.1:1/nova7_owners_test_abc123`,
        NOVA7_PROJECT_REF: ref,
        NOVA7_INVENTORY_LOCAL_FIXTURE: "1",
      },
    },
  );
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes("ECONNREFUSED"));
  assert.ok(!result.stderr.includes(secret));
  assert.ok(!result.stderr.includes("Inventário bloqueado"));
});
