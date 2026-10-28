import assert from "node:assert/strict";
export async function scopePerformanceRegression({
  db,
  as,
  admin,
  owner,
  legacy,
  check,
  baseline = false,
}) {
  const report = {};
  for (const [label, user, slug] of [
    ["admin", admin, ""],
    ["owner", owner, "company-a"],
  ]) {
    const started = performance.now();
    try {
      await as(user, slug, null, async () => {
        await db.exec("set local statement_timeout='8000ms'");
        const plan = (
          await db.query(
            "explain(analyze,format json)select count(*)from products where active",
          )
        ).rows[0]["QUERY PLAN"][0];
        report[label] = {
          executionMs: plan["Execution Time"],
          planningMs: plan["Planning Time"],
        };
        if (!baseline)
          assert.ok(
            plan["Execution Time"] < 250,
            label +
              " catalog authorization exceeded budget: " +
              plan["Execution Time"],
          );
      });
    } catch (e) {
      report[label] = {
        error: e.code ?? e.message,
        elapsedMs: performance.now() - started,
      };
      if (!baseline) throw e;
    }
    check();
  }
  const scene = {
    objects: [
      {
        type: "rect",
        name: "clip",
        width: 1080,
        height: 1350,
        left: 0,
        top: 0,
        fill: "#ffffff",
        selectable: false,
        hasControls: false,
      },
      {
        type: "textbox",
        text: "Campanha legada",
        left: 100,
        top: 100,
        width: 700,
        fontSize: 56,
        fontFamily: "Arial",
        styles: {},
      },
    ],
  };
  try {
    await as(admin, "", null, async () => {
      await db.query(
        "insert into studio_pages(campaign_id,format,page,scene,revision,source_hash)values($1,'feed',0,$2::jsonb,1,repeat('a',64))on conflict(campaign_id,format,page)do update set scene=excluded.scene,revision=excluded.revision",
        [legacy.unassignedCampaign, JSON.stringify(scene)],
      );
      await db.query(
        "update promo_campaigns set status='rascunho',approved_by=null,approved_at=null,updated_at=now()where id=$1",
        [legacy.unassignedCampaign],
      );
    });
    report.legacySave = { ok: true };
    if (baseline)
      throw Error("Baseline unexpectedly accepted unassigned campaign");
  } catch (e) {
    report.legacySave = { error: e.code, message: e.message };
    if (!baseline) throw e;
  }
  if (baseline) {
    console.log("BASELINE database scope", JSON.stringify(report));
    return;
  }
  assert.equal(
    (
      await db.query("select brand_id from promo_campaigns where id=$1", [
        legacy.unassignedCampaign,
      ])
    ).rows[0].brand_id,
    null,
  );
  check();
  await as(owner, "company-a", null, async () => {
    await db.query(
      "select set_config('nova7.actor_id',$1,true),set_config('nova7.is_platform_admin','true',true),set_config('nova7.access_context',$2,true)",
      [admin, JSON.stringify({ actor: admin, admin: true })],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from products where company_id is null",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from studio_pages where campaign_id=$1",
          [legacy.unassignedCampaign],
        )
      ).rows[0].n,
      0,
    );
  });
  check();
  let denied = false;
  try {
    await as(admin, "", null, async () => {
      await db.query(
        "insert into promo_campaigns(name,kind)values('Novo recurso sem empresa','promocao')",
      );
    });
  } catch {
    denied = true;
  }
  assert.ok(denied, "New unassigned campaigns must remain forbidden");
  check();
  console.log(
    "PASS cached scope performance and quarantined legacy save",
    JSON.stringify(report),
  );
}
export async function legacyStudioBrowser({ db, page, base, legacy, check }) {
  await page.goto(
    base + "/studio/" + legacy.unassignedCampaign + "?formato=feed",
  );
  await page.locator("[data-editor-ready=true]").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar título", exact: true })
    .click();
  await page.getByRole("button", { name: "Salvar arte", exact: true }).click();
  for (let i = 0; i < 100; i++) {
    const row = (
      await db.query(
        "select scene from studio_pages where campaign_id=$1 and format='feed'",
        [legacy.unassignedCampaign],
      )
    ).rows[0];
    if (row?.scene.objects.some((o) => o.text === "Título")) break;
    if (i === 99) throw Error("Unassigned legacy page was not saved");
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(
    (
      await db.query("select brand_id from promo_campaigns where id=$1", [
        legacy.unassignedCampaign,
      ])
    ).rows[0].brand_id,
    null,
  );
  check();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.waitForURL(base + "/promocoes");
  check();
}
