import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import {
  seedLegacyTenancy,
  verifyLegacyTenancy,
} from "./lib/legacy-tenancy-fixture.mjs";
import { tenantTestDatabase } from "./lib/tenant-test-database.mjs";
import { browserTestRuntime } from "./lib/browser-test-runtime.mjs";
import https from "node:https";
import http from "node:http";
const require = createRequire(import.meta.url),
  mods = process.env.NOVA7_TEST_MODULES;
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = await tenantTestDatabase();
try {
  if (process.env.NOVA7_TEST_MIGRATION_ROLE === "limited") {
    await db.exec("create role migration_actor login createrole createdb");
    await db.exec(
      (
        await db.query(
          "select format('grant create on database %I to migration_actor',current_database())as statement",
        )
      ).rows[0].statement,
    );
    await db.exec(
      "alter schema public owner to migration_actor;set session authorization migration_actor",
    );
  }
  let migrationChecks = 0;
  let legacy;
  const base = fileURLToPath(new URL("../db/migrations/", import.meta.url));
  for (const f of (await readdir(base))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      if (f.startsWith("037_")) legacy = await seedLegacyTenancy(db);
      await db.exec(await readFile(base + f, "utf8"));
      if (f.startsWith("037_"))
        migrationChecks = await verifyLegacyTenancy(db, legacy);
    } catch (e) {
      throw Error(f + ": " + e.message);
    }
  }
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const uid = async (name, admin = false) =>
    (
      await one(
        "insert into users(username,username_normalized,display_name,password_hash,role,is_platform_admin)values($1,$1,$1,'test','employee',$2)returning id",
        [name, admin],
      )
    ).id;
  const admin = await uid("admin", true),
    a = await uid("owner_a"),
    b = await uid("owner_b"),
    staff = await uid("staff"),
    multi = await uid("multi");
  const owner = async (name, u) => {
    let id = (
      await one("insert into owners(name)values($1)returning id", [name])
    ).id;
    await db.query(
      "insert into subscriptions(owner_id,plan_name)values($1,'Teste')",
      [id],
    );
    await db.query("insert into subscription_limits values($1,3,6,10)", [id]);
    await db.query(
      "insert into owner_user_links(owner_id,user_id)values($1,$2)",
      [id, u],
    );
    return id;
  };
  const oa = await owner("Dono A", a),
    ob = await owner("Dono B", b);
  const company = async (o, n) =>
    (
      await one(
        "insert into companies(owner_id,name,slug)values($1,$2,$2)returning id",
        [o, n],
      )
    ).id;
  const ca = await company(oa, "company-a"),
    ca2 = await company(oa, "company-a2"),
    cb = await company(ob, "company-b");
  const branch = async (c, n) =>
    (
      await one(
        "insert into branches(brand_id,name)values($1,$2)returning id",
        [c, n],
      )
    ).id;
  const ba = await branch(ca, "A1"),
    ba2 = await branch(ca, "A2"),
    bb = await branch(cb, "B1");
  await db.query(
    "insert into employee_memberships(user_id,company_id,branch_id,role,permissions)values($1,$2,$3,'employee','{\"products\":\"write\"}')",
    [staff, ca, ba],
  );
  for (const c of [ca, cb])
    await db.query(
      "insert into employee_memberships(user_id,company_id,role,permissions)values($1,$2,'employee','{\"products\":\"read\"}')",
      [multi, c],
    );
  for (const u of [admin, a, b, staff, multi])
    await db.query(
      "insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 day')",
      [u, u],
    );
  let checks = migrationChecks;
  async function as(u, slug, branch, fn) {
    await db.exec("begin;set local role nova7_app");
    try {
      await db.query(
        "select set_config('nova7.session_hash',$1,true),set_config('nova7.company_slug',$2,true),set_config('nova7.branch_id',$3,true)",
        [u, slug, branch || ""],
      );
      await fn();
      await db.exec("commit");
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }
  // Regression: real PostgreSQL INSERT ... RETURNING evaluates SELECT policy
  // before a STABLE existence lookup can see the new branch.
  await as(a, "company-a", null, async () => {
    const created = await one("insert into branches(brand_id,name)values($1,'Owner-created A3')returning id", [ca]);
    assert.ok(created.id);
    await db.query("delete from branches where id=$1", [created.id]);
  });
  checks++;
  const count = async (t) =>
    Number((await one(`select count(*) as n from ${t}`)).n);
  const eq = (x, y) => {
    assert.deepEqual(x, y);
    checks++;
  };
  await as(a, "company-a", null, async () => {
    eq(await count("companies"), 2);
    eq(await count("branches"), 2);
    await db.query(
      "insert into products(description,name_key,search,company_id)values('Produto A','produto-a','produto a',$1)",
      [ca],
    );
  });
  await as(b, "company-b", null, async () => {
    eq(await count("companies"), 1);
    eq(await count("products"), 0);
    await db.query(
      "insert into products(description,name_key,search,company_id)values('Produto B','produto-b','produto b',$1)",
      [cb],
    );
  });
  await as(a, "company-b", null, async () => {
    eq(await count("products"), 0);
  });
  await as(staff, "company-a", ba, async () => {
    eq(await count("companies"), 1);
    eq(await count("branches"), 1);
    await db.query(
      "insert into products(description,name_key,search)values('Filial A1','filial-a1','filial a1')",
    );
  });
  await as(staff, "company-a", ba2, async () => {
    eq(await count("branches"), 1);
    eq(await count("products"), 2);
  });
  await as(multi, "company-b", null, async () => {
    eq(await count("companies"), 2);
    eq(await count("products"), 1);
  });
  const future = await branch(ca2, "Nova filial");
  await as(a, "company-a2", null, async () => eq(await count("branches"), 3));
  await as(a, "company-a", null, async () => eq(await count("products"), 2));
  // Denied mutations are rolled back independently, exactly like application transactions.
  async function denied(u, slug, branch, sql, args = []) {
    let blocked = false;
    try {
      await as(u, slug, branch, async () => {
        const r = await db.query(sql, args);
        if (r.affectedRows === 0) throw Error("No authorized row");
      });
    } catch {
      blocked = true;
    }
    assert.ok(blocked, "Mutation must be denied: " + sql);
    checks++;
  }
  const pa = (await one("select id from products where name_key='produto-a'"))
      .id,
    pb = (await one("select id from products where name_key='produto-b'")).id;
  const photo = async (c, p, hash) =>
    (
      await one(
        "insert into product_images(company_id,product_id,data,thumb,width,height,size_bytes,sha256,source)values($1,$2,'private bytes','thumb',1,1,13,$3,'upload')returning id",
        [c, p, hash.repeat(64)],
      )
    ).id;
  const ia = await photo(ca, pa, "a"),
    ib = await photo(cb, pb, "b");
  const ma = (
    await one(
      "insert into media_assets(brand_id,kind,title,mime_type,size_bytes,checksum_sha256)values($1,'file','Arquivo A','image/png',13,$2)returning id",
      [ca, "a".repeat(64)],
    )
  ).id;
  await db.query(
    "insert into media_blobs(asset_id,data)values($1,'private bytes')",
    [ma],
  );
  const campaignA = (
    await one(
      "insert into promo_campaigns(brand_id,name)values($1,'Campanha A')returning id",
      [ca],
    )
  ).id;
  const campaignB = (
    await one(
      "insert into promo_campaigns(brand_id,name)values($1,'Campanha B')returning id",
      [cb],
    )
  ).id;
  await db.query(
    "insert into promo_items(campaign_id,position,name,price,product_id,photo_image_ids)values($1,1,'Produto A',29.99,$2,array[$3::uuid])",
    [campaignA, pa, ia],
  );
  await as(a, "company-a", null, async () => {
    eq(await count("product_images"), 1);
    eq(await count("promo_campaigns"), 1);
    eq(await count("promo_items"), 1);
    eq(await count("media_blobs"), 1);
    eq(
      (await one("select data from media_blobs where asset_id=$1", [ma])).data
        .length,
      13,
    );
  });
  await as(b, "company-b", null, async () => {
    eq(await count("product_images"), 1);
    eq(await count("promo_campaigns"), 1);
    eq(await count("promo_items"), 0);
    eq(await count("media_blobs"), 0);
  });
  await as(staff, "company-a", ba, async () => {
    eq(await count("product_images"), 1);
    eq(await count("promo_campaigns"), 0);
    eq(await count("media_blobs"), 0);
  });
  await denied(
    a,
    "company-a",
    null,
    "insert into promo_items(campaign_id,position,name,price,product_id)values($1,2,'Intruso',5,$2)",
    [campaignA, pb],
  );
  await denied(
    a,
    "company-a",
    null,
    "insert into promo_items(campaign_id,position,name,price,photo_image_ids)values($1,2,'Intruso',5,array[$2::uuid])",
    [campaignA, ib],
  );
  await denied(
    a,
    "company-a",
    null,
    "insert into promo_items(campaign_id,position,name,price)values($1,2,'Intruso',5)",
    [campaignB],
  );
  await denied(
    a,
    "company-a",
    null,
    "insert into products(description,name_key,search,company_id)values('Intruso','intruso','intruso',$1)",
    [cb],
  );
  await denied(
    staff,
    "company-a",
    ba,
    "insert into products(description,name_key,search,company_id,branch_id)values('Outra filial','outra','outra',$1,$2)",
    [ca, ba2],
  );
  await denied(
    multi,
    "company-b",
    null,
    "insert into products(description,name_key,search)values('Sem escrita','sem','sem')",
  );
  await denied(
    a,
    "company-a",
    null,
    "update companies set owner_id=$1 where id=$2",
    [ob, ca],
  );
  await denied(
    a,
    "company-a",
    null,
    "update users set is_platform_admin=true where id=$1",
    [a],
  );
  await denied(
    a,
    "company-a",
    null,
    "select password_hash from users where id=$1",
    [a],
  );
  await denied(
    a,
    "company-a",
    null,
    "insert into companies(name,slug)values('Sem dono','sem-dono')",
  );
  await denied(
    staff,
    "company-a",
    ba,
    "insert into employee_memberships(user_id,company_id,role,permissions)values($1,$2,'manager','{}')",
    [staff, cb],
  );
  await db.query(
    "update subscription_limits set max_companies=2,max_branches=2,max_users=3 where owner_id=$1",
    [oa],
  );
  await denied(
    a,
    "company-a",
    null,
    "insert into companies(owner_id,name,slug)values($1,'Excedente','excedente')",
    [oa],
  );
  await denied(
    a,
    "company-a",
    null,
    "insert into branches(brand_id,name)values($1,'Excedente')",
    [ca],
  );
  const extraUser = await uid("extra_user");
  await denied(
    a,
    "company-a",
    null,
    "insert into employee_memberships(user_id,company_id,role,permissions)values($1,$2,'employee','{}')",
    [extraUser, ca],
  );
  await db.query(
    "update subscription_limits set max_companies=3,max_branches=6,max_users=10 where owner_id=$1",
    [oa],
  );
  await db.query(
    "insert into employee_memberships(user_id,company_id,role,permissions)values($1,$2,'employee','{\"products\":\"read\"}')",
    [staff, ca2],
  );
  await as(admin, "company-a", null, async () => {
    eq(await count("companies"), 5); // three test companies + two preserved legacy companies
    await db.query(
      "select set_config('nova7.transfer_reason','Autorização de teste verificada',true)",
    );
    await db.query("update companies set owner_id=$1 where id=$2", [ob, ca2]);
    eq(await count("ownership_transfers"), 1);
    eq(
      Number(
        (
          await one(
            "select count(*) as n from employee_memberships where company_id=$1 and active",
            [ca2],
          )
        ).n,
      ),
      0,
    );
  });
  await as(a, "company-a2", null, async () => eq(await count("products"), 0));
  const designer = await uid("designer");
  await db.query(
    "insert into sessions(user_id,token_hash,expires_at)values($1::uuid,$1::text,now()+interval '1 day')",
    [designer],
  );
  await db.query(
    "insert into employee_memberships(user_id,company_id,role,permissions)values($1,$2,'employee','{\"promotions\":\"write\"}')",
    [designer, ca],
  );
  let officialTheme;
  await as(admin, "company-a", null, async () => {
    officialTheme = (
      await one(
        "insert into promo_themes(company_id,name,official_code)values($1,'Modelo oficial de teste','CP-TEST')returning id",
        [ca],
      )
    ).id;
  });
  await as(designer, "company-a", null, async () =>
    eq(await count("promo_themes"), 1),
  );
  await denied(
    designer,
    "company-a",
    null,
    "update promo_themes set name='Alterado' where id=$1",
    [officialTheme],
  );
  await denied(
    designer,
    "company-a",
    null,
    "delete from promo_themes where id=$1",
    [officialTheme],
  );
  await denied(
    b,
    "company-b",
    null,
    "update promo_themes set name='Outra empresa' where id=$1",
    [officialTheme],
  );
  await as(a, "company-a", null, async () => {
    await db.query(
      "update promo_themes set name='Modelo autorizado' where id=$1",
      [officialTheme],
    );
    eq(
      (await one("select name from promo_themes where id=$1", [officialTheme]))
        .name,
      "Modelo autorizado",
    );
  });
  await db.query("update owners set status='suspended' where id=$1", [oa]);
  await as(a, "company-a", null, async () => eq(await count("companies"), 0));
  await as(staff, "company-a", ba, async () => eq(await count("products"), 0));
  await db.query("update owners set status='active' where id=$1", [oa]);
  await as(a, "company-a", null, async () => {
    eq(await count("owners"), 1);
    eq(await count("subscriptions"), 1);
    eq(await count("subscription_limits"), 1);
    eq(await count("owner_user_links"), 1);
    eq(await count("products"), 2);
    eq((await one("select id,username from users where id=$1", [a])).id, a);
  });
  await denied(
    a,
    "company-a",
    null,
    "select nova7_private.record('products',$1)",
    [pa],
  );
  if (process.env.NOVA7_BROWSER_TEST === "1") {
    let socket;
    if (db.kind === "pglite") {
      const { PGLiteSocketServer } = require(
        mods + "/@electric-sql/pglite-socket",
      );
      socket = new PGLiteSocketServer({
        db,
        port: 55439,
        host: "127.0.0.1",
        maxConnections: 32,
      });
      await socket.start();
    } else await db.prepareRuntime();
    fs.mkdirSync("/tmp/nova7-test", { recursive: true });
    if (!fs.existsSync("/tmp/nova7-test/cert.pem"))
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          "/tmp/nova7-test/key.pem",
          "-out",
          "/tmp/nova7-test/cert.pem",
          "-subj",
          "/CN=localhost",
          "-days",
          "1",
        ],
        { stdio: "ignore" },
      );
    const token = "nova7-owner-local-browser-only",
      tokenHash = createHash("sha256").update(token).digest("hex");
    await db.query("update users set must_change_password=false where id=$1", [
      admin,
    ]);
    await db.query(
      "insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 day')",
      [admin, tokenHash],
    );
    const logfile = fs.openSync("/tmp/nova7-owners-server.log", "w");
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--port",
        "3141",
        "--hostname",
        "127.0.0.1",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production",
          NODE_OPTIONS:
            db.kind === "pglite"
              ? `--require=${process.cwd()}/e2e/lib/serialize-pglite.cjs`
              : "",
          NOVA7_BUILD_DIR: ".next-owners",
          DATABASE_URL: db.adminUrl,
          DATABASE_RUNTIME_URL: db.runtimeUrl,
        },
        stdio: ["ignore", logfile, logfile],
      },
    );
    const proxy = https.createServer(
      {
        key: fs.readFileSync("/tmp/nova7-test/key.pem"),
        cert: fs.readFileSync("/tmp/nova7-test/cert.pem"),
      },
      (req, res) => {
        const q = http.request(
          {
            hostname: "127.0.0.1",
            port: 3141,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, "x-forwarded-proto": "https" },
          },
          (r) => {
            res.writeHead(r.statusCode, r.headers);
            r.pipe(res);
          },
        );
        q.on("error", () => {
          res.writeHead(502);
          res.end("Starting");
        });
        req.pipe(q);
      },
    );
    await new Promise((r) => proxy.listen(3142, "127.0.0.1", r));
    let browser, browserRuntime;
    try {
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch("http://127.0.0.1:3141/login")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      browserRuntime = await browserTestRuntime(mods);
      browser = await require("playwright-core").chromium.launch(browserRuntime.options);
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1100 },
      });
      await context.addCookies([
        {
          name: "__Host-extra_session",
          value: token,
          url: "https://127.0.0.1:3142",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const [url, title] of [
        ["/admin/proprietarios", "Proprietários"],
        ["/empresas", "Minhas Empresas"],
        ["/empresas/" + ca, "company-a"],
      ]) {
        const response = await page.goto("https://127.0.0.1:3142" + url);
        assert.equal(response.status(), 200);
        await page.getByRole("heading", { name: title, exact: true }).waitFor();
        checks++;
      }
      if (process.env.ENCARTIVA_BRAND_TEST === "1") {
        const { checkEncartivaBrand } = await import("./lib/encartiva-brand-flow.mjs");
        checks += await checkEncartivaBrand(browser, page, "https://127.0.0.1:3142");
      }
      await page.goto("https://127.0.0.1:3142/admin/proprietarios");
      await page
        .getByLabel("Nome", { exact: true })
        .fill("Proprietário criado pela interface");
      await page.getByLabel("Login", { exact: true }).fill("owner_browser");
      await page
        .getByLabel("Senha provisória", { exact: true })
        .fill("Teste-Seguro-2026");
      await page
        .getByLabel("Plano contratado", { exact: true })
        .fill("Plano Interface");
      await page
        .getByRole("button", { name: "Cadastrar proprietário", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Proprietário cadastrado" })
        .waitFor();
      checks++;
      await page.reload();
      await page
        .getByRole("link", { name: "Proprietário criado pela interface" })
        .click();
      await page
        .getByRole("heading", { name: "Minhas Empresas", exact: true })
        .waitFor();
      await page
        .getByLabel("Nome da empresa", { exact: true })
        .fill("Empresa criada pela interface");
      await page.getByLabel("Segmento", { exact: true }).fill("Supermercado");
      await page
        .getByRole("button", { name: "Cadastrar empresa", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Empresa cadastrada" })
        .waitFor();
      checks++;
      await page.goto("https://127.0.0.1:3142/admin/proprietarios");
      await page
        .locator('select[name="company_id"]')
        .selectOption({ label: "Minas Farma — Titularidade pendente" });
      await page
        .locator('select[name="owner_id"]')
        .selectOption({ label: "Dono A" });
      await page
        .getByLabel("Motivo e evidência da autorização")
        .fill("Confirmação somente no banco descartável de teste");
      await page.locator('input[name="confirmed"]').check();
      await page
        .getByRole("button", { name: "Registrar titularidade", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Titularidade registrada" })
        .waitFor();
      checks++;
      await context.addCookies([
        {
          name: "extra_scope",
          value: "minas-farma|",
          url: "https://127.0.0.1:3142",
          secure: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto("https://127.0.0.1:3142/promocoes/temas");
      await page
        .getByText("Identidade oficial Corta Preço — Minas Farma", {
          exact: true,
        })
        .click();
      await page
        .getByLabel("Digite MINAS FARMA", { exact: true })
        .fill("MINAS FARMA");
      await page
        .getByRole("button", {
          name: "Cadastrar componentes oficiais",
          exact: true,
        })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "CP-MF-001 a CP-MF-006" })
        .waitFor();
      checks++;
      await page.reload();
      await page
        .getByRole("link", {
          name: "Minas Farma — Corta Preço 3D",
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", {
          name: "Tema: Minas Farma — Corta Preço 3D",
          exact: true,
        })
        .waitFor();
      await page
        .getByText("Etiqueta 3D e composição da oferta", { exact: true })
        .waitFor();
      checks++;
      if (process.env.NOVA7_PROMOTION_TEST === "1") {
        const { officialPromotionFlow } = await import(
          "./official-promotion-flow.mjs"
        );
        await officialPromotionFlow({
          db,
          page,
          context,
          require,
          base: "https://127.0.0.1:3142",
          staffId: staff,
          ownerId: a,
          check: () => checks++,
        });
      }
      assert.deepEqual(errors, []);

      await page.screenshot({
        path: "/tmp/nova7-owners-ui.png",
        fullPage: true,
      });
    } finally {
      await browser?.close();
      browserRuntime?.close();
      server.kill("SIGTERM");
      await new Promise((r) => proxy.close(r));
      await socket?.stop();
      fs.closeSync(logfile);
    }
  }
  let roleEscape = false;
  await db.exec(
    "begin;set local session authorization nova7_runtime;set local role nova7_app",
  );
  try {
    await db.exec("reset role;set role postgres");
  } catch {
    roleEscape = true;
  } finally {
    await db.exec("rollback");
  }
  assert.ok(roleEscape, "Restricted runtime cannot become postgres");
  checks++;
  console.log(
    "PASS",
    checks,
    process.env.NOVA7_BROWSER_TEST === "1"
      ? "combined database and browser assertions"
      : "tenant assertions",
  );
} finally {
  await db.close();
}
