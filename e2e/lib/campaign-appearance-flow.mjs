import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

export async function campaignAppearanceFlow({
  db,
  page,
  context,
  base,
  campaign,
  companyId,
  staffId,
  check,
}) {
  const post = (data, extra = {}) =>
    context.request.post(base + `/api/promocoes/${campaign}/visual`, {
      headers: { origin: base, ...extra },
      data,
    });
  const read = async () =>
    (
      await db.query(
        "select overrides,status from promo_campaigns where id=$1",
        [campaign],
      )
    ).rows[0];
  const items = async () =>
    (
      await db.query(
        "select id,name,price,product_id,photo_image_id,photo_image_ids,style from promo_items where campaign_id=$1 order by id",
        [campaign],
      )
    ).rows;
  const before = await read(),
    originalItems = await items();
  const versionsBefore = (
    await db.query(
      "select count(*)::int as n from promo_versions where campaign_id=$1",
      [campaign],
    )
  ).rows[0].n;

  await page.goto(base + `/promocoes/${campaign}/ofertas`);
  const panel = page.getByRole("region", {
    name: "Visual desta campanha",
    exact: true,
  });
  await panel.waitFor();
  await page
    .getByLabel("Descrição do produto", { exact: true })
    .fill("EDIÇÃO AINDA NÃO SALVA");
  await page
    .getByText(
      "Salve ou descarte a edição da oferta antes de alterar o visual da campanha.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("Modelo da campanha", { exact: true }).isDisabled(),
    true,
  );
  check();
  // Reload after confirming that an unsaved offer cannot be silently replaced by appearance changes.
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await panel.waitFor();
  const oldLabel = await page
    .getByLabel("Etiqueta desta oferta", { exact: true })
    .inputValue();
  await page
    .getByLabel("Modelo da campanha", { exact: true })
    .selectOption("black-friday");
  await page
    .getByLabel("Etiqueta geral da campanha", { exact: true })
    .selectOption("ticket");
  await page
    .getByLabel("Cor principal da campanha", { exact: true })
    .fill("#2a2540");
  await page
    .getByText("Prévia de visual com alterações ainda não salvas.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Descrição do produto", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Abrir Studio", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByLabel("Etiqueta desta oferta", { exact: true })
      .inputValue(),
    oldLabel,
  );
  check();
  await page
    .getByRole("button", { name: "Descartar mudanças de visual", exact: true })
    .click();
  await page.getByText("Visual atual da campanha.", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Modelo da campanha", { exact: true }).inputValue(),
    before.overrides.model.key,
  );
  assert.deepEqual(await items(), originalItems);
  check();
  await page
    .getByLabel("Modelo da campanha", { exact: true })
    .selectOption("black-friday");
  await page
    .getByLabel("Etiqueta geral da campanha", { exact: true })
    .selectOption("ticket");
  await page
    .getByLabel("Cor principal da campanha", { exact: true })
    .fill("#2a2540");
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.url().endsWith(`/api/promocoes/${campaign}/visual`) &&
        r.method() === "POST",
    ),
    page
      .getByRole("button", { name: "Salvar visual da campanha", exact: true })
      .click(),
  ]);
  const payload = request.postDataJSON();
  await page
    .getByText(
      "Visual salvo. No Studio, use “Regenerar página” nas páginas que deseja atualizar.",
      { exact: true },
    )
    .waitFor();
  const saved = await read();
  assert.equal(saved.overrides.model.key, "black-friday");
  assert.equal(saved.overrides.model.theme.colors.skyTop, "#2a2540");
  assert.equal(saved.overrides.model.theme.priceLabel, "ticket");
  assert.deepEqual(
    saved.overrides.model.theme.footerLines,
    before.overrides.model.theme.footerLines,
  );
  assert.equal(saved.status, "rascunho");
  assert.deepEqual(await items(), originalItems);
  const versionsAfter = (
    await db.query(
      "select count(*)::int as n from promo_versions where campaign_id=$1",
      [campaign],
    )
  ).rows[0].n;
  assert.equal(versionsAfter, versionsBefore + 1);
  const snapshot = (
    await db.query(
      "select overrides from promo_versions where campaign_id=$1 and label='Antes de alterar o visual da campanha' order by created_at desc limit 1",
      [campaign],
    )
  ).rows[0];
  assert.deepEqual(snapshot.overrides, before.overrides);
  check();
  await page.reload();
  await panel.waitFor();
  assert.equal(
    await page.getByLabel("Modelo da campanha", { exact: true }).inputValue(),
    "black-friday",
  );
  assert.equal(
    await page
      .getByLabel("Etiqueta geral da campanha", { exact: true })
      .inputValue(),
    "ticket",
  );
  assert.equal(
    await page
      .getByLabel("Etiqueta desta oferta", { exact: true })
      .inputValue(),
    oldLabel,
  );
  check();
  const retry = await post(payload);
  assert.equal(retry.status(), 200, await retry.text());
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from promo_versions where campaign_id=$1",
        [campaign],
      )
    ).rows[0].n,
    versionsAfter,
  );
  check();
  const stale = await post({ ...payload, accent: "#123456" });
  assert.equal(stale.status(), 409);
  assert.deepEqual(await read(), saved);
  check();
  assert.equal(
    (await post({ ...payload, priceLabel: "invalid" })).status(),
    422,
  );
  assert.equal(
    (await post(payload, { origin: "https://invalid.example" })).status(),
    403,
  );
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 hour')",
    [staffId, createHash("sha256").update(token).digest("hex")],
  );
  assert.equal(
    (
      await post(payload, {
        cookie: `__Host-extra_session=${token}; extra_scope=company-a%7C`,
      })
    ).status(),
    404,
  );
  check();
  const official = (
    await db.query(
      "select c.id,c.overrides from promo_campaigns c join promo_themes t on t.id=c.theme_id where c.brand_id=$1 and t.official_code='CP-MF-006' limit 1",
      [companyId],
    )
  ).rows[0];
  assert.ok(official);
  const rejected = await context.request.post(
    base + `/api/promocoes/${official.id}/visual`,
    { headers: { origin: base }, data: payload },
  );
  assert.equal(rejected.status(), 422);
  assert.deepEqual(
    (
      await db.query("select overrides from promo_campaigns where id=$1", [
        official.id,
      ])
    ).rows[0].overrides,
    official.overrides,
  );
  check();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "/tmp/encartiva-campaign-appearance-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "/tmp/encartiva-campaign-appearance-desktop.png",
    fullPage: true,
  });
  check();
  await page.getByRole("button", { name: "Abrir Studio", exact: true }).click();
  await page.waitForURL(/\/studio\//);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await page
    .getByText("Os produtos ou o tema mudaram desde esta edição.", {
      exact: false,
    })
    .waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Regenerar página", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Regenerar página", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Salvar arte", exact: true }).click();
  await page.getByText("Salvo", { exact: true }).waitFor({ timeout: 30000 });
  const scene = (
    await db.query(
      "select scene from studio_pages where campaign_id=$1 and format='feed' and page=0",
      [campaign],
    )
  ).rows[0].scene;
  const text = scene.objects
    .filter((o) => o.type === "i-text")
    .map((o) => o.text || "")
    .join(" ")
    .replace(/\s+/g, " ");
  assert.ok(text.includes("BLACK FRIDAY"), text);
  assert.ok(text.includes("SABONETE EDITADO"), text);
  assert.deepEqual(await items(), originalItems);
  check();
  console.log(
    "PASS existing campaign model/colors/labels, live preview, saved version, idempotency, conflicts, official identity and tenant isolation",
  );
}
