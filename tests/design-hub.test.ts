import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_PRESETS,
  designPrintPoints,
  designPreset,
  blankDesignScene,
} from "../src/lib/domain/design-presets.ts";
import { validateStudioScene } from "../src/lib/domain/studio.ts";
import {
  studioAiReadiness,
  studioModelVersion,
} from "../src/lib/domain/studio-ai.ts";
test("Every design preset produces a valid bounded editable scene", () => {
  for (const p of DESIGN_PRESETS) {
    assert.equal(
      validateStudioScene(blankDesignScene(p.width, p.height)).ok,
      true,
    );
    assert.ok(p.pages >= 1 && p.pages <= 30);
    assert.equal(designPreset(p.id), p);
  }
  assert.equal(
    new Set(DESIGN_PRESETS.map((p) => p.id)).size,
    DESIGN_PRESETS.length,
  );
});
test("Unknown presets cannot select arbitrary document settings", () => {
  for (const id of [null, "", {}, "constructor", "__proto__", "unlimited"])
    assert.equal(designPreset(id), null);
});
test("Carousel, TV, print and label presets preserve their actual dimensions", () => {
  assert.equal(designPreset("carousel")?.pages, 5);
  assert.equal(designPreset("tv")?.width, 1920);
  assert.equal(designPreset("tv")?.height, 1080);
  assert.equal(designPreset("a4")?.width, 2480);
  assert.equal(designPreset("label")?.height, 709);
});
test("Model versions are fixed hashes, with optional owner/model prefixes", () => {
  const hash = "a".repeat(64);
  assert.equal(studioModelVersion(hash), hash);
  assert.equal(studioModelVersion(` owner/model:${hash} `), hash);
  for (const v of [
    "",
    null,
    "latest",
    "owner/model",
    hash + "xx",
    "https://evil.test/" + hash,
  ])
    assert.equal(studioModelVersion(v), null);
});
test("An API key alone never advertises either image feature as configured", () => {
  const s = studioAiReadiness({ REPLICATE_API_TOKEN: "secret" });
  assert.equal(s.token, true);
  assert.equal(s.generate, false);
  assert.equal(s.removeBg, false);
});
test("Image generation and background removal have independent readiness", () => {
  const hash = "a".repeat(64),
    s = studioAiReadiness({
      REPLICATE_API_TOKEN: "secret",
      REPLICATE_GENERATE_VERSION: hash,
    });
  assert.equal(s.generate, true);
  assert.equal(s.removeBg, false);
  assert.equal(
    studioAiReadiness({ REPLICATE_REMOVE_BG_VERSION: hash }).removeBg,
    false,
  );
});

test("PDF dimensions preserve legacy A4 and physical label size", () => {
  const old = designPrintPoints(1414, 2000),
    label = designPrintPoints(1417, 709);
  assert.ok(Math.abs(old.width - 595.276) < 0.01);
  assert.ok(Math.abs(old.height - 841.89) < 0.01);
  assert.ok(Math.abs((label.width / 72) * 2.54 - 12) < 0.01);
  assert.ok(Math.abs((label.height / 72) * 2.54 - 6) < 0.01);
});
