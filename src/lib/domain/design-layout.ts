export type LayoutBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type LayoutAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export type LayerOrder = "front" | "back" | "forward" | "backward";
export type ObjectTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};
export const validLayoutBox = (r: LayoutBox) =>
  Object.values(r).every(Number.isFinite) && r.width > 0 && r.height > 0;
export function selectionBounds(boxes: LayoutBox[]): LayoutBox | null {
  if (!boxes.length || !boxes.every(validLayoutBox)) return null;
  const left = Math.min(...boxes.map((r) => r.left)),
    top = Math.min(...boxes.map((r) => r.top));
  return {
    left,
    top,
    width: Math.max(...boxes.map((r) => r.left + r.width)) - left,
    height: Math.max(...boxes.map((r) => r.top + r.height)) - top,
  };
}
export function alignmentOffset(
  box: LayoutBox,
  target: LayoutBox,
  align: LayoutAlignment,
) {
  if (!validLayoutBox(box) || !validLayoutBox(target)) return null;
  const dx =
    align === "left"
      ? target.left - box.left
      : align === "right"
        ? target.left + target.width - box.left - box.width
        : align === "center"
          ? target.left + (target.width - box.width) / 2 - box.left
          : 0;
  const dy =
    align === "top"
      ? target.top - box.top
      : align === "bottom"
        ? target.top + target.height - box.top - box.height
        : align === "middle"
          ? target.top + (target.height - box.height) / 2 - box.top
          : 0;
  return { dx, dy };
}
// Keep the outside edges fixed. The gap is between visible bounds, not object centers.
export function distributionOffsets(
  boxes: LayoutBox[],
  axis: "horizontal" | "vertical",
) {
  if (boxes.length < 3 || !boxes.every(validLayoutBox)) return null;
  const pos = axis === "horizontal" ? "left" : "top",
    size = axis === "horizontal" ? "width" : "height";
  const sorted = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box[pos] - b.box[pos] || a.index - b.index);
  const start = sorted[0].box[pos],
    end = Math.max(...boxes.map((box) => box[pos] + box[size]));
  const gap =
    (end - start - boxes.reduce((n, r) => n + r[size], 0)) / (boxes.length - 1);
  if (gap < -0.000001) return null;
  let cursor = start;
  const result = boxes.map(() => ({ dx: 0, dy: 0 }));
  for (const { box, index } of sorted) {
    result[index] =
      axis === "horizontal"
        ? { dx: cursor - box.left, dy: 0 }
        : { dx: 0, dy: cursor - box.top };
    cursor += box[size] + Math.max(0, gap);
  }
  return result;
}
export function reorderDesignLayers<T>(
  layers: T[],
  selected: Set<T>,
  mode: LayerOrder,
): T[] {
  const out = layers.slice();
  if (mode === "front")
    return [
      ...out.filter((x) => !selected.has(x)),
      ...out.filter((x) => selected.has(x)),
    ];
  if (mode === "back")
    return [
      ...out.filter((x) => selected.has(x)),
      ...out.filter((x) => !selected.has(x)),
    ];
  if (mode === "forward")
    for (let i = out.length - 2; i >= 0; i--) {
      if (selected.has(out[i]) && !selected.has(out[i + 1]))
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  if (mode === "backward")
    for (let i = 1; i < out.length; i++) {
      if (selected.has(out[i]) && !selected.has(out[i - 1]))
        [out[i], out[i - 1]] = [out[i - 1], out[i]];
    }
  return out;
}
export const validObjectTransform = (v: ObjectTransform) =>
  Object.values(v).every(Number.isFinite) &&
  Math.abs(v.x) <= 16384 &&
  Math.abs(v.y) <= 16384 &&
  v.width >= 1 &&
  v.width <= 8192 &&
  v.height >= 1 &&
  v.height <= 8192 &&
  Math.abs(v.angle) <= 360;
export function layerDisplayName(layer: {
  layerName?: string;
  text?: string;
  type?: string;
  name?: string;
}) {
  return (
    (typeof layer.layerName === "string" ? layer.layerName.slice(0, 80) : "") ||
    (typeof layer.text === "string" ? layer.text.slice(0, 35) : "") ||
    (typeof layer.name === "string" ? layer.name : "") ||
    (
      {
        image: "Fotografia",
        group: "Grupo",
        rect: "Retângulo",
        circle: "Círculo",
        triangle: "Triângulo",
        path: "Forma vetorial",
      } as Record<string, string>
    )[layer.type ?? ""] ||
    layer.type ||
    "Elemento"
  );
}
