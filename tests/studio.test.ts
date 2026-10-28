import { test } from "node:test";
import assert from "node:assert/strict";
import {
  studioKey,
  studioImageSource,
  relativeStudioImageSource,
  validateStudioScene,
  studioSourceChanged,
} from "../src/lib/domain/studio.ts";
const scene = (objects: object[] = []) => ({
  objects: [
    { type: "rect", name: "clip", width: 1080, height: 1920 },
    ...objects,
  ],
});
test("Studio accepts bounded format/page keys", () => {
  assert.equal(studioKey("story", 0), "story:0");
  for (const [f, p] of [
    ["bad", 0],
    ["feed", -1],
    ["feed", 1.5],
    ["a4", 200],
  ] as const)
    assert.equal(studioKey(f, p), null);
});
test("Studio accepts editable text, groups and local images", () => {
  assert.equal(
    validateStudioScene(
      scene([
        {
          type: "group",
          objects: [
            { type: "i-text", text: "Oferta", fill: "#123456" },
            {
              type: "image",
              src: "/api/promocoes/asset/12345678-1234-1234-1234-123456789012",
              crossOrigin: null,
            },
          ],
        },
      ]),
    ).ok,
    true,
  );
});
test("Studio rejects missing or invalid workspace bounds", () => {
  for (const raw of [
    { objects: [] },
    { objects: [{ type: "rect", name: "clip", width: 8193, height: 10 }] },
    { objects: [{ type: "rect", name: "clip", width: 0, height: 10 }] },
  ])
    assert.equal(validateStudioScene(raw).ok, false);
});
test("Studio blocks external and executable image sources", () => {
  for (const src of [
    "https://example.com/image.png",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,AAAA",
    "//example.com/x",
  ]) {
    assert.equal(studioImageSource(src), false);
    assert.equal(
      validateStudioScene(scene([{ type: "image", src }])).ok,
      false,
    );
  }
});
test("Studio blocks Fabric executable patterns and prototype keys", () => {
  assert.equal(
    validateStudioScene(
      scene([
        { type: "rect", fill: { type: "pattern", source: "function(){}" } },
      ]),
    ).ok,
    false,
  );
  assert.equal(
    validateStudioScene(
      JSON.parse(
        '{"objects":[{"type":"rect","name":"clip","width":100,"height":100}],"__proto__":{}}',
      ),
    ).ok,
    false,
  );
});
test("Studio bounds nesting, number values and document size", () => {
  let deep: object = {};
  for (let i = 0; i < 30; i++) deep = { objects: [deep] };
  for (const raw of [
    scene([{ type: "rect", left: Infinity }]),
    scene([{ text: "x".repeat(900001) }]),
    scene([deep]),
  ])
    assert.equal(validateStudioScene(raw).ok, false);
});
test("Studio rejects excessive object counts", () => {
  assert.equal(
    validateStudioScene(
      scene(Array.from({ length: 2000 }, () => ({ type: "rect" }))),
    ).ok,
    false,
  );
});
test("Studio detects stale generated sources without changing saved artwork", () => {
  assert.equal(studioSourceChanged("a", "b"), true);
  assert.equal(studioSourceChanged("a", "a"), false);
});

test("Generated Fabric images retain authorized relative URLs after SVG import", () => {
  const origin = "https://encartiva.example";
  for (const path of [
    "/api/produtos/imagem/12345678-1234-1234-1234-123456789012",
    "/api/promocoes/asset/12345678-1234-1234-1234-123456789012",
    "/api/promocoes/tema/12345678-1234-1234-1234-123456789012/header/feed",
  ]) {
    const src = relativeStudioImageSource(origin + path, origin);
    assert.equal(src, path);
    assert.equal(validateStudioScene(scene([{ type: "image", src }])).ok, true);
  }
});
test("Generated image normalization preserves the Studio image trust boundary", () => {
  const origin = "https://encartiva.example";
  const path = "/api/produtos/imagem/12345678-1234-1234-1234-123456789012";
  for (const src of [
    "https://external.example" + path,
    "http://encartiva.example" + path,
    "https://encartiva.example:8443" + path,
    "https://user:secret@encartiva.example" + path,
    origin + "/api/admin/users",
    origin + path + "#fragment",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,AAAA",
    null,
  ])
    assert.equal(relativeStudioImageSource(src, origin), null);
  // User-imported absolute sources remain rejected by the main validator.
  assert.equal(validateStudioScene(scene([{ type: "image", src: origin + path }])).ok, false);
});
