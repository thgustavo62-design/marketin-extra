import assert from "node:assert/strict";
export async function studioAuditFlow({ db, page, campaign, check }) {
  const returnUrl = page.url(),
    base = new URL(returnUrl).origin;
  await page.goto(base + "/criacao");
  await page
    .getByRole("button", { name: "Criar Post para redes sociais", exact: true })
    .click();
  await page
    .getByLabel("Como vamos chamar esta criação?", { exact: true })
    .fill("Auditoria de salvamento");
  await page
    .getByRole("button", { name: "Criar e abrir no editor", exact: true })
    .click();
  await page.waitForURL(/\/studio\//);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const document = async () =>
    (
      await db.query(
        "select scene,revision,source_hash from studio_pages where campaign_id=$1 and page=0",
        [id],
      )
    ).rows[0];
  const poll = async (fn, label) => {
    for (let i = 0; i < 150; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(
      "AUDIT FAILURE",
      label,
      await page.locator(".studio-message").allTextContents(),
    );
    throw Error("Studio audit timeout: " + label);
  };
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar título", exact: true })
    .click();
  await poll(
    async () =>
      (await document())?.scene.objects.some((o) => o.text === "Título"),
    "new text autosaved",
  );
  check();
  await page
    .getByRole("button", { name: "Transparência", exact: true })
    .click();
  await page.getByRole("slider").press("Home");
  await poll(
    async () =>
      (await document()).scene.objects.find((o) => o.text === "Título")
        .opacity === 0,
    "zero opacity saved",
  );
  await page
    .getByRole("button", { name: "Transparência", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Transparência", exact: true })
    .click();
  assert.equal(
    await page.getByRole("slider").getAttribute("aria-valuenow"),
    "0",
    "Reopening transparency must preserve zero",
  );
  check();
  await page.getByRole("slider").press("End");
  await page
    .getByRole("button", { name: "Transparência", exact: true })
    .click();

  await poll(
    async () =>
      (await document()).scene.objects.find((o) => o.text === "Título")
        .opacity === 1,
    "opacity restored",
  );
  const font = page.getByLabel("Tamanho da fonte", { exact: true });
  await font.fill("");
  assert.equal(await font.inputValue(), "");
  assert.equal(
    await font.evaluate((el) => el === document.activeElement),
    true,
  );
  await font.fill("84");
  await font.press("Tab");
  await poll(
    async () =>
      (await document()).scene.objects.find((o) => o.text === "Título")
        .fontSize === 84,
    "font size autosaved",
  );
  check();
  for (const label of [
    "Negrito",
    "Itálico",
    "Sublinhado",
    "Tachado",
    "Centralizar",
  ])
    await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Salvar arte", exact: true }).click();
  await poll(async () => {
    const t = (await document()).scene.objects.find((o) => o.text === "Título");
    return (
      t.fontSize === 84 &&
      t.fontWeight === 500 &&
      t.fontStyle === "italic" &&
      t.underline &&
      t.linethrough &&
      t.textAlign === "center"
    );
  }, "toolbar changes saved");
  check();
  // The save response is JSON only, and a lost acknowledgement is idempotent.
  let lastBody,
    lastResponseSize = 0;
  const observe = async (response) => {
    if (
      response.url().includes("/api/studio/" + id + "/document") &&
      response.status() === 200
    ) {
      lastResponseSize = (await response.body()).length;
      lastBody = response.request().postDataJSON();
    }
  };
  page.on("response", observe);
  await page.getByRole("button", { name: "Itálico", exact: true }).click();
  await poll(async () => !!lastBody, "JSON save response");
  assert.ok(
    lastResponseSize < 1024,
    "Autosave must not return the entire editor server tree",
  );
  const beforeRetry = await document();
  const repeat = await page
    .context()
    .request.post(base + "/api/studio/" + id + "/document", {
      headers: { Origin: base },
      data: lastBody,
    });
  assert.equal(repeat.status(), 200);
  assert.equal((await repeat.json()).revision, beforeRetry.revision);
  assert.equal((await document()).revision, beforeRetry.revision);
  const bad = structuredClone(lastBody);
  bad.scene.objects.find((o) => o.text === "Título").text = "Obsolete write";
  const conflict = await page
    .context()
    .request.post(base + "/api/studio/" + id + "/document", {
      headers: { Origin: base },
      data: bad,
    });
  assert.equal(conflict.status(), 409);
  assert.equal(
    (await document()).scene.objects.some((o) => o.text === "Obsolete write"),
    false,
  );
  check();
  const denied = await page
    .context()
    .request.post(base + "/api/studio/" + id + "/document", {
      headers: { Origin: "https://foreign.example" },
      data: lastBody,
    });
  assert.equal(denied.status(), 403);
  check();
  const unauthenticated = await page
    .context()
    .request.post(base + "/api/studio/" + id + "/document", {
      headers: { Origin: base, Cookie: "" },
      data: lastBody,
    });
  assert.equal(unauthenticated.status(), 401);
  check();
  const foreignCompany = (
    await db.query("select id from companies where slug='company-b'")
  ).rows[0].id;
  const foreign = (
    await db.query(
      "insert into promo_campaigns(name,brand_id,kind,design_format)values('Arte isolada de teste',$1,'design','feed')returning id",
      [foreignCompany],
    )
  ).rows[0].id;
  const inaccessible = await page
    .context()
    .request.post(base + "/api/studio/" + foreign + "/document", {
      headers: { Origin: base },
      data: lastBody,
    });
  assert.equal(inaccessible.status(), 422);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from studio_pages where campaign_id=$1",
        [foreign],
      )
    ).rows[0].n,
    0,
  );
  check();
  page.off("response", observe);
  // A committed save whose HTTP response is lost must retry without a false conflict.
  const target = "**/api/studio/" + id + "/document";
  let lost = true,
    lostRevision = 0;
  await page.route(target, async (route) => {
    if (!lost) return route.continue();
    lost = false;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    lostRevision = (await response.json()).revision;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Negrito", exact: true }).click();
  await poll(
    async () =>
      lostRevision > 0 &&
      (await page.locator(".studio-status").innerText()) === "Salvo",
    "lost response retried",
  );
  assert.equal((await document()).revision, lostRevision);
  await page.unroute(target);
  check();
  // Leave an unsaved edit, reload, then recover it from IndexedDB through the UI.
  await page.route(target, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "Falha de conexão simulada" }),
    }),
  );
  await page.getByRole("button", { name: "Itálico", exact: true }).click();
  await poll(
    async () =>
      (await page.locator(".studio-status").innerText()) === "Não salvo",
    "offline state visible",
  );
  const savedItalic = (await document()).scene.objects.find(
    (o) => o.text === "Título",
  ).fontStyle;
  await poll(
    async () =>
      page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open("encartiva-studio-drafts", 1);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const rows = await new Promise((resolve, reject) => {
          const r = db.transaction("drafts").objectStore("drafts").getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        db.close();
        return rows.some((d) => d.json.includes("Título"));
      }),
    "local recovery persisted",
  );
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Recuperar edição", exact: true })
    .waitFor();
  await page.unroute(target);
  await page
    .getByRole("button", { name: "Recuperar edição", exact: true })
    .click();
  await poll(
    async () =>
      (await document()).scene.objects.find((o) => o.text === "Título")
        .fontStyle !== savedItalic,
    "local edit recovered and saved",
  );
  check();
  const chooseTitle = async (p) => {
    if (!(await p.locator(".studio-layers").count()))
      await p.getByRole("button", { name: "Camadas", exact: true }).click();
    await p
      .locator(".studio-layer")
      .getByRole("button", { name: "Título", exact: true })
      .click();
  };
  await chooseTitle(page);
  // Edits made while a request is in flight remain serialized and the newest wins.
  let inFlight = 0,
    maxInFlight = 0,
    requests = 0;
  await page.route(target, async (route) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    requests++;
    try {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    } finally {
      inFlight--;
    }
  });
  await font.fill("85");
  await font.press("Tab");
  await page
    .locator(".studio-status")
    .filter({ hasText: "Salvando" })
    .waitFor();
  await font.fill("86");
  await font.press("Tab");
  await poll(
    async () =>
      (await document()).scene.objects.find((o) => o.text === "Título")
        .fontSize === 86,
    "latest in-flight edit saved",
  );
  assert.equal(maxInFlight, 1);
  assert.ok(requests <= 2);
  check();
  await page.unroute(target);
  // Ctrl+S works while a field has focus.
  await font.fill("87");
  await page.keyboard.press("Control+s");
  await poll(
    async () =>
      (await document()).scene.objects.find((o) => o.text === "Título")
        .fontSize === 87,
    "Ctrl S inside input saved",
  );
  check();
  await font.press("Tab");
  const other = await page.context().newPage();
  try {
    await other.goto(page.url());
    await other.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
    await chooseTitle(other);
    await font.fill("88");
    await font.press("Tab");
    await poll(
      async () =>
        (await document()).scene.objects.find((o) => o.text === "Título")
          .fontSize === 88,
      "first tab edit saved",
    );
    await other.getByLabel("Tamanho da fonte", { exact: true }).fill("89");
    await other.getByLabel("Tamanho da fonte", { exact: true }).press("Tab");
    await other
      .getByRole("button", { name: "Baixar cópia editável", exact: true })
      .waitFor();
    assert.equal(
      (await document()).scene.objects.find((o) => o.text === "Título")
        .fontSize,
      88,
    );
    assert.equal(
      await other.locator(".studio-status").innerText(),
      "Não salvo",
    );
    check();
  } finally {
    await other.close();
  }
  await page.reload();
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await chooseTitle(page);
  assert.equal(
    await page.getByLabel("Tamanho da fonte", { exact: true }).inputValue(),
    "88",
  );
  check();
  await page.getByRole("button", { name: "+ Página", exact: true }).click();
  await page.waitForURL(/pagina=1/);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar caixa de texto", exact: true })
    .click();
  await poll(
    async () =>
      (
        await db.query(
          "select scene from studio_pages where campaign_id=$1 and page=1",
          [id],
        )
      ).rows[0]?.scene.objects.some((o) => o.text === "Texto"),
    "second page autosave",
  );
  assert.equal(
    (await document()).scene.objects.find((o) => o.text === "Título").fontSize,
    88,
  );
  check();
  await page.getByRole("button", { name: "Elementos", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar retângulo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Espessura da borda", exact: true })
    .click();
  await page
    .getByRole("slider", { name: "Espessura da borda", exact: true })
    .press("Home");
  await poll(
    async () =>
      (
        await db.query(
          "select scene from studio_pages where campaign_id=$1 and page=1",
          [id],
        )
      ).rows[0]?.scene.objects.some(
        (o) => o.type === "rect" && o.name !== "clip" && o.strokeWidth === 0,
      ),
    "zero border saved",
  );
  await page
    .getByRole("button", { name: "Espessura da borda", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Espessura da borda", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("slider", { name: "Espessura da borda", exact: true })
      .getAttribute("aria-valuenow"),
    "0",
  );
  check();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.waitForURL(/pagina=0/);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".studio-status").isVisible(), true);
  const saveBounds = await page
    .getByRole("button", { name: "Salvar arte", exact: true })
    .boundingBox();
  assert.ok(saveBounds.x >= 0 && saveBounds.x + saveBounds.width <= 390);
  await page.screenshot({ path: "/tmp/encartiva-audit-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  check();
  await page.goto(returnUrl);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  console.log(
    "PASS Studio autosave, explicit save, zero opacity, toolbar, idempotency, local recovery, retry, two tabs and pages",
  );
}
