import assert from "node:assert/strict";
import fs from "node:fs/promises";
export async function designLayoutFlow({ db, page, campaign, format, check }) {
  page.on("pageerror", (e) => console.log("LAYOUT PAGE ERROR", e.stack));
  const promotionUrl = page.url(),
    base = new URL(promotionUrl).origin;
  const parentBefore = (
    await db.query(
      "select price from promo_items where campaign_id=$1 order by position",
      [campaign],
    )
  ).rows;
  const source = (
    await db.query(
      "select scene from studio_pages where campaign_id=$1 and format=$2 and page=0",
      [campaign, format],
    )
  ).rows[0].scene;
  const photo = source.objects.find((o) => o.type === "image");
  await page.goto(base + "/criacao");
  await page
    .getByRole("button", { name: "Criar Post para redes sociais", exact: true })
    .click();
  await page
    .getByLabel("Como vamos chamar esta criação?", { exact: true })
    .fill("Composição · validação de posição e camadas");
  await page
    .getByRole("button", { name: "Criar e abrir no editor", exact: true })
    .click();
  await page.waitForURL(/\/studio\//);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  const id = new URL(page.url()).pathname.split("/").at(-1),
    scene = async () =>
      (
        await db.query(
          "select scene from studio_pages where campaign_id=$1 and page=0",
          [id],
        )
      ).rows[0].scene;
  const poll = async (fn, label) => {
    for (let i = 0; i < 150; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(
      "LAYOUT DEBUG",
      JSON.stringify({
        label,
        url: page.url(),
        alerts: await page.locator(".studio-message").allTextContents(),
        scene: await scene(),
      }),
    );
    await page.screenshot({ path: "/tmp/layout-failure.png" });
    throw Error("Layout timeout: " + label);
  };
  const fixture = {
    version: "5.3.0",
    objects: [
      {
        type: "rect",
        name: "clip",
        width: 1080,
        height: 1350,
        left: 0,
        top: 0,
        fill: "#f8f5ea",
        strokeWidth: 0,
        selectable: false,
        evented: false,
        hasControls: false,
      },
      {
        type: "textbox",
        text: "OFERTAS DA SEMANA",
        layerName: "Título da campanha",
        width: 900,
        left: 80,
        top: 100,
        fontSize: 58,
        fontWeight: 900,
        fill: "#111214",
        fontFamily: "Arial",
      },
      {
        type: "textbox",
        text: "R$ 29,99",
        layerName: "Preço dinâmico",
        width: 550,
        left: 80,
        top: 1020,
        fontSize: 85,
        fontWeight: 900,
        fill: "#111214",
        fontFamily: "Arial",
      },
      ...[
        ["Oferta A", 80, 360, 120, "#6754d8"],
        ["Oferta B", 350, 410, 180, "#075985"],
        ["Oferta C", 760, 480, 100, "#c2410c"],
      ].map(([layerName, left, top, width, fill]) => ({
        type: "rect",
        layerName,
        left,
        top,
        width,
        height: 100,
        fill,
        strokeWidth: 0,
        rx: 14,
        ry: 14,
      })),
      {
        ...photo,
        layerName: "Foto do produto",
        left: 740,
        top: 800,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
      },
    ],
  };
  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Importar JSON", { exact: true })
    .setInputFiles({
      name: "composicao.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await poll(
    async () => (await scene()).objects.some((o) => o.layerName === "Oferta A"),
    "imported editable fixture",
  );
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  check();
  const object = async (name) =>
      (await scene()).objects.find((o) => o.layerName === name),
    near = (a, b) => Math.abs(a - b) < 0.02;
  const layers = async () => {
    if (!(await page.locator(".studio-layers").count()))
      await page.getByRole("button", { name: "Camadas", exact: true }).click();
  };
  const row = (name) =>
    page
      .locator(".studio-layer")
      .filter({ has: page.getByRole("button", { name, exact: true }) });
  const select = async (name) => {
    await layers();
    await row(name).getByRole("button", { name, exact: true }).click();
  };
  const panel = page.getByRole("complementary", {
    name: "Posição e tamanho",
    exact: true,
  });
  const position = async () => {
    if (!(await panel.count())) {
      try {
        await page
          .getByRole("button", { name: "Posição", exact: true })
          .click({ timeout: 8000 });
      } catch (error) {
        console.log(
          "POSITION DEBUG",
          await page.locator(".studio-layers").innerText(),
          await page.locator(".studio-work").innerText(),
          await page
            .locator('[data-testid="nova7-studio"]')
            .getAttribute("data-editor-ready"),
        );
        throw error;
      }
    }
    await panel.waitFor();
  };
  await select("Oferta A");
  await position();
  await panel.getByLabel("Largura do elemento", { exact: true }).fill("240");
  await panel.getByLabel("Posição X", { exact: true }).fill("200");
  await panel.getByLabel("Posição Y", { exact: true }).fill("300");
  await panel.getByLabel("Rotação do elemento", { exact: true }).fill("30");
  await panel
    .getByRole("button", { name: "Aplicar medidas", exact: true })
    .click();
  await poll(async () => {
    const a = await object("Oferta A");
    return (
      near(a.width * a.scaleX, 240) &&
      near(a.height * a.scaleY, 200) &&
      a.angle === 30
    );
  }, "exact rotation and size saved");
  check();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(async () => {
    const a = await object("Oferta A");
    return a.angle === 0 && near(a.width * a.scaleX, 120);
  }, "one-step transform undo");
  check();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await poll(
    async () => (await object("Oferta A")).angle === 30,
    "transform redo",
  );
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () => (await object("Oferta A")).angle === 0,
    "reset transform",
  );
  for (const name of ["Oferta A", "Oferta B", "Oferta C"])
    await row(name)
      .getByLabel(`Selecionar camada ${name}`, { exact: true })
      .check();
  await panel
    .getByLabel("Referência de alinhamento", { exact: true })
    .selectOption("selection");
  await panel.getByRole("button", { name: "Topo", exact: true }).click();
  await poll(
    async () =>
      near((await object("Oferta B")).top, 360) &&
      near((await object("Oferta C")).top, 360),
    "align selection",
  );
  check();
  await panel
    .getByRole("button", { name: "Espaçar horizontalmente", exact: true })
    .click();
  await poll(
    async () => near((await object("Oferta B")).left, 390),
    "equal gaps with unequal widths",
  );
  check();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () => near((await object("Oferta B")).left, 350),
    "distribution undo",
  );
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await poll(
    async () => near((await object("Oferta B")).left, 390),
    "distribution redo",
  );
  for (const name of ["Oferta A", "Oferta B", "Oferta C"])
    await row(name)
      .getByLabel(`Selecionar camada ${name}`, { exact: true })
      .check();
  await panel
    .getByLabel("Referência de alinhamento", { exact: true })
    .selectOption("page");
  await panel
    .getByRole("button", { name: "Centro horizontal", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Centro vertical", exact: true })
    .click();
  await poll(
    async () =>
      near((await object("Oferta A")).left, 150) &&
      near((await object("Oferta A")).top, 625),
    "page alignment moves whole selection",
  );
  check();
  await page
    .getByRole("button", { name: "Agrupar seleção", exact: true })
    .click();
  await poll(
    async () =>
      (await scene()).objects.some(
        (o) => o.type === "group" && o.objects.length === 3,
      ),
    "group saved",
  );
  check();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () =>
      (await scene()).objects.filter((o) => o.layerName?.startsWith("Oferta "))
        .length === 3,
    "single-step grouping undo",
  );
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await poll(
    async () => (await scene()).objects.some((o) => o.type === "group"),
    "group redo",
  );
  await row("Grupo")
    .getByRole("button", { name: "Grupo", exact: true })
    .click();
  await page
    .getByLabel("Nome da camada", { exact: true })
    .fill("Ofertas agrupadas");
  await page
    .getByRole("button", { name: "Renomear camada", exact: true })
    .click();
  await poll(
    async () => !!(await object("Ofertas agrupadas")),
    "layer name saved",
  );
  check();
  await page.reload();
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await select("Ofertas agrupadas");
  await position();
  await panel
    .getByRole("button", { name: "Enviar ao fundo", exact: true })
    .click();
  await poll(
    async () => (await scene()).objects[1].layerName === "Ofertas agrupadas",
    "back keeps page at bottom",
  );
  await panel
    .getByRole("button", { name: "Trazer ao topo", exact: true })
    .click();
  await poll(
    async () =>
      (await scene()).objects.at(-1).layerName === "Ofertas agrupadas",
    "front order saved",
  );
  check();
  await page
    .getByRole("button", { name: "Desagrupar seleção", exact: true })
    .click();
  await poll(
    async () =>
      (await scene()).objects.filter((o) => o.layerName?.startsWith("Oferta "))
        .length === 3,
    "ungroup saved",
  );
  const a0 = await object("Oferta A");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await poll(
    async () =>
      near((await object("Oferta A")).left, a0.left + 1) &&
      near((await object("Oferta A")).top, a0.top + 10),
    "keyboard precision",
  );
  check();
  await page.keyboard.press("Control+d");
  await poll(
    async () =>
      (await scene()).objects.filter((o) => o.layerName?.startsWith("Oferta "))
        .length === 6,
    "duplicate selection preserves names",
  );
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () =>
      (await scene()).objects.filter((o) => o.layerName?.startsWith("Oferta "))
        .length === 3,
    "one-step duplicate undo",
  );
  check();
  await row("Oferta A")
    .getByRole("button", { name: "Bloquear camada", exact: true })
    .click();
  await poll(
    async () => (await object("Oferta A")).selectable === false,
    "layer lock saved",
  );
  assert.equal(
    await row("Oferta A")
      .getByLabel("Selecionar camada Oferta A", { exact: true })
      .isDisabled(),
    true,
  );
  const locked = await object("Oferta A");
  await select("Oferta B");
  await page.keyboard.press("Shift+ArrowRight");
  await poll(
    async () => near((await object("Oferta B")).left, 471),
    "nudge editable layer",
  );
  assert.deepEqual(await object("Oferta A"), locked);
  check();
  await row("Oferta A")
    .getByRole("button", { name: "Desbloquear camada", exact: true })
    .click();
  await select("Foto do produto");
  const beforePhoto = await object("Foto do produto");
  await panel.getByLabel("Largura do elemento", { exact: true }).fill("240");
  assert.equal(
    await panel.getByLabel("Manter proporção", { exact: true }).isDisabled(),
    true,
  );
  await panel
    .getByRole("button", { name: "Aplicar medidas", exact: true })
    .click();
  await poll(
    async () =>
      near(
        (await object("Foto do produto")).width *
          (await object("Foto do produto")).scaleX,
        240,
      ),
    "photo resize saved",
  );
  const resized = await object("Foto do produto");
  assert.equal(resized.src, beforePhoto.src);
  assert.deepEqual(resized.filters, beforePhoto.filters);
  assert.ok(
    near(
      resized.scaleX / resized.scaleY,
      beforePhoto.scaleX / beforePhoto.scaleY,
    ),
  );
  check();
  await row("Foto do produto")
    .getByRole("button", { name: "Ocultar camada", exact: true })
    .click();
  await poll(
    async () => (await object("Foto do produto")).visible === false,
    "visibility saved",
  );
  await row("Foto do produto")
    .getByRole("button", { name: "Mostrar camada", exact: true })
    .click();
  await select("Foto do produto");
  await fs.mkdir("/tmp/encartiva-layout-qa", { recursive: true });
  await page.screenshot({ path: "/tmp/encartiva-layout-qa/desktop.png" });
  await page.setViewportSize({ width: 390, height: 1000 });
  const pbox = await panel.boundingBox();
  assert.ok(pbox && pbox.x >= 0 && pbox.x + pbox.width <= 391);
  assert.ok(
    await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return !!document
        .elementFromPoint(r.x + r.width / 2, r.y + 90)
        ?.closest(".studio-layout-panel");
    }),
  );
  await page.screenshot({ path: "/tmp/encartiva-layout-qa/mobile.png" });
  check();
  await panel
    .getByRole("button", { name: "Fechar posição", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fechar camadas", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  assert.equal((await object("Preço dinâmico")).text, "R$ 29,99");
  assert.deepEqual(
    (
      await db.query(
        "select price from promo_items where campaign_id=$1 order by position",
        [campaign],
      )
    ).rows,
    parentBefore,
  );
  check();
  await page.getByText("Exportar", { exact: true }).click();
  const [svg] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "SVG vetorial", exact: true }).click(),
  ]);
  assert.ok((await fs.readFile(await svg.path(), "utf8")).includes("29,99"));
  check();
  await page.goto(promotionUrl);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  console.log(
    "PASS layout: exact geometry, selection/page alignment, equal gaps, grouping history, ordering, rename, duplicate, locked layers, proportional photos, reload, mobile and SVG",
  );
}
