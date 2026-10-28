import { fabric } from "fabric";
import { JSON_KEYS } from "../types";
import { batchCanvasEdit, canvasEditable } from "../layout-operations";
import { useCallback, useRef } from "react";
export function useClipboard({ canvas }: { canvas: fabric.Canvas | null }) {
  const clipboard = useRef<fabric.Object | null>(null),
    pending = useRef<Promise<void>>(Promise.resolve());
  const copy = useCallback(() => {
    const active = canvas?.getActiveObject();
    pending.current = new Promise<void>((resolve) => {
      if (!active) {
        resolve();
        return;
      }
      active.clone((o: fabric.Object) => {
        clipboard.current = o;
        resolve();
      }, JSON_KEYS);
    });
  }, [canvas]);
  const paste = useCallback(async () => {
    await pending.current;
    const original = clipboard.current;
    if (!original || !canvas || !canvasEditable(canvas)) return;
    original.clone((o: fabric.Object) => {
      batchCanvasEdit(canvas, () => {
        canvas.discardActiveObject();
        o.set({
          left: (o.left ?? 0) + 10,
          top: (o.top ?? 0) + 10,
          evented: true,
        });
        if (o.type === "activeSelection") {
          const sel = o as fabric.ActiveSelection;
          sel.canvas = canvas;
          sel.forEachObject((x) => canvas.add(x));
          sel.setCoords();
        } else canvas.add(o);
        original.set({
          left: (original.left ?? 0) + 10,
          top: (original.top ?? 0) + 10,
        });
        canvas.setActiveObject(o);
        canvas.requestRenderAll();
        return true;
      });
    }, JSON_KEYS);
  }, [canvas]);
  return { copy, paste };
}
