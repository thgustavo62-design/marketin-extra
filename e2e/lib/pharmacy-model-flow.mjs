import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

export async function pharmacyModelFlow({
  db,
  page,
  context,
  base,
  companyId,
  otherId,
  staffId,
  bytes,
  prices,
  check,
}) {
  const keys = [
    "farma-essencial",
    "bebe-carinho",
    "beleza-natural",
    "cuidado-diario",
    "energia-equilibrio",
    "ofertas-impacto",
    "mercado-economia",
    "hortifruti-fresco",
    "atacado-inteligente",
    "black-friday",
  ];
  const labels = [
    "rounded",
    "solid",
    "outline",
    "ticket",
    "flag",
    "slanted",
    "gloss",
    "burst",
    "shelf",
    "premium",
  ];
  const post = (path, data) =>
    context.request.post(base + path, { headers: { origin: base }, data });
  await page.goto(base + "/promocoes/etiquetas");
  await page
    .getByRole("heading", { name: "Etiquetas de preço", exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-price-label]").count(), 10);
  check();
  await page.getByLabel("Preço para prévia das etiquetas").fill("1.299,99");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-price-label] canvas")].every(
      (c) => c.getContext("2d").getImageData(250, 60, 1, 1).data[3] > 0,
    ),
  );
  check();
  await page.screenshot({
    path: "/tmp/encartiva-ten-labels.png",
    fullPage: true,
  });
  await page.goto(base + "/promocoes/modelos");
  await page
    .getByRole("heading", { name: "Modelos de campanhas", exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-model]").count(), 10);
  check();
  await page
    .getByLabel("Filtrar segmento dos modelos")
    .selectOption("Supermercados");
  assert.equal(await page.locator("[data-model]").count(), 5);
  check();
  await page.getByLabel("Filtrar segmento dos modelos").selectOption("Todos");
  await page.getByLabel("Buscar modelos de campanhas").fill("bebê");
  assert.equal(await page.locator("[data-model]").count(), 1);
  check();
  await page.getByLabel("Buscar modelos de campanhas").fill("");
  await page.getByLabel("Formato da prévia dos modelos").selectOption("story");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-model-preview]")].some(
      (c) => c.width === 1080 && c.height === 1920,
    ),
  );
  check();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  check();
  await page.screenshot({
    path: "/tmp/encartiva-pharmacy-models-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("Formato da prévia dos modelos").selectOption("feed");
  // Exercise lazy previews by visiting each card before the full-page capture.
  for (const key of keys) {
    await page.locator(`[data-model="${key}"]`).scrollIntoViewIfNeeded();
    await page.waitForFunction((key) => {
      const c = document.querySelector(`[data-model-preview="${key}"]`);
      return c?.width === 1080 && c?.height === 1350 &&
        c.getContext("2d").getImageData(30, 30, 1, 1).data[3] > 0;
    }, key);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/encartiva-pharmacy-models-desktop.png",
    fullPage: true,
  });
  await page.locator('[data-model="bebe-carinho"]').getByRole("link").click();
  await page
    .getByLabel("Nome da campanha", { exact: true })
    .fill("Biblioteca bebê revisada");
  await page.getByLabel("Planilha para revisão inteligente").setInputFiles({
    name: "ofertas.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "Importar e revisar ofertas", exact: true })
    .click();
  await page.waitForURL(/\/promocoes\/revisao\/.+modelo=bebe-carinho/);
  assert.equal(
    await page.locator('select[name="model_key"]').inputValue(),
    "bebe-carinho",
  );
  check();
  await page.getByLabel("Cor principal do modelo").fill("#123456");
  await page
    .getByLabel("Etiqueta de preço", { exact: true })
    .selectOption("ticket");
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
  const reviewedId = page.url().split("/studio/")[1].split("?")[0];
  const reviewed = (
    await db.query(
      "select brand_id,overrides from promo_campaigns where id=$1",
      [reviewedId],
    )
  ).rows[0];
  assert.equal(reviewed.brand_id, companyId);
  assert.equal(reviewed.overrides.model.key, "bebe-carinho");
  assert.equal(reviewed.overrides.model.theme.colors.skyTop, "#123456");
  assert.equal(reviewed.overrides.model.theme.priceLabel, "ticket");
  check();
  // Matching stays in the import's company even when the owner can read several companies.
  const sibling = (
    await db.query(
      "select id from companies where owner_id=(select owner_id from companies where id=$1) and id<>$1 limit 1",
      [companyId],
    )
  ).rows[0];
  if (sibling) {
    await db.query(
      "insert into products(company_id,ean,description,name_key,search) select $2,ean,'NUNCA OUTRA EMPRESA','NUNCA OUTRA EMPRESA','NUNCA OUTRA EMPRESA' from products where company_id=$1 and ean is not null on conflict do nothing",
      [companyId, sibling.id],
    );
    const cookies = await context.cookies(base);
    const session = cookies.find((c) => c.name === "__Host-extra_session");
    const imported = await context.request.post(
      base + "/api/promocoes/revisao",
      {
        headers: {
          origin: base,
          cookie: `__Host-extra_session=${session.value}; extra_scope=%7C`,
        },
        multipart: {
          brand_id: companyId,
          name: "Mesmo EAN em empresas diferentes",
          file: {
            name: "ofertas.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: bytes,
          },
        },
      },
    );
    assert.equal(imported.status(), 200, await imported.text());
    const source = (
      await db.query("select groups from promo_imports where id=$1", [
        (await imported.json()).id,
      ])
    ).rows[0];
    const ids = source.groups
      .flatMap((g) => [...g.members, ...g.candidates])
      .map((m) => m.productId)
      .filter(Boolean);
    const companies = (
      await db.query(
        "select distinct company_id from products where id=any($1::uuid[])",
        [ids],
      )
    ).rows;
    assert.deepEqual(
      companies.map((c) => c.company_id),
      [companyId],
    );
    check();
  }
  const created = [];
  for (const [index, key] of keys.entries()) {
    const response = await context.request.post(
      base + "/api/promocoes/importar",
      {
        headers: { origin: base },
        multipart: {
          brand_id: companyId,
          model_key: key,
          price_label: labels[index],
          model_primary: "#075985",
          model_accent: "#D4F45A",
          name: "Modelo global QA " + key,
          group: "0",
          layout: "theme",
          validity: "Teste local",
          file: {
            name: "ofertas.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: bytes,
          },
        },
      },
    );
    assert.equal(response.status(), 200, await response.text());
    const campaign = (await response.json()).id;
    const saved = (
      await db.query(
        "select theme_id,brand_id,overrides from promo_campaigns where id=$1",
        [campaign],
      )
    ).rows[0];
    assert.equal(saved.brand_id, companyId);
    assert.equal(saved.theme_id, null);
    assert.equal(saved.overrides.model.key, key);
    assert.equal(saved.overrides.model.version, 1);
    assert.equal(saved.overrides.model.theme.priceLabel, labels[index]);
    assert.equal(saved.overrides.model.theme.colors.skyTop, "#075985");
    assert.equal(saved.overrides.model.theme.offerIdentity, undefined);
    const rows = (
      await db.query(
        "select price::float8 as price from promo_items where campaign_id=$1 order by position",
        [campaign],
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.price),
      prices,
    );
    check();
    created.push(campaign);
    await page.goto(base + `/studio/${campaign}?formato=feed`);
    await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
    await page
      .getByRole("button", { name: "Salvar arte", exact: true })
      .click();
    await page.getByText("Salvo", { exact: true }).waitFor({ timeout: 30000 });
    const scene = (
      await db.query(
        "select scene from studio_pages where campaign_id=$1 and format='feed' and page=0",
        [campaign],
      )
    ).rows[0]?.scene;
    assert.ok(
      scene?.objects.some(
        (o) =>
          o.type === "i-text" &&
          /OFERTAS|PEQUENOS|SUA ROTINA|CUIDADO|ECONOMIA|FRESCOR|MAIS|BLACK/.test(
            o.text || "",
          ),
      ),
    );
    assert.ok(scene.objects.some((o) => o.type === "image"));
    check();
  }
  const campaign = created[0];
  for (const format of ["story", "a4"]) {
    await page.goto(base + `/studio/${campaign}?formato=${format}`);
    await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
    await page
      .getByRole("button", { name: "Salvar arte", exact: true })
      .click();
    await page.getByText("Salvo", { exact: true }).waitFor({ timeout: 30000 });
    check();
  }
  await page.goto(base + `/promocoes/${campaign}/ofertas`);
  await page
    .getByRole("heading", { name: "Editar ofertas", exact: true })
    .waitFor();
  await page
    .getByLabel("Descrição do produto", { exact: true })
    .fill("SABONETE EDITADO 200 ML");
  await page.getByLabel("Preço da oferta (R$)", { exact: true }).fill("29,99");
  await page
    .getByLabel("Informações complementares")
    .fill("APRESENTAÇÃO CONFERIDA");
  await page.getByLabel('Etiqueta desta oferta').selectOption('premium');
  await page
    .getByRole("button", { name: "Salvar oferta", exact: true })
    .click();
  await page
    .getByText("Oferta salva.", { exact: true })
    .waitFor({ timeout: 30000 });
  const item = (
    await db.query(
      "select * from promo_items where campaign_id=$1 order by position limit 1",
      [campaign],
    )
  ).rows[0];
  assert.equal(item.name, "SABONETE EDITADO 200 ML");
  assert.equal(Number(item.price), 29.99);
  assert.equal(item.note, "APRESENTAÇÃO CONFERIDA");
  assert.equal(item.style.priceLabel, "premium");
  check();
  await page.reload();
  assert.equal(
    await page.getByLabel("Preço da oferta (R$)").inputValue(),
    "29,99",
  );
  check();
  const version = JSON.stringify([
    item.name,
    Number(item.price),
    item.note || null,
    item.photo_image_id || null,
    item.photo_image_ids ?? [],
    item.style?.priceLabel ?? null,
  ]);
  const path = `/api/promocoes/${campaign}/ofertas/${item.id}`;
  const data = {
    name: item.name,
    note: "NOVA DESCRIÇÃO",
    price: "29,99",
    version,
  };
  const accepted = await post(path, data);
  assert.equal(accepted.status(), 200, await accepted.text());
  check();
  const retry = await post(path, data);
  assert.equal(retry.status(), 200);
  check();
  const stale = await post(path, { ...data, name: "UMA EDIÇÃO ANTIGA" });
  assert.equal(stale.status(), 409);
  check();
  const invalid = await post(path, { ...data, price: "NaN" });
  assert.equal(invalid.status(), 422);
  check();
  const csrf = await context.request.post(base + path, {
    headers: { origin: "https://example.invalid" },
    data,
  });
  assert.equal(csrf.status(), 403);
  check();
  const strangerToken = randomBytes(32).toString("base64url");
  await db.query(
    "insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 hour')",
    [staffId, createHash("sha256").update(strangerToken).digest("hex")],
  );
  const unauthorized = await context.request.post(base + path, {
    headers: {
      origin: base,
      cookie: `__Host-extra_session=${strangerToken}; extra_scope=company-a%7C`,
    },
    data,
  });
  assert.equal(unauthorized.status(), 404);
  check();
  const badModel = await context.request.post(
    base + "/api/promocoes/importar",
    {
      headers: { origin: base },
      multipart: {
        brand_id: companyId,
        model_key: "not-a-model",
        file: {
          name: "ofertas.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: bytes,
        },
      },
    },
  );
  assert.equal(badModel.status(), 422);
  check();
  const badCompany = await context.request.post(
    base + "/api/promocoes/importar",
    {
      headers: { origin: base },
      multipart: {
        brand_id: otherId,
        model_key: keys[0],
        file: {
          name: "ofertas.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: bytes,
        },
      },
    },
  );
  assert.equal(badCompany.status(), 409);
  check();
  const before = (
    await db.query(
      "select config from promo_themes where company_id=$1 and official_code=$2",
      [companyId, "CP-MF-006"],
    )
  ).rows[0];
  assert.equal(before.config.offerIdentity.kind, "glossy-price");
  check();
  await page.goto(base + `/studio/${campaign}?formato=feed`);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await page
    .getByText("Os produtos ou o tema mudaram desde esta edição.", {
      exact: false,
    })
    .waitFor({ timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Regenerar página", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Regenerar página", exact: true })
    .waitFor({ state: "hidden" });
  await page.locator("[data-editor-ready=true]").waitFor();
  await page.getByRole("button", { name: "Salvar arte", exact: true }).click();
  await page.getByText("Salvo", { exact: true }).waitFor({ timeout: 30000 });
  const refreshed = (
    await db.query(
      "select scene from studio_pages where campaign_id=$1 and format='feed' and page=0",
      [campaign],
    )
  ).rows[0].scene;
  const refreshedText = refreshed.objects
    .filter((o) => o.type === "i-text")
    .map((o) => o.text || "")
    .join(" ")
    .replace(/\s+/g, " ");
  assert.ok(refreshedText.includes("SABONETE EDITADO"), refreshedText);
  assert.ok(refreshedText.includes("NOVA DESCRIÇÃO"), refreshedText);
  assert.ok(!refreshedText.includes("SABONETE INFANTIL"));
  const photos = refreshed.objects.filter((o) => o.type === "image");
  assert.ok(photos.length > 0);
  assert.ok(photos.every((o) => /^\/api\/promocoes\/asset\//.test(o.src)));
  check();
  await page.reload();
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  assert.equal(await page.getByText("Os produtos ou o tema mudaram desde esta edição.", { exact: false }).count(), 0);
  check();
  await page.screenshot({
    path: "/tmp/encartiva-pharmacy-studio.png",
    fullPage: true,
  });
  console.log(
    "PASS global pharmacy models, real imports, all formats, quick editing, conflicts and tenant isolation",
  );
}
