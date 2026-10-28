// Exercise the real spreadsheet -> review -> private model -> editable Studio -> export path.
// Product images and commercial data below are fixtures in the disposable database only.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";

export async function officialPromotionFlow({
  db,
  page,
  context,
  require,
  base,
  staffId,
  ownerId,
  check,
}) {
  const Excel = require("exceljs"),
    sharp = require("sharp");
  const company = (
    await db.query("select id from companies where slug='minas-farma'")
  ).rows[0];
  const model = (
    await db.query(
      "select id,config from promo_themes where company_id=$1 and official_code='CP-MF-006'",
      [company.id],
    )
  ).rows[0];
  assert.equal(model.config.offerIdentity.kind, "glossy-price");
  check();
  const adminCookies = await context.cookies(base);
  const ownerToken = randomBytes(32).toString("base64url");
  await db.query(
    "insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 hour')",
    [ownerId, createHash("sha256").update(ownerToken).digest("hex")],
  );
  await context.addCookies([
    {
      name: "__Host-extra_session",
      value: ownerToken,
      url: base,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const identity = await (await context.request.get(base + "/api/me")).json();
  assert.equal(identity.role, "owner");
  check();
  const other = (
    await db.query("select id from companies where slug='company-b'")
  ).rows[0].id;
  if (process.env.ENCARTIVA_STYLE_TEST === "1") {
    await db.query(
      "insert into brand_kits(brand_id,colors,fonts,texts)values($1,$2::jsonb,$3::jsonb,'[]') on conflict(brand_id)do update set colors=excluded.colors,fonts=excluded.fonts",
      [
        company.id,
        JSON.stringify([{ name: "Azul oficial de teste", hex: "#075985" }]),
        JSON.stringify(["poppins"]),
      ],
    );
    await db.query(
      "insert into brand_kits(brand_id,colors,fonts,texts)values($1,$2::jsonb,'[]','[]') on conflict(brand_id)do update set colors=excluded.colors",
      [
        other,
        JSON.stringify([{ name: "Nunca outra empresa", hex: "#be185d" }]),
      ],
    );
    const logo = await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 4,
        background: { r: 7, g: 89, b: 133, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const r = await context.request.post(base + "/api/promocoes/biblioteca", {
      headers: { origin: base },
      multipart: {
        brand_id: company.id,
        file: {
          name: "Logo de teste.png",
          mimeType: "image/png",
          buffer: logo,
        },
      },
    });
    assert.equal(r.status(), 200, await r.text());
    check();
  }
  const deniedCompany = await context.request.get(base + "/empresas/" + other);
  const deniedBody = await deniedCompany.text();
  // Next can stream a not-found response with HTTP 200 after the layout flushes.
  assert.ok(
    deniedCompany.status() === 404 ||
      deniedBody.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
  );
  assert.ok(
    !deniedBody.includes("company-b"),
    "Another company's data must not render",
  );
  check();
  const prices = [0.99, 4.99, 29.99, 199.99, 1299.99];
  const names = [
    "SABONETE INFANTIL 85G",
    "CREME DENTAL 90G",
    "SHAMPOO HIDRATANTE 350ML",
    "KIT VITAMINAS 60CAPS",
    "TERMOMETRO DIGITAL UN",
  ];
  const photoDirectory = await fs.mkdtemp("/tmp/encartiva-photo-folder-");
  const photoFiles = [];
  const workbook = new Excel.Workbook(),
    sheet = workbook.addWorksheet("OFERTAS");
  sheet.addRow([
    "REFERENCIAS",
    "Barras",
    "Preço de Promoção",
    "Descrição",
    "VALRO APROXIMADO",
  ]);
  for (let i = 0; i < prices.length; i++) {
    const prefix = "789000000" + String(300 + i),
      sum = [...prefix].reduce((s, d, j) => s + Number(d) * (j % 2 ? 3 : 1), 0),
      ean = prefix + String((10 - (sum % 10)) % 10);
    const product = (
      await db.query(
        "insert into products(company_id,ean,description,name_key,search)values($1,$2,$3,$3,$3)returning id",
        [company.id, ean, names[i]],
      )
    ).rows[0];
    const image = await sharp({
      create: {
        width: 120,
        height: 180,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="120" height="180"><rect x="25" y="20" width="70" height="145" rx="12" fill="${["#2563eb", "#d94b35", "#63a542", "#c68a22", "#825ac7"][i]}"/><rect x="35" y="65" width="50" height="55" fill="white"/></svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    await fs.writeFile(photoDirectory + "/" + ean + ".png", image);
    photoFiles.push({ ean, image, productId: product.id });
    sheet.addRow(["", ean, prices[i], names[i], prices[i]]);
  }
  // Real folder picker -> batch uploads -> company-isolated image records.
  await page.goto(base + "/produtos/importar");
  await page
    .getByRole("heading", { name: "Importar produtos e imagens", exact: true })
    .waitFor();
  await page.locator("input[webkitdirectory]").setInputFiles(photoDirectory);
  await page
    .getByRole("button", { name: "Importar 5 imagens", exact: true })
    .click();
  await page
    .getByText(
      "Processamento concluído. As imagens aceitas já estão salvas no banco.",
      { exact: false },
    )
    .waitFor({ timeout: 60000 });
  const savedPhotos = (
    await db.query(
      "select i.company_id,i.product_id,i.fundo,i.is_primary from product_images i where i.product_id=any($1::uuid[])",
      [photoFiles.map((f) => f.productId)],
    )
  ).rows;
  assert.equal(savedPhotos.length, 5);
  assert.ok(
    savedPhotos.every(
      (i) =>
        i.company_id === company.id &&
        i.fundo === "transparente" &&
        i.is_primary,
    ),
  );
  check();
  const resend = await context.request.post(base + "/api/produtos/imagens", {
    headers: { origin: base },
    multipart: {
      company_id: company.id,
      preserve_cutout: "1",
      file: {
        name: photoFiles[0].ean + ".png",
        mimeType: "image/png",
        buffer: photoFiles[0].image,
      },
    },
  });
  assert.equal(resend.status(), 200, await resend.text());
  assert.equal((await resend.json()).results[0].status, "duplicada");
  check();
  const wrongCompany = await context.request.post(
    base + "/api/produtos/imagens",
    {
      headers: { origin: base },
      multipart: {
        company_id: other,
        preserve_cutout: "1",
        file: {
          name: "wrong.png",
          mimeType: "image/png",
          buffer: photoFiles[0].image,
        },
      },
    },
  );
  assert.equal(wrongCompany.status(), 409);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from product_images where product_id=any($1::uuid[])",
        [photoFiles.map((f) => f.productId)],
      )
    ).rows[0].n,
    5,
  );
  check();
  await fs.rm(photoDirectory, { recursive: true, force: true });
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const response = await context.request.post(base + "/api/promocoes/revisao", {
    headers: { origin: base },
    multipart: {
      brand_id: company.id,
      name: "Corta Preço integração Minas Farma",
      file: {
        name: "corta-preco.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: bytes,
      },
    },
  });
  assert.equal(response.status(), 200, await response.text());
  check();
  const id = (await response.json()).id;
  const imported = async () =>
    (await db.query("select * from promo_imports where id=$1", [id])).rows[0];
  let draft = await imported();
  assert.deepEqual(
    draft.original_rows.map((r) => r.price),
    prices,
  );
  assert.equal(draft.groups.length, 5);
  assert.ok(draft.groups.every((g) => g.photoIds.length === 1));
  check();
  const poll = async (fn, label) => {
    for (let n = 0; n < 150; n++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw Error("Timeout: " + label);
  };
  await page.goto(base + "/promocoes/revisao/" + id);
  assert.equal(
    await page.locator('input[name="confirmed"]').isChecked(),
    false,
  );
  await page
    .getByRole("button", {
      name: "Confirmar revisão e gerar no Studio",
      exact: true,
    })
    .click();
  assert.equal((await imported()).campaign_id, null);
  check();
  for (let i = 0; i < 5; i++) {
    if (i) await page.reload();
    await page
      .getByRole("button", { name: "Aprovar oferta", exact: true })
      .nth(i)
      .click();
    await poll(
      async () =>
        (await imported()).groups.filter((g) => g.approved).length === i + 1,
      "approval " + i,
    );
  }
  await page.reload();
  assert.equal(await page.locator('select[name="theme_id"]').inputValue(), "");
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
  draft = await imported();
  const campaign = draft.campaign_id;
  const c = (
    await db.query("select * from promo_campaigns where id=$1", [campaign])
  ).rows[0];
  assert.equal(c.theme_id, model.id);
  assert.equal(c.brand_id, company.id);
  check();
  const items = (
    await db.query(
      "select price,photo_image_ids from promo_items where campaign_id=$1 order by position",
      [campaign],
    )
  ).rows;
  assert.deepEqual(
    items.map((i) => Number(i.price)),
    prices,
  );
  assert.ok(items.every((i) => i.photo_image_ids.length === 1));
  check();
  for (const [format, width, height] of [
    ["story", 1080, 1920],
    ["feed", 1080, 1350],
    ["a4", 1414, 2000],
  ]) {
    await page.goto(`${base}/studio/${campaign}?formato=${format}`);
    await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
    const document = async () =>
      (
        await db.query(
          "select scene from studio_pages where campaign_id=$1 and format=$2 and page=0",
          [campaign, format],
        )
      ).rows[0];
    await poll(async () => !!(await document()), "saved " + format);
    const scene = (await document()).scene,
      objects = scene.objects,
      clip = objects.find((o) => o.name === "clip");
    assert.equal(clip.width, width);
    assert.equal(clip.height, height);
    const text = objects.filter((o) => o.type === "i-text").map((o) => o.text);
    assert.equal(text.filter((t) => t === "APENAS").length, 5);
    assert.equal(text.filter((t) => t === "R$").length, 5);
    assert.equal(text.filter((t) => t === "99").length, 5);
    for (const amount of ["0", "4", "29", "199", "1.299"])
      assert.ok(text.includes(amount), format + " " + amount);
    assert.ok(objects.filter((o) => o.type === "image").length >= 5);
    const descriptions = objects.filter(
      (o) =>
        o.type === "i-text" &&
        /(SABONETE|CREME|SHAMPOO|VITAMINAS|TERMOMETRO)/.test(o.text || ""),
    );
    assert.ok(descriptions.length >= 5);
    assert.ok(
      descriptions.every((o) => !o.clipPath),
      "Descriptions must remain visible after SVG/Fabric import",
    );
    check();
    if (format === "story" && process.env.ENCARTIVA_METRICS) {
      const { measureStudio } = await import("./lib/studio-metrics.mjs");
      await measureStudio(context, page.url(), process.env.ENCARTIVA_METRICS);
    }
    if (format === "feed") {
      if (process.env.ENCARTIVA_PHOTO_TEST === "1") {
        const { photoEditingFlow } = await import(
          "./lib/photo-editing-flow.mjs"
        );
        await photoEditingFlow({ db, page, campaign, format, check });
      }
      if (process.env.ENCARTIVA_STYLE_TEST === "1") {
        const { designStylesFlow } = await import(
          "./lib/design-styles-flow.mjs"
        );
        await designStylesFlow({ db, page, campaign, format, check });
      }
      if (process.env.ENCARTIVA_LAYOUT_TEST === "1") {
        const { designLayoutFlow } = await import(
          "./lib/design-layout-flow.mjs"
        );
        await designLayoutFlow({ db, page, campaign, format, check });
      }
      await page.getByText("Exportar", { exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "PNG", exact: true }).click(),
      ]);
      await download.saveAs("/tmp/nova7-minas-farma-feed.png");
      const image = await sharp(
        await fs.readFile("/tmp/nova7-minas-farma-feed.png"),
      ).metadata();
      assert.equal(image.width, width);
      assert.equal(image.height, height);
      check();
    }
    if (format === "a4") {
      await page.getByText("Exportar", { exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("button", { name: "PDF para impressão", exact: true })
          .click(),
      ]);
      await download.saveAs("/tmp/nova7-minas-farma-a4.pdf");
      const { PDFDocument } = require("pdf-lib"),
        pdf = await PDFDocument.load(
          await fs.readFile("/tmp/nova7-minas-farma-a4.pdf"),
        );
      assert.equal(pdf.getPageCount(), 1);
      assert.ok(Math.abs(pdf.getPage(0).getWidth() - 595) < 2);
      check();
    }
  }
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "insert into sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 hour')",
    [staffId, createHash("sha256").update(token).digest("hex")],
  );
  const privateImage = await context.request.get(
    base + "/api/promocoes/miniatura/" + campaign,
    {
      headers: {
        cookie:
          "__Host-extra_session=" + token + "; extra_scope=minas-farma%7C",
      },
    },
  );
  assert.equal(privateImage.status(), 404);
  check();
  await context.addCookies(adminCookies);
  await context.addCookies([
    {
      name: "extra_scope",
      value: "farma-e-farma|",
      url: base,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(base + "/promocoes/temas");
  assert.equal(
    await page
      .getByRole("link", { name: "Minas Farma — Corta Preço 3D", exact: true })
      .count(),
    0,
  );
  check();
  console.log(
    "PASS official Minas Farma spreadsheet, editable prices, three formats, PNG/PDF and cross-company isolation",
  );
}
