import test from "node:test";
import assert from "node:assert/strict";
import {
  colorKey,
  designColor,
  documentColors,
  linearGradientCoordinates,
  parseDesignColor,
  replaceDesignColor,
} from "../src/lib/domain/design-colors.ts";
import { validateStudioScene } from "../src/lib/domain/studio.ts";

test("color matching normalizes HEX, shorthand and RGBA without losing alpha", () => {
  assert.equal(colorKey("#F00"), colorKey("rgb(255,0,0)"));
  assert.equal(colorKey("white"), colorKey("#fff"));
  assert.equal(
    colorKey("#ff000080"),
    colorKey("rgba(255,0,0,0.5019607843137255)"),
  );
  assert.notEqual(colorKey("rgba(255,0,0,.5)"), colorKey("#ff0000"));
  assert.equal(designColor(parseDesignColor("#0000")!), "rgba(0,0,0,0)");
});
test("untrusted and out-of-range color inputs cannot become paint", () => {
  for (const raw of [
    "url(https://evil.test)",
    "var(--x)",
    "#1234567",
    "rgba(256,0,0,1)",
    "rgba(0,0,0,2)",
    "rgb(NaN,0,0)",
    "rgb(..,0,0)",
    {},
    null,
  ])
    assert.equal(parseDesignColor(raw), null);
});
test("replace visits grouped paints, gradient stops and styled characters, preserving other pixels and data", () => {
  const image = {
    type: "image",
    fill: "#f00",
    src: "data:image/png;base64,YQ==",
    filters: [{ type: "BlendColor", color: "#f00" }],
  };
  const objects = [
    {
      type: "rect",
      name: "clip",
      width: 1080,
      height: 1350,
      selectable: false,
      fill: "#ffffff",
    },
    {
      type: "group",
      fill: "#000",
      objects: [
        {
          type: "rect",
          fill: {
            type: "linear",
            colorStops: [
              { offset: 0, color: "#f00", opacity: 0.4 },
              { offset: 1, color: "#fff" },
            ],
          },
        },
        {
          type: "i-text",
          text: "R$ 1.299,99",
          fill: "rgb(255,0,0)",
          styles: { 0: { 0: { fill: "#ff0000" } } },
          shadow: { color: "#f00" },
        },
      ],
    },
    image,
    { type: "rect", selectable: false, fill: "#f00" },
  ];
  const original = structuredClone(objects);
  assert.equal(replaceDesignColor(objects, "#ff0000", "#075985"), 3);
  const group = objects[1] as {
    objects: { text?: string; shadow?: { color: string }; fill?: unknown }[];
  };
  assert.equal(group.objects![1].text, "R$ 1.299,99");
  assert.equal(group.objects![1].shadow!.color, "#f00");
  assert.equal(
    group.objects![0].fill &&
      (group.objects![0].fill as { colorStops: { opacity?: number }[] })
        .colorStops[0].opacity,
    0.4,
  );
  assert.deepEqual(objects[2], original[2]);
  assert.deepEqual(objects[3], original[3]);
  assert.equal(
    documentColors(objects).some((c) => colorKey(c.color) === colorKey("#f00")),
    false,
  );
  assert.equal(validateStudioScene({ objects }).ok, true);
});
test("locked groups and image subtrees are not recolored, while the page can be", () => {
  const objects = [
    { type: "rect", name: "clip", selectable: false, fill: "#f00" },
    { type: "group", selectable: false, objects: [{ fill: "#f00" }] },
    { type: "image", objects: [{ fill: "#f00" }] },
  ];
  assert.equal(replaceDesignColor(objects, "#f00", "#00f"), 1);
  assert.equal(objects[1].objects![0].fill, "#f00");
});
test("palette reports distinct alpha values and ignores transparent and unrelated metadata", () => {
  const list = documentColors([
    { fill: "#f00", stroke: "rgb(255,0,0)", metadata: { fill: "#0f0" } },
    { fill: "rgba(255,0,0,.5)" },
    { fill: "transparent" },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].count, 2);
  assert.equal(replaceDesignColor([{ fill: "#f00" }], "#f00", "#ff0000"), 0);
  assert.equal(replaceDesignColor([{ fill: "#f00" }], "#f00", "url(bad)"), 0);
});
test("percentage gradients remain within the page for every angle and survive scene validation", () => {
  for (let angle = -360; angle <= 360; angle++) {
    const coords = linearGradientCoordinates(angle);
    assert.ok(
      Object.values(coords).every(
        (v) => Number.isFinite(v) && v >= 0 && v <= 1,
      ),
    );
    const fill = {
      type: "linear",
      gradientUnits: "percentage",
      coords,
      colorStops: [
        { offset: 0, color: "#075985" },
        { offset: 1, color: "#f0f9ff" },
      ],
    };
    assert.equal(
      validateStudioScene({
        objects: [
          { type: "rect", name: "clip", width: 1080, height: 1350, fill },
        ],
      }).ok,
      true,
    );
  }
});
