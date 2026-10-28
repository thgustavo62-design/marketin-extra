import test from "node:test";
import assert from "node:assert/strict";
import {
  alignmentOffset,
  distributionOffsets,
  reorderDesignLayers,
  selectionBounds,
  validObjectTransform,
  layerDisplayName,
  type LayoutAlignment,
} from "../src/lib/domain/design-layout.ts";
import {
  validateStudioScene,
  withStudioTextDefaults,
} from "../src/lib/domain/studio.ts";
const page = { left: 20, top: 40, width: 1080, height: 1350 },
  box = { left: 150, top: 180, width: 120, height: 200 };
test("partial imported text receives serializable empty styles without changing original or styled characters", () => {
  const scene = {
    objects: [
      { type: "textbox", text: "R$ 29,99" },
      {
        type: "group",
        objects: [
          { type: "i-text", text: "OFERTA", styles: null },
          {
            type: "textbox",
            text: "Marca",
            styles: [{ start: 0, end: 2, style: { fill: "#6754d8" } }],
          },
        ],
      },
    ],
  };
  const normalized = withStudioTextDefaults(scene);
  assert.deepEqual(normalized.objects[0].styles, {});
  assert.deepEqual(
    (normalized.objects[1].objects as Record<string, unknown>[])[0].styles,
    {},
  );
  assert.deepEqual(
    (normalized.objects[1].objects as Record<string, unknown>[])[1].styles,
    scene.objects[1].objects![1].styles,
  );
  assert.equal("styles" in scene.objects[0], false);
});
test("aligns each visible edge and center to an offset page without changing size", () => {
  const expected: Record<LayoutAlignment, { dx: number; dy: number }> = {
    left: { dx: -130, dy: 0 },
    center: { dx: 350, dy: 0 },
    right: { dx: 830, dy: 0 },
    top: { dx: 0, dy: -140 },
    middle: { dx: 0, dy: 435 },
    bottom: { dx: 0, dy: 1010 },
  };
  for (const [kind, delta] of Object.entries(expected))
    assert.deepEqual(
      alignmentOffset(box, page, kind as LayoutAlignment),
      delta,
    );
  assert.deepEqual(box, { left: 150, top: 180, width: 120, height: 200 });
});
test("selection bounds include negative coordinates and all visible extents", () => {
  assert.deepEqual(
    selectionBounds([
      { left: -30, top: -20, width: 50, height: 40 },
      { left: 100, top: 90, width: 80, height: 30 },
    ]),
    { left: -30, top: -20, width: 210, height: 140 },
  );
  assert.equal(selectionBounds([]), null);
  assert.equal(selectionBounds([{ ...box, width: NaN }]), null);
});
test("horizontal distribution equalizes gaps between unequal widths and preserves outer edges", () => {
  const boxes = [
    { left: 250, top: 20, width: 80, height: 50 },
    { left: 0, top: 50, width: 100, height: 20 },
    { left: 600, top: 70, width: 200, height: 10 },
  ];
  const offsets = distributionOffsets(boxes, "horizontal")!;
  assert.deepEqual(offsets, [
    { dx: 60, dy: 0 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
  ]);
  assert.equal(
    boxes[0].left + offsets[0].dx - 100,
    600 - (boxes[0].left + offsets[0].dx + 80),
  );
});
test("vertical distribution rejects overlap and invalid inputs instead of generating impossible spacing", () => {
  const boxes = [
    { left: 0, top: 0, width: 10, height: 20 },
    { left: 0, top: 30, width: 10, height: 40 },
    { left: 0, top: 120, width: 10, height: 10 },
  ];
  assert.deepEqual(distributionOffsets(boxes, "vertical"), [
    { dx: 0, dy: 0 },
    { dx: 0, dy: 20 },
    { dx: 0, dy: 0 },
  ]);
  assert.equal(
    distributionOffsets(
      [
        { ...box, top: 0 },
        { ...box, top: 1 },
        { ...box, top: 2 },
      ],
      "vertical",
    ),
    null,
  );
  assert.equal(distributionOffsets(boxes.slice(0, 2), "vertical"), null);
  assert.equal(
    distributionOffsets([{ ...box, width: Infinity }, ...boxes], "vertical"),
    null,
  );
});
test("layer ordering preserves relative order of a noncontiguous selection and other layers", () => {
  const layers = ["a", "b", "c", "d", "e"],
    selected = new Set(["b", "d"]);
  assert.deepEqual(reorderDesignLayers(layers, selected, "front"), [
    "a",
    "c",
    "e",
    "b",
    "d",
  ]);
  assert.deepEqual(reorderDesignLayers(layers, selected, "back"), [
    "b",
    "d",
    "a",
    "c",
    "e",
  ]);
  assert.deepEqual(reorderDesignLayers(layers, selected, "forward"), [
    "a",
    "c",
    "b",
    "e",
    "d",
  ]);
  assert.deepEqual(reorderDesignLayers(layers, selected, "backward"), [
    "b",
    "a",
    "d",
    "c",
    "e",
  ]);
  assert.deepEqual(layers, ["a", "b", "c", "d", "e"]);
});
test("moving whole stacks to a boundary is idempotent and supports an empty selection", () => {
  for (const mode of ["front", "back", "forward", "backward"] as const) {
    assert.deepEqual(
      reorderDesignLayers([1, 2, 3], new Set(), mode),
      [1, 2, 3],
    );
    assert.deepEqual(
      reorderDesignLayers([1, 2, 3], new Set([1, 2, 3]), mode),
      [1, 2, 3],
    );
  }
});
test("exact dimensions accept finite supported values and reject huge or non-finite geometry", () => {
  const valid = { x: -10, y: 1350, width: 120, height: 180, angle: -30 };
  assert.equal(validObjectTransform(valid), true);
  for (const change of [
    { width: 0 },
    { height: 8193 },
    { x: Infinity },
    { y: NaN },
    { angle: 361 },
    { x: 16385 },
  ])
    assert.equal(validObjectTransform({ ...valid, ...change }), false);
});
test("layer names are display metadata and round-trip without changing text, price or internal names", () => {
  const layer = {
    type: "textbox",
    text: "R$ 1.299,99",
    layerName: "Preço principal",
    name: "price-original",
  };
  assert.equal(layerDisplayName(layer), "Preço principal");
  assert.equal(layerDisplayName({ type: "image" }), "Fotografia");
  const scene = {
    objects: [{ type: "rect", name: "clip", width: 1080, height: 1350 }, layer],
  };
  assert.equal(validateStudioScene(scene).ok, true);
  assert.equal(
    JSON.parse(JSON.stringify(scene)).objects[1].text,
    "R$ 1.299,99",
  );
});

test("untrusted layer metadata is rejected while ordinary imported scenes remain compatible", () => {
  const clip = { type: "rect", name: "clip", width: 1080, height: 1350 };
  for (const layerName of [123, {}, "", "a".repeat(81)])
    assert.equal(
      validateStudioScene({ objects: [clip, { type: "rect", layerName }] }).ok,
      false,
    );
  assert.equal(
    validateStudioScene({ objects: [clip, { type: "rect" }] }).ok,
    true,
  );
});
