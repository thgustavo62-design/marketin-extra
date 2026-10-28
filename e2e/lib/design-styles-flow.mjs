import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  designColor,
  parseDesignColor,
} from "../../src/lib/domain/design-colors.ts";
export async function designStylesFlow({ db, page, campaign, format, check }) {
  const document = async () =>
    (
      await db.query(
        "select scene from studio_pages where campaign_id=$1 and format=$2 and page=0",
        [campaign, format],
      )
    ).rows[0].scene;
  const poll = async (fn, label) => {
    for (let i = 0; i < 150; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw Error("Styles timeout: " + label);
  };
  const text = (scene, name) =>
    scene.objects.find((o) => o.type === "i-text" && o.text === name);
  const originalColor = designColor(
    parseDesignColor(text(await document(), "29").fill),
  );
  if (!(await page.locator(".studio-layers").count()))
    await page.getByRole("button", { name: "Camadas", exact: true }).click();
  const row = (name) =>
    page
      .locator('.studio-layer[data-object-type="i-text"]')
      .filter({ has: page.getByRole("button", { name, exact: true }) });
  await row("199")
    .getByRole("button", { name: "Bloquear camada", exact: true })
    .click();
  await poll(
    async () => text(await document(), "199").selectable === false,
    "lock saved",
  );
  await row("29").getByRole("button", { name: "29", exact: true }).click();
  await page.getByRole("button", { name: "Estilos", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Estilos da arte",
    exact: true,
  });
  await panel.waitFor();
  await panel
    .getByRole("button", {
      name: "Cor da empresa: Azul oficial de teste",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await panel.getByText("Nunca outra empresa", { exact: true }).count(),
    0,
  );
  check();
  await panel.getByLabel("Seleção", { exact: true }).check();
  await panel
    .getByLabel("Cor a substituir", { exact: true })
    .selectOption(originalColor);
  await panel
    .getByRole("button", {
      name: "Cor da empresa: Azul oficial de teste",
      exact: true,
    })
    .click();
  await panel
    .getByRole("button", { name: "Substituir na seleção", exact: true })
    .click();
  await poll(
    async () => text(await document(), "29").fill === "#075985",
    "selected color saved",
  );
  assert.notEqual(text(await document(), "199").fill, "#075985");
  check();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () => text(await document(), "29").fill !== "#075985",
    "selection undo",
  );
  check();
  const before = await document();
  await panel.getByLabel("Página", { exact: true }).check();
  await panel
    .getByLabel("Cor a substituir", { exact: true })
    .selectOption(originalColor);
  await panel
    .getByRole("button", { name: "Substituir nesta página", exact: true })
    .click();
  await poll(
    async () => text(await document(), "29").fill === "#075985",
    "page color saved",
  );
  const changed = await document();
  assert.deepEqual(
    changed.objects.filter((o) => o.type === "image"),
    before.objects.filter((o) => o.type === "image"),
  );
  assert.deepEqual(
    changed.objects.filter((o) => o.type === "i-text").map((o) => o.text),
    before.objects.filter((o) => o.type === "i-text").map((o) => o.text),
  );
  assert.deepEqual(text(changed, "199"), text(before, "199"));
  check();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () => text(await document(), "29").fill !== "#075985",
    "page undo",
  );
  check();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await poll(
    async () => text(await document(), "29").fill === "#075985",
    "page redo",
  );
  check();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () => text(await document(), "29").fill !== "#075985",
    "restore page colors",
  );
  await row("199")
    .getByRole("button", { name: "Desbloquear camada", exact: true })
    .click();
  await panel
    .getByLabel("Tipo de fundo", { exact: true })
    .selectOption("gradient");
  await panel
    .getByLabel("Cor inicial do fundo", { exact: true })
    .fill("#075985");
  await panel.getByLabel("Cor final do fundo", { exact: true }).fill("#f0f9ff");
  await panel.getByLabel("Inclinação do degradê", { exact: true }).fill("45");
  await panel
    .getByRole("button", { name: "Aplicar fundo", exact: true })
    .click();
  await poll(
    async () =>
      (await document()).objects.find((o) => o.name === "clip").fill?.type ===
      "linear",
    "gradient saved",
  );
  const gradient = (await document()).objects.find(
    (o) => o.name === "clip",
  ).fill;
  assert.equal(gradient.gradientUnits, "percentage");
  assert.equal(gradient.colorStops[0].color, "#075985");
  check();
  await page.reload();
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Estilos", exact: true }).click();
  await panel.waitFor();
  assert.equal(
    await panel.getByLabel("Tipo de fundo", { exact: true }).inputValue(),
    "gradient",
  );
  assert.equal(
    await panel
      .getByLabel("Inclinação do degradê", { exact: true })
      .inputValue(),
    "45",
  );
  check();
  await panel
    .getByRole("button", { name: "Logo de teste", exact: true })
    .click();
  await poll(
    async () =>
      (await document()).objects.filter((o) => o.type === "image").length === 6,
    "brand logo inserted",
  );
  const inserted = (await document()).objects
    .filter((o) => o.type === "image")
    .at(-1);
  assert.match(inserted.src, /^\/api\/promocoes\/asset\//);
  check();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await poll(
    async () =>
      (await document()).objects.filter((o) => o.type === "image").length === 5,
    "logo undo",
  );
  await fs.mkdir("/tmp/encartiva-design-qa", { recursive: true });
  await page.screenshot({ path: "/tmp/encartiva-design-qa/desktop.png" });
  await page.setViewportSize({ width: 390, height: 1000 });
  const box = await panel.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391);
  assert.ok(
    await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return !!document
        .elementFromPoint(r.x + r.width / 2, r.y + 100)
        ?.closest(".studio-style-panel");
    }),
  );
  check();
  await page.screenshot({ path: "/tmp/encartiva-design-qa/mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await panel
    .getByRole("button", { name: "Fechar estilos", exact: true })
    .click();
  await page.getByText("Exportar", { exact: true }).click();
  const [svg] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "SVG vetorial", exact: true }).click(),
  ]);
  const content = await fs.readFile(await svg.path(), "utf8");
  assert.ok(content.includes("linearGradient") && content.includes("#075985"));
  check();
  await page.getByText("Exportar", { exact: true }).click();
  const fontResponse = await page.request.get(
    new URL("/fonts/Montserrat.ttf", page.url()).href,
  );
  assert.match(
    fontResponse.headers()["cache-control"],
    /public.*max-age=86400/,
  );
  check();
  const promotionUrl = page.url();
  await page.goto(new URL("/criacao", promotionUrl).href);
  await page
    .getByRole("button", { name: "Criar Post para redes sociais", exact: true })
    .click();
  await page
    .getByLabel("Como vamos chamar esta criação?", { exact: true })
    .fill("Design livre · validação de estilos");
  await page
    .getByRole("button", { name: "Criar e abrir no editor", exact: true })
    .click();
  await page.waitForURL(/\/studio\//);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  const designId = new URL(page.url()).pathname.split("/").at(-1);
  const free = async () =>
    (
      await db.query(
        "select scene from studio_pages where campaign_id=$1 and page=0",
        [designId],
      )
    ).rows[0].scene;
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar título", exact: true })
    .click();
  await poll(
    async () =>
      (await free()).objects.some(
        (o) => o.type === "textbox" && o.text === "Título",
      ),
    "new design title",
  );
  await page
    .getByRole("button", { name: "Escolher fonte", exact: true })
    .click();
  await page.getByRole("button", { name: "Poppins", exact: true }).click();
  await poll(
    async () =>
      (await free()).objects.some(
        (o) => o.type === "textbox" && o.fontFamily === "PromoPoppins",
      ),
    "catalog font saved",
  );
  check();
  await page.getByRole("button", { name: "Fechar painel", exact: true }).click();
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 1000 });
  await page
    .getByRole("button", { name: "Cor de preenchimento", exact: true })
    .click();
  const colorInput = page.getByLabel("Cor HEX ou RGBA", { exact: true });
  await colorInput.waitFor();
  assert.ok(
    await colorInput.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el
      );
    }),
    "Color control must stay above Layers on mobile",
  );
  check();
  await page.screenshot({ path: "/tmp/encartiva-design-qa/mobile-color.png" });

  await page
    .getByLabel("Cor HEX ou RGBA", { exact: true })
    .fill("rgba(190,24,93,0.75)");
  await page.getByLabel("Cor HEX ou RGBA", { exact: true }).press("Enter");
  await poll(
    async () =>
      (await free()).objects.some(
        (o) => o.type === "textbox" && o.fill === "rgba(190,24,93,0.75)",
      ),
    "custom color alpha saved",
  );
  check();
  await page.reload();
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  assert.ok(
    (await free()).objects.some(
      (o) =>
        o.type === "textbox" &&
        o.fontFamily === "PromoPoppins" &&
        o.fill === "rgba(190,24,93,0.75)",
    ),
  );
  check();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(promotionUrl);
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  console.log(
    "PASS styles: isolated brand kit, selection/page paints, locked layers, source preservation, gradient, undo/redo, reload, mobile, SVG and font cache",
  );
}
