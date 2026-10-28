import { fabric } from "fabric";
import {
  alignmentOffset,
  distributionOffsets,
  reorderDesignLayers,
  selectionBounds,
  validObjectTransform,
  type LayerOrder,
  type LayoutAlignment,
  type ObjectTransform,
} from "@/lib/domain/design-layout";

type StudioCanvas = fabric.Canvas & {
  __studioRestoring?: boolean;
  __studioReadOnly?: boolean;
};
export type LayerObject = fabric.Object & { layerName?: string };
export function canvasEditable(canvas: fabric.Canvas) {
  const c = canvas as StudioCanvas;
  return !c.__studioRestoring && !c.__studioReadOnly;
}
export const editableLayer = (o: fabric.Object) =>
  o.name !== "clip" && o.selectable !== false && o.visible !== false;
export function currentSelection(canvas: fabric.Canvas) {
  const roots = new Set(canvas.getObjects());
  return canvas.getActiveObjects().filter((o) => roots.has(o));
}
export function canTransformSelection(canvas: fabric.Canvas) {
  const list = currentSelection(canvas);
  return canvasEditable(canvas) && list.length > 0 && list.every(editableLayer);
}
function select(canvas: fabric.Canvas, objects: fabric.Object[]) {
  canvas.discardActiveObject();
  if (objects.length)
    canvas.setActiveObject(
      objects.length === 1
        ? objects[0]
        : new fabric.ActiveSelection(objects, { canvas }),
    );
  canvas.requestRenderAll();
}
// Fabric's temporary ActiveSelection stores children in group coordinates. Normalize to
// page coordinates before editing, and record one final state rather than intermediate groups.
function mutate(
  canvas: fabric.Canvas,
  job: (selected: fabric.Object[]) => boolean,
  selected = currentSelection(canvas),
): boolean {
  return batchCanvasEdit(canvas, () => {
    canvas.discardActiveObject();
    const changed = job(selected);
    selected.forEach((o) => o.setCoords());
    select(
      canvas,
      selected.filter(
        (o) => canvas.getObjects().includes(o) && editableLayer(o),
      ),
    );
    return changed;
  });
}
export function batchCanvasEdit(
  canvas: fabric.Canvas,
  job: () => boolean,
): boolean {
  if (!canvasEditable(canvas)) return false;
  const c = canvas as StudioCanvas,
    rendering = canvas.renderOnAddRemove;
  let changed = false;
  c.__studioRestoring = true;
  canvas.renderOnAddRemove = false;
  try {
    changed = job();
  } finally {
    c.__studioRestoring = false;
    canvas.renderOnAddRemove = rendering;
    canvas.requestRenderAll();
  }
  if (changed) canvas.fire("object:modified");
  return changed;
}
export function deleteSelection(canvas: fabric.Canvas) {
  if (!canTransformSelection(canvas)) return false;
  return batchCanvasEdit(canvas, () => {
    const selected = currentSelection(canvas);
    canvas.discardActiveObject();
    canvas.remove(...selected);
    return true;
  });
}

export function selectLayer(
  canvas: fabric.Canvas,
  layer: fabric.Object,
  extend = false,
) {
  if (
    !canvasEditable(canvas) ||
    !editableLayer(layer) ||
    !canvas.getObjects().includes(layer)
  )
    return;
  const selected = currentSelection(canvas);
  select(
    canvas,
    extend
      ? selected.includes(layer)
        ? selected.filter((o) => o !== layer)
        : [...selected, layer]
      : [layer],
  );
}
export function alignSelection(
  canvas: fabric.Canvas,
  align: LayoutAlignment,
  reference: "page" | "selection",
): boolean {
  if (!canTransformSelection(canvas)) return false;
  return mutate(canvas, (objects) => {
    const boxes = objects.map((o) => o.getBoundingRect(true, true)),
      bounds = selectionBounds(boxes),
      page = canvas.getObjects().find((o) => o.name === "clip");
    if (!bounds || !page || (reference === "selection" && objects.length < 2))
      return false;
    const target =
      reference === "page" ? page.getBoundingRect(true, true) : bounds;
    objects.forEach((o, i) => {
      const delta = alignmentOffset(
        reference === "page" ? bounds : boxes[i],
        target,
        align,
      )!;
      o.set({ left: (o.left ?? 0) + delta.dx, top: (o.top ?? 0) + delta.dy });
    });
    return true;
  });
}
export function distributeSelection(
  canvas: fabric.Canvas,
  axis: "horizontal" | "vertical",
): boolean {
  if (!canTransformSelection(canvas)) return false;
  return mutate(canvas, (objects) => {
    const offsets = distributionOffsets(
      objects.map((o) => o.getBoundingRect(true, true)),
      axis,
    );
    if (!offsets) return false;
    objects.forEach((o, i) =>
      o.set({
        left: (o.left ?? 0) + offsets[i].dx,
        top: (o.top ?? 0) + offsets[i].dy,
      }),
    );
    return true;
  });
}
export function nudgeSelection(canvas: fabric.Canvas, dx: number, dy: number) {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !canTransformSelection(canvas)
  )
    return false;
  return mutate(canvas, (objects) => {
    objects.forEach((o) =>
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy }),
    );
    return true;
  });
}
export function containsPhoto(o: fabric.Object): boolean {
  return (
    o.type === "image" ||
    (o.type === "group" && (o as fabric.Group).getObjects().some(containsPhoto))
  );
}
export function transformSelection(
  canvas: fabric.Canvas,
  values: ObjectTransform,
) {
  if (
    !validObjectTransform(values) ||
    !canTransformSelection(canvas) ||
    currentSelection(canvas).length !== 1
  )
    return false;
  return mutate(canvas, ([o]) => {
    const page = canvas.getObjects().find((o) => o.name === "clip");
    if (!page || !o.width || !o.height) return false;
    const sx = values.width / o.width,
      sy = values.height / o.height;
    if (
      containsPhoto(o) &&
      Math.abs(sx / sy - (o.scaleX ?? 1) / (o.scaleY ?? 1)) > 0.0001
    )
      return false;
    o.set({ scaleX: sx, scaleY: sy, angle: values.angle });
    o.setCoords();
    const box = o.getBoundingRect(true, true),
      p = page.getBoundingRect(true, true);
    o.set({
      left: (o.left ?? 0) + p.left + values.x - box.left,
      top: (o.top ?? 0) + p.top + values.y - box.top,
    });
    return true;
  });
}
export function orderSelection(canvas: fabric.Canvas, mode: LayerOrder) {
  if (!canTransformSelection(canvas)) return false;
  return mutate(canvas, (selected) => {
    const page = canvas.getObjects().find((o) => o.name === "clip"),
      list = canvas.getObjects().filter((o) => o !== page),
      ordered = reorderDesignLayers(list, new Set(selected), mode);
    if (page) canvas.moveTo(page, 0);
    ordered.forEach((o, i) => canvas.moveTo(o, i + (page ? 1 : 0)));
    return true;
  });
}
export function groupSelection(canvas: fabric.Canvas) {
  if (!canTransformSelection(canvas) || currentSelection(canvas).length < 2)
    return false;
  return mutate(canvas, (selected) => {
    const stack = canvas.getObjects(),
      ordered = stack.filter((o) => selected.includes(o)),
      top = Math.max(...ordered.map((o) => stack.indexOf(o))),
      at = stack.slice(0, top + 1).filter((o) => !selected.includes(o)).length;
    const group = new fabric.Group(ordered.slice(), {
      layerName: "Grupo",
    } as fabric.IGroupOptions);
    ordered.forEach((o) => canvas.remove(o));
    canvas.add(group);
    canvas.moveTo(group, at);
    selected.splice(0, selected.length, group);
    return true;
  });
}
export function ungroupSelection(canvas: fabric.Canvas) {
  const active = currentSelection(canvas);
  if (
    !canTransformSelection(canvas) ||
    active.length !== 1 ||
    active[0].type !== "group"
  )
    return false;
  return mutate(canvas, (selected) => {
    const group = selected[0] as fabric.Group,
      index = canvas.getObjects().indexOf(group),
      children = group.getObjects().slice();
    group.toActiveSelection();
    canvas.discardActiveObject();
    children.forEach((o, i) => canvas.moveTo(o, index + i));
    selected.splice(0, selected.length, ...children);
    return true;
  });
}
export function renameLayer(
  canvas: fabric.Canvas,
  layer: LayerObject,
  name: string,
) {
  const value = name.trim().replace(/\s+/g, " ");
  if (
    !canvasEditable(canvas) ||
    layer.name === "clip" ||
    !canvas.getObjects().includes(layer) ||
    value.length < 1 ||
    value.length > 80
  )
    return false;
  layer.layerName = value;
  canvas.fire("object:modified");
  return true;
}
export function toggleLayer(
  canvas: fabric.Canvas,
  layer: fabric.Object,
  property: "visible" | "selectable",
) {
  if (
    !canvasEditable(canvas) ||
    layer.name === "clip" ||
    !canvas.getObjects().includes(layer)
  )
    return false;
  return mutate(canvas, () => {
    if (property === "visible") layer.set({ visible: layer.visible === false });
    else
      layer.set({ selectable: !layer.selectable, evented: !layer.selectable });
    return true;
  });
}
