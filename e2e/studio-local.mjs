// Optional local-only harness. Never connects to a remote DATABASE_URL.
// npm install --prefix /tmp/nova7-test @sparticuz/chromium @electric-sql/pglite@0.5.10 @electric-sql/pglite-socket@0.2.13 --ignore-scripts
// NOVA7_TEST_MODULES=/tmp/nova7-test/node_modules node e2e/studio-local.mjs
// Requires a production build: NOVA7_BUILD_DIR=.next-studio-build npm run build
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { brotliDecompressSync } from "node:zlib";
import http from "node:http";
import https from "node:https";
import assert from "node:assert/strict";
import { provision, withSchema } from "./lib/schema.mjs";
const require = createRequire(import.meta.url),
  root = process.cwd(),
  mods = process.env.NOVA7_TEST_MODULES;
if (!mods)
  throw new Error(
    "Set NOVA7_TEST_MODULES to optional test dependencies; no remote DB is used.",
  );
const { PGlite } = require(mods + "/@electric-sql/pglite"),
  { PGLiteSocketServer } = require(mods + "/@electric-sql/pglite-socket"),
  chromium = (await import(mods + "/@sparticuz/chromium/build/index.js"))
    .default,
  { chromium: playwright } = require("playwright-core"),
  pg = require("pg"),
  sharp = require("sharp");
// All runtime files and certificates are disposable and stay outside the repository.
const chromiumDir = "/tmp/nova7-chromium",
  chromiumBin = mods + "/@sparticuz/chromium/bin";
fs.mkdirSync(chromiumDir, { recursive: true });
if (!fs.existsSync(chromiumDir + "/chromium"))
  for (const f of fs.readdirSync(chromiumBin)) {
    const out = chromiumDir + "/" + f.replace(".br", "");
    fs.writeFileSync(
      out,
      brotliDecompressSync(fs.readFileSync(chromiumBin + "/" + f)),
    );
    if (f === "chromium.br") fs.chmodSync(out, 0o755);
    else
      execFileSync("tar", ["--no-same-owner", "-xf", out, "-C", chromiumDir]);
  }
const tlsDir = "/tmp/nova7-test";
fs.mkdirSync(tlsDir, { recursive: true });
if (!fs.existsSync(tlsDir + "/key.pem"))
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      tlsDir + "/key.pem",
      "-out",
      tlsDir + "/cert.pem",
      "-subj",
      "/CN=localhost",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
const db = await PGlite.create(),
  socket = new PGLiteSocketServer({
    db,
    port: 55437,
    host: "127.0.0.1",
    maxConnections: 32,
  }),
  url = "postgres://postgres:postgres@127.0.0.1:55437/postgres",
  schema = "studio_local";
await socket.start();
await provision(url, schema);
const pool = new pg.Pool({ connectionString: withSchema(url, schema) }),
  log = fs.openSync("/tmp/nova7-studio-server.log", "w"),
  port = 3137,
  proxyPort = 3138,
  base = `https://127.0.0.1:${proxyPort}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NOVA7_BUILD_DIR: process.env.NOVA7_E2E_BUILD_DIR || ".next-studio-build",
      DATABASE_URL: withSchema(url, schema),
      REPLICATE_API_TOKEN: "",
      WINDSOR_API_KEY: "",
    },
    stdio: ["ignore", log, log],
  },
);
const proxy = https.createServer(
  {
    key: fs.readFileSync("/tmp/nova7-test/key.pem"),
    cert: fs.readFileSync("/tmp/nova7-test/cert.pem"),
  },
  (req, res) => {
    const up = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-proto": "https",
          "x-forwarded-host": req.headers.host,
        },
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    up.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  },
);
await new Promise((r) => proxy.listen(proxyPort, "127.0.0.1", r));
let browser,
  owner,
  reader,
  checks = 0;
const errors = [];
const pass = (s) => {
  checks++;
  console.log(`PASS ${checks}: ${s}`);
};
const poll = async (fn, desc) => {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timeout: " + desc);
};
const doc = async (id, format = "story") =>
  (
    await pool.query(
      "select scene,revision from studio_pages where campaign_id=$1 and format=$2 and page=0",
      [id, format],
    )
  ).rows[0];
const text = (d, t) => d?.scene.objects.some((o) => o.text === t);
const ready = async (page, id, route = "criacao") => {
  await page.goto(`${base}/${route}/${id}`);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
};
const session = async (username) => {
  const u = (
      await pool.query("select id from users where username=$1", [username])
    ).rows[0],
    token = randomBytes(32).toString("base64url");
  await pool.query(
    "insert into sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')",
    [u.id, createHash("sha256").update(token).digest("hex")],
  );
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  await ctx.addCookies([
    {
      name: "__Host-extra_session",
      value: token,
      url: base,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  ctx.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return ctx;
};
try {
  await poll(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/login`)).ok;
    } catch {
      return false;
    }
  }, "server");
  browser = await playwright.launch({
    executablePath: "/tmp/nova7-chromium/chromium",
    args: chromium.args.filter((a) => a !== "--disable-web-security"),
    headless: true,
  });
  owner = await session("teste_e2e");
  reader = await session("e2e_vw");
  const page = await owner.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${base}/criacao`);
  await page
    .getByRole("heading", { name: "O que vamos criar hoje?" })
    .waitFor();
  assert.equal(await page.locator('.side-nav a[href="/criacao"]').count(), 1);
  assert.ok((await page.locator(".side-nav a").count()) <= 13);
  assert.ok(
    await page
      .locator(".design-hero")
      .evaluate((e) => e.getBoundingClientRect().right > innerWidth - 60),
  );
  await page.screenshot({ path: "/tmp/nova7-design-hub-desktop.png" });
  pass("Design tem aba própria e ocupa toda a largura disponível");
  await page.getByRole("button", { name: "Impressos", exact: true }).click();
  assert.equal(await page.locator(".design-format-card").count(), 3);
  await page.getByLabel("Buscar formato de design").fill("Etiqueta");
  assert.equal(await page.locator(".design-format-card").count(), 1);
  await page.getByLabel("Buscar formato de design").fill("");
  await page
    .getByRole("button", { name: "Todos os formatos", exact: true })
    .click();
  assert.equal(await page.locator(".design-format-card").count(), 9);
  pass("Categorias e busca filtram os formatos reais");
  let presetMutation;
  const capturePreset = (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      presetMutation = { headers: r.headers(), data: r.postData() };
  };
  page.on("request", capturePreset);
  await page
    .getByRole("button", { name: "Criar TV / Telão", exact: true })
    .click();
  await page
    .getByLabel("Como vamos chamar esta criação?")
    .fill("TV horizontal E2E");
  await page.getByRole("button", { name: "Criar e abrir no editor" }).click();
  await page.locator("[data-editor-ready=true]").waitFor();
  page.off("request", capturePreset);
  const tv = page.url().match(/studio\/([a-f0-9-]{36})/)[1];
  await poll(async () => Boolean(await doc(tv)), "TV preset");
  let clip = (await doc(tv)).scene.objects.find((o) => o.name === "clip");
  assert.equal(clip.width, 1920);
  assert.equal(clip.height, 1080);
  pass("TV cria documento horizontal persistente de 1920×1080");
  await page.getByRole("button", { name: "+ Página", exact: true }).click();
  await poll(
    async () =>
      (
        await pool.query(
          "select scene from studio_pages where campaign_id=$1 and page=1",
          [tv],
        )
      ).rowCount === 1,
    "second TV page",
  );
  clip = (
    await pool.query(
      "select scene from studio_pages where campaign_id=$1 and page=1",
      [tv],
    )
  ).rows[0].scene.objects.find((o) => o.name === "clip");
  assert.equal(clip.width, 1920);
  assert.equal(clip.height, 1080);
  pass("Novas páginas mantêm o tamanho personalizado");
  await page.goto(`${base}/criacao`);
  await page
    .getByRole("button", { name: "Criar Carrossel", exact: true })
    .click();
  await page.getByRole("button", { name: "Criar e abrir no editor" }).click();
  await page.locator("[data-editor-ready=true]").waitFor();
  const carousel = page.url().match(/studio\/([a-f0-9-]{36})/)[1];
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from studio_pages where campaign_id=$1",
        [carousel],
      )
    ).rows[0].n,
    5,
  );
  pass("Carrossel cria cinco páginas na mesma transação");
  await page.goto(`${base}/criacao`);
  await page
    .getByRole("button", { name: "Criar Cartaz A4", exact: true })
    .click();
  await page.getByRole("button", { name: "Criar e abrir no editor" }).click();
  await page.locator("[data-editor-ready=true]").waitFor();
  await page.locator(".studio-download").evaluate((e) => (e.open = true));
  const pdfWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "PDF para impressão", exact: true })
    .click();
  const pdfDownload = await pdfWait,
    pdf = await require("pdf-lib").PDFDocument.load(
      fs.readFileSync(await pdfDownload.path()),
    ),
    paper = pdf.getPages()[0].getSize();
  assert.ok(Math.abs(paper.width - 595.2) < 1);
  assert.ok(Math.abs(paper.height - 841.92) < 1);
  pass("Cartaz exporta PDF no tamanho físico A4");
  await page.goto(`${base}/criacao/ia`);
  assert.equal(
    await page.getByText("Aguardando configuração", { exact: true }).count(),
    2,
  );
  assert.equal(
    await page.getByRole("button", { name: "Testar conexão" }).isDisabled(),
    true,
  );
  pass("Sem chave e modelos, a IA informa pendência e não dispara chamadas");
  const presetViewer = await reader.newPage();
  await presetViewer.goto(`${base}/criacao`);
  assert.equal(
    await presetViewer.locator(".design-format-card:disabled").count(),
    9,
  );
  assert.ok(presetMutation);
  const presetHeaders = { ...presetMutation.headers, origin: base };
  delete presetHeaders.cookie;
  delete presetHeaders["content-length"];
  delete presetHeaders.host;
  const forbiddenPreset = await presetViewer.request.post(`${base}/criacao`, {
    headers: presetHeaders,
    data: presetMutation.data,
  });
  assert.ok((await forbiddenPreset.text()).includes("somente leitura"));
  pass("Leitor também é bloqueado na ação de criar design por formato");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/criacao`);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "/tmp/nova7-design-hub-mobile.png",
    fullPage: true,
  });
  pass("Galeria de Design funciona em tela mobile sem cortes horizontais");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${base}/`);
  assert.ok(
    await page
      .locator(".content")
      .evaluate((e) => e.getBoundingClientRect().right >= innerWidth - 2),
  );
  await page.screenshot({ path: "/tmp/nova7-dashboard-fullwidth.png" });
  pass("Dashboard também usa a largura completa da página");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const design = (
    await pool.query(
      "insert into promo_campaigns(name,kind,design_format) values('Nova7 teste','design','story') returning id",
    )
  ).rows[0].id;
  await ready(page, design);
  await poll(async () => Boolean(await doc(design)), "initial save");
  pass("Design abre no Studio e salva no banco");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar título", exact: true })
    .click();
  await poll(async () => text(await doc(design), "Título"), "title");
  pass("Texto editável salva como objeto");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(async () => !text(await doc(design), "Título"), "undo");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await poll(async () => text(await doc(design), "Título"), "redo");
  pass("Desfazer e refazer persistem");
  await page.reload();
  await page.locator("[data-editor-ready=true]").waitFor();
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page.getByRole("button", { name: "Título", exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/nova7-studio-design.png" });
  pass("Camadas persistem após recarregar");
  const download = async (name) => {
    await page.locator(".studio-download").evaluate((e) => {
      e.open = true;
    });
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const d = await wait;
    return fs.readFileSync(await d.path());
  };
  assert.equal((await download("PNG")).subarray(1, 4).toString(), "PNG");
  pass("Exportação PNG válida");
  assert.equal((await download("JPG")).subarray(0, 2).toString("hex"), "ffd8");
  pass("Exportação JPG válida");
  const svg = (await download("SVG vetorial")).toString();
  assert.ok(svg.includes("<svg") && svg.includes("Título"));
  pass("Exportação SVG com texto vetorial");
  await page.getByRole("button", { name: "Imagens", exact: true }).click();
  await page.getByLabel("Enviar imagem", { exact: true }).setInputFiles({
    name: "teste.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 120, height: 160, channels: 4, background: "#8055dd" },
    })
      .png()
      .toBuffer(),
  });
  await poll(
    async () =>
      (await doc(design)).scene.objects.some(
        (o) => o.type === "image" && o.src.startsWith("/api/promocoes/asset/"),
      ),
    "upload",
  );
  pass("Upload gera asset local persistente");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("button", { name: "contrast", exact: true }).click();
  await poll(
    async () =>
      (await doc(design)).scene.objects.some((o) =>
        o.filters?.some((f) => f.type === "Contrast"),
      ),
    "filter",
  );
  pass("Filtro persiste na imagem");
  await page.getByRole("button", { name: "Desenhar", exact: true }).click();
  const box = await page.locator(".studio-stage").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 50,
    { steps: 10 },
  );
  await page.mouse.up();
  await poll(
    async () =>
      (await doc(design)).scene.objects.some((o) => o.type === "path"),
    "drawing",
  );
  pass("Desenho livre persiste");
  assert.ok(
    (await download("SVG vetorial"))
      .toString()
      .includes("data:image/png;base64,"),
  );
  pass("SVG incorpora imagens sem depender de sessão");
  const other = await owner.newPage();
  await ready(other, design);
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByRole("button", { name: "Parágrafo", exact: true }).click();
  await poll(async () => text(await doc(design), "Parágrafo"), "new revision");
  await other.getByRole("button", { name: "Texto", exact: true }).click();
  await other
    .getByRole("button", { name: "Adicionar subtítulo", exact: true })
    .click();
  await other.getByRole("alert").filter({ hasText: "outra aba" }).waitFor();
  assert.ok(!text(await doc(design), "Subtítulo"));
  pass("Conflito entre abas não sobrescreve arte");
  const theme = (
      await pool.query(
        "insert into promo_themes(name) values('Tema teste') returning id",
      )
    ).rows[0].id,
    promo = (
      await pool.query(
        "insert into promo_campaigns(name,theme_id,title) values('Oferta teste',$1,'OFERTAS') returning id",
        [theme],
      )
    ).rows[0].id;
  await pool.query(
    "insert into promo_items(campaign_id,position,name,price) values($1,0,'PRODUTO TESTE',9.99)",
    [promo],
  );
  await ready(page, promo, "promocoes");
  await poll(async () => {
    const d = await doc(promo);
    return (
      d?.scene.objects.some(
        (o) => o.type === "i-text" && o.text?.includes("PRODUTO"),
      ) && d.scene.objects.length > 5
    );
  }, "editable promotion");
  await page.screenshot({ path: "/tmp/nova7-studio-promo.png" });
  pass("Promoção automática importa elementos separados");
  await page.getByLabel("Formato da arte").selectOption("feed");
  await page.locator("[data-editor-ready=true]").waitFor();
  await poll(async () => Boolean(await doc(promo, "feed")), "feed");
  assert.ok(await doc(promo, "story"));
  pass("Formatos possuem documentos independentes");
  await pool.query("update promo_items set price=11.99 where campaign_id=$1", [
    promo,
  ]);
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "produtos ou o tema mudaram" })
    .waitFor();
  pass("Mudança de preço na origem avisa sobre arte antiga");
  const viewer = await reader.newPage();
  await ready(viewer, design);
  assert.equal(
    await viewer
      .getByRole("button", { name: "Salvar arte", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await viewer.getByRole("button", { name: "Texto", exact: true }).count(),
    0,
  );
  await viewer.getByText("Exportar", { exact: true }).waitFor();
  pass("Leitor visualiza e exporta sem ferramentas de escrita");
  const denied = await viewer.request.post(`${base}/api/studio/${design}/ai`, {
    data: { kind: "generate", prompt: "test image" },
    headers: { origin: base },
  });
  assert.equal(denied.status(), 403);
  pass("API rejeita escrita por leitor");
  // Replay an actual owner server action with the viewer session to verify the server guard.
  await ready(page, design);
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  let mutation;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      mutation = { headers: r.headers(), data: r.postData() };
  });
  await page
    .getByRole("button", { name: "Adicionar subtítulo", exact: true })
    .click();
  await poll(
    async () => text(await doc(design), "Subtítulo"),
    "owner mutation",
  );
  assert.ok(mutation);
  const headers = { ...mutation.headers, origin: base };
  delete headers.cookie;
  delete headers["content-length"];
  delete headers.host;
  const replay = await viewer.request.post(`${base}/studio/${design}`, {
    headers,
    data: mutation.data,
  });
  assert.ok((await replay.text()).includes("somente leitura"));
  pass("Server action também bloqueia escrita por leitor");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  pass("Layout mobile sem overflow horizontal");
  assert.deepEqual(errors, []);
  pass("Nenhuma exceção de página durante o fluxo");
  console.log(`${checks} checks passed`);
} finally {
  await reader?.close().catch(() => {});
  await owner?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server.kill();
  proxy.close();
  await pool.end();
  await socket.stop();
  await db.close();
}
