import { fabric } from "fabric";
import {
  linearGradientCoordinates,
  parseDesignColor,
  replaceDesignColor,
} from "@/lib/domain/design-colors";

export function editableCanvas(canvas: fabric.Canvas) {
  const c = canvas as fabric.Canvas & {
    __studioReadOnly?: boolean;
    __studioRestoring?: boolean;
  };
  return !c.__studioReadOnly && !c.__studioRestoring;
}
export function commitDesignPaint(canvas: fabric.Canvas) {
  canvas.requestRenderAll();
  canvas.fire("object:modified");
}
export function replaceCanvasColor(
  canvas: fabric.Canvas,
  from: string,
  to: string,
  selection: boolean,
): number {
  if (!editableCanvas(canvas)) return 0;
  const count = replaceDesignColor(
    selection ? canvas.getActiveObjects() : canvas.getObjects(),
    from,
    to,
    (o) => {
      o.dirty = true;
    },
  );
  if (count) commitDesignPaint(canvas);
  return count;
}
export function setPagePaint(
  canvas: fabric.Canvas,
  first: string,
  second?: string,
  angle = 0,
): boolean {
  if (
    !editableCanvas(canvas) ||
    !parseDesignColor(first) ||
    (second !== undefined && !parseDesignColor(second))
  )
    return false;
  const page = canvas.getObjects().find((o) => o.name === "clip");
  if (!page) return false;
  page.set({
    fill: second
      ? new fabric.Gradient({
          type: "linear",
          gradientUnits: "percentage",
          coords: linearGradientCoordinates(angle),
          colorStops: [
            { offset: 0, color: first },
            { offset: 1, color: second },
          ],
        })
      : first,
  });
  commitDesignPaint(canvas);
  return true;
}
