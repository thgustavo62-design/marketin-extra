// Local disposable PostgreSQL/Chromium flow. Provider and product photos are fixtures.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export async function runPromotionReview({
  page,
  owner,
  reader,
  pool,
  base,
  pass,
  poll,
  doc,
  require,
  sharp,
  gtin,
  fs,
}) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const Excel = require("exceljs"),
    brands = (await pool.query("select id,name from brands order by name"))
      .rows;
  assert.ok(brands.length >= 2);
  const names = ["BRISA ELEGANTE", "FRESCOR INTENSO", "PURO CUIDADO"],
    eans = names.map((_, i) => gtin(101 + i)),
    photos = [];
  for (let i = 0; i < 3; i++) {
    const name = `AMACIANTE COMFORT CONCENTRADO 1L ${names[i]}`,
      p = (
        await pool.query(
          "insert into products(ean,description,name_key,search) values($1,$2,$2,$2) returning id",
          [eans[i], name],
        )
      ).rows[0].id;
    const bytes = await sharp({
      create: {
        width: 150,
        height: 240,
        channels: 4,
        background: ["#cc2222", "#2222cc", "#22cc22"][i],
      },
    })
      .png()
      .toBuffer();
    const photo = (
      await pool.query(
        "insert into product_images(product_id,is_primary,data,thumb,width,height,size_bytes,sha256,source) values($1,true,$2,$2,150,240,$3,$4,'upload') returning id",
        [
          p,
          bytes,
          bytes.length,
          createHash("sha256").update(bytes).digest("hex"),
        ],
      )
    ).rows[0].id;
    photos.push(photo);
  }
  const wb = new Excel.Workbook(),
    ws = wb.addWorksheet("LIMPEZA");
  ws.addRow([
    "REFERENCIAS",
    "Barras",
    "Preço de Promoção",
    "Descrição",
    "VALRO APROXIMADO",
  ]);
  for (let i = 0; i < 3; i++)
    ws.addRow([
      "",
      eans[i],
      27.5,
      `AMACIANTE COMFORT CONCENTRADO 1L ${names[i]}`,
      22.99,
    ]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const upload = async (buffer = bytes, name = "Revisão inteligente teste") => {
    const r = await owner.request.post(`${base}/api/promocoes/revisao`, {
      headers: { origin: base },
      multipart: {
        brand_id: brands[0].id,
        name,
        file: {
          name: "ofertas.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer,
        },
      },
    });
    assert.equal(r.status(), 200, await r.text());
    return (await r.json()).id;
  };
  const row = async (id) =>
    (await pool.query("select * from promo_imports where id=$1", [id])).rows[0];
  const first = await upload(),
    initial = await row(first);
  assert.equal(initial.original_rows.length, 3);
  assert.equal(initial.groups.length, 1);
  assert.equal(initial.groups[0].members.length, 3);
  assert.equal(initial.groups[0].photoIds.length, 2);
  assert.equal(initial.original_rows[0].prices.promotion, 27.5);
  assert.equal(initial.original_rows[0].price, 22.99);
  pass(
    "Importação de revisão preserva preços originais, três SKUs e duas fotos reais distintas",
  );
  await page.goto(`${base}/promocoes/revisao/${first}`);
  await page.getByRole("heading", { name: "Produtos originais" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Confirmar revisão e gerar no Studio" })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Aprovar oferta", exact: true })
    .click();
  await poll(
    async () => (await row(first)).groups[0].approved,
    "group approval",
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from promo_grouping_memory where brand_id=$1",
        [brands[0].id],
      )
    ).rows[0].n,
    1,
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/nova7-review-comparison.png" });
  pass(
    "Conferência lado a lado bloqueia geração antes da aprovação e guarda memória por empresa",
  );
  const memorized = await upload(bytes, "Memória aprovada");
  assert.equal((await row(memorized)).groups[0].status, "confirmed");
  await page.goto(`${base}/promocoes/revisao/${memorized}`);
  await page.getByRole("button", { name: "Desagrupar", exact: true }).click();
  await poll(async () => (await row(memorized)).groups.length === 3, "split");
  const rejected = await upload(bytes, "Memória rejeitada");
  assert.equal((await row(rejected)).groups.length, 3);
  pass(
    "Memória reaproveita mesmos SKUs e respeita desagrupamento rejeitado em nova importação",
  );
  await pool.query(
    "update users set brand_ids=$1::uuid[] where username in ('e2e_vw','e2e_ed')",
    [[brands[1].id]],
  );
  const restricted = await reader.newPage();
  await restricted.goto(`${base}/promocoes/revisao/${first}`);
  assert.equal(
    await restricted
      .getByRole("heading", { name: "Produtos originais" })
      .count(),
    0,
  );
  await restricted.goto(`${base}/promocoes`);
  assert.equal(
    await restricted
      .getByText("Revisão inteligente teste", { exact: true })
      .count(),
    0,
  );
  const denied = await reader.request.post(`${base}/api/promocoes/revisao`, {
    headers: { origin: base },
    multipart: {
      brand_id: brands[0].id,
      file: {
        name: "x.xlsx",
        mimeType: "application/octet-stream",
        buffer: bytes,
      },
    },
  });
  assert.equal(denied.status(), 403);
  pass(
    "Outra empresa não acessa a revisão nem enxerga a campanha privada; leitor não importa",
  );
  await page.goto(`${base}/promocoes/revisao/${first}`);
  await page
    .getByText("Gerar o feed quadrado em 1080 × 1080 (story e A4 mantidos)", {
      exact: true,
    })
    .check();
  await page.locator("select[name=layout]").selectOption("two");
  await page
    .getByText("Conferi produtos, variações, preços e fotos antes de gerar.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", {
      name: "Confirmar revisão e gerar no Studio",
      exact: true,
    })
    .click();
  await page.waitForURL(/\/studio\//);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  const campaign = (await row(first)).campaign_id;
  assert.ok(campaign);
  const item = (
    await pool.query("select * from promo_items where campaign_id=$1", [
      campaign,
    ])
  ).rows[0];
  assert.equal(item.photo_image_ids.length, 2);
  assert.equal(item.variants.members.length, 3);
  assert.equal(Number(item.price), 22.99);
  await page.goto(`${base}/studio/${campaign}?formato=feed`);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await poll(async () => !!(await doc(campaign, "feed")), "square save");
  const scene = (await doc(campaign, "feed")).scene,
    clip = scene.objects.find((o) => o.name === "clip");
  assert.equal(clip.width, 1080);
  assert.equal(clip.height, 1080);
  assert.ok(scene.objects.filter((o) => o.type === "image").length >= 2);
  assert.ok(scene.objects.some((o) => o.type === "i-text"));
  pass(
    "Campanha revisada mantém três SKUs e duas embalagens editáveis no Studio; feed quadrado correto",
  );
  await restricted.goto(`${base}/studio/${campaign}`);
  assert.equal(await restricted.locator("[data-editor-ready=true]").count(), 0);
  const imageGate = await reader.request.get(
    `${base}/api/promocoes/miniatura/${campaign}`,
  );
  assert.equal(imageGate.status(), 404);
  pass("Studio e miniatura também impedem acesso entre empresas");
  await page.goto(`${base}/promocoes/regras?empresa=${brands[0].id}`);
  await page.getByLabel("Planilha para testar regras").setInputFiles({
    name: "test.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  const before = (
    await pool.query("select count(*)::int as n from promo_imports")
  ).rows[0].n;
  await page
    .getByRole("button", { name: "Testar regras nesta planilha", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Nenhum rascunho ou regra foi salvo." })
    .waitFor();
  assert.equal(
    (await pool.query("select count(*)::int as n from promo_imports")).rows[0]
      .n,
    before,
  );
  await page
    .getByRole("button", { name: "Salvar regras da empresa", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "Regras salvas" }).waitFor();
  assert.equal(
    (
      await pool.query(
        "select config from promo_grouping_rules where brand_id=$1",
        [brands[0].id],
      )
    ).rows[0].config.maxPhotos,
    2,
  );
  pass(
    "Regras são testadas sem gravar e persistidas por empresa somente ao salvar",
  );
  await page.goto(`${base}/promocoes/temas`);
  await page.getByLabel("Nome do novo tema").fill("Layout revisão teste");
  await page.getByRole("button", { name: "Criar tema", exact: true }).click();
  await page.waitForURL(/\/promocoes\/temas\//);
  const themeId = page.url().split("/").pop();
  await page.getByLabel("Nome do tema").fill("Layout revisão atualizado");
  await page.getByRole("button", { name: "Salvar tema", exact: true }).click();
  await poll(
    async () =>
      (
        await pool.query("select version from promo_themes where id=$1", [
          themeId,
        ])
      ).rows[0].version === 2,
    "layout version",
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from promo_theme_versions where theme_id=$1",
        [themeId],
      )
    ).rows[0].n,
    1,
  );
  await page.goto(`${base}/promocoes/temas`);
  let card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Layout revisão atualizado",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Desativar", exact: true }).click();
  await poll(
    async () =>
      (
        await pool.query("select active from promo_themes where id=$1", [
          themeId,
        ])
      ).rows[0].active === false,
    "deactivate",
  );
  await page.reload();
  card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Layout revisão atualizado",
      exact: true,
    }),
  });
  await card
    .getByRole("button", { name: "Duplicar layout", exact: true })
    .click();
  await page.waitForURL(/\/promocoes\/temas\//);
  assert.notEqual(page.url().split("/").pop(), themeId);
  pass(
    "Layouts preservam versões de configuração, desativação e duplicação editável",
  );
  if (process.env.NOVA7_REFERENCE_WORKBOOK) {
    const real = await upload(
        fs.readFileSync(process.env.NOVA7_REFERENCE_WORKBOOK),
        "Planilha real · validação local",
      ),
      r = await row(real);
    assert.equal(r.original_rows.length, 160);
    assert.equal(r.diagnostics.sheets.length, 8);
    assert.ok(
      r.original_rows.some(
        (l) => l.reference === "FRAGANCIAS" && l.name.includes("DOVE"),
      ),
    );
    await page.goto(`${base}/promocoes/revisao/${real}`);
    await page
      .getByRole("button", { name: "Selecionar ofertas visíveis", exact: true })
      .click();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Aprovar selecionadas", exact: true })
      .click();
    await poll(
      async () => (await row(real)).groups.every((g) => g.approved),
      "real reviewed",
    );
    await page
      .getByText(
        "Conferi produtos, variações, preços e fotos antes de gerar.",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", {
        name: "Confirmar revisão e gerar no Studio",
        exact: true,
      })
      .click();
    await page.waitForURL(/\/studio\//);
    await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
    const generated = (await row(real)).campaign_id,
      n = (
        await pool.query(
          "select count(*)::int as n from promo_items where campaign_id=$1",
          [generated],
        )
      ).rows[0].n;
    assert.equal(n, (await row(real)).groups.length);
    pass(
      "Planilha real: oito abas e 160 SKUs percorrem importação, revisão explícita e geração local no Studio",
    );
  }
  await pool.query(
    "update users set brand_ids=null where username in ('e2e_vw','e2e_ed')",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/promocoes/revisao/${rejected}`);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  pass("Revisão inteligente se reorganiza no celular sem corte horizontal");
}
