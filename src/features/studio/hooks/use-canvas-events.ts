import { useEffect } from "react";
import type { fabric } from "fabric";
export function useCanvasEvents({
  save,
  canvas,
  setSelectedObjects,
  clearSelectionCallback,
}: {
  save: () => void;
  canvas: fabric.Canvas | null;
  setSelectedObjects: (o: fabric.Object[]) => void;
  clearSelectionCallback?: () => void;
}) {
  useEffect(() => {
    if (!canvas) return;
    const selected = (e: fabric.IEvent) => setSelectedObjects(e.selected ?? []),
      clear = () => {
        setSelectedObjects([]);
        clearSelectionCallback?.();
      };
    let textTimer: ReturnType<typeof setTimeout> | undefined;
    const saveText = () => {
      (
        canvas as fabric.Canvas & { __studioPendingText?: boolean }
      ).__studioPendingText = true;
      if (textTimer) clearTimeout(textTimer);
      textTimer = setTimeout(save, 250);
    };
    const commitText = () => {
      if (textTimer) clearTimeout(textTimer);
      save();
    };
    const handlers = {
      "object:added": save,
      "object:removed": save,
      "object:modified": save,
      "text:changed": saveText,
      "text:editing:exited": commitText,
      "selection:created": selected,
      "selection:updated": selected,
      "selection:cleared": clear,
    };
    for (const [k, f] of Object.entries(handlers)) canvas.on(k, f);
    return () => {
      if (textTimer) clearTimeout(textTimer);
      for (const [k, f] of Object.entries(handlers)) canvas.off(k, f);
    };
  }, [canvas, save, setSelectedObjects, clearSelectionCallback]);
}
