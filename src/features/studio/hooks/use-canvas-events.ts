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
    const handlers = {
      "object:added": save,
      "object:removed": save,
      "object:modified": save,
      "text:changed": save,
      "selection:created": selected,
      "selection:updated": selected,
      "selection:cleared": clear,
    };
    for (const [k, f] of Object.entries(handlers)) canvas.on(k, f);
    return () => {
      for (const [k, f] of Object.entries(handlers)) canvas.off(k, f);
    };
  }, [canvas, save, setSelectedObjects, clearSelectionCallback]);
}
