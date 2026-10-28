// Adapted from canva-clone (Apache-2.0): bounded history, redo truncation and persistence after restore.
import { useCallback, useRef, useState } from "react";
import type { fabric } from "fabric";
import { studioCanvasJson } from "../scene-json";
type Canvas = fabric.Canvas & {
  __studioRestoring?: boolean;
  __studioReadOnly?: boolean;
  __studioPendingText?: boolean;
};
export function useHistory({
  canvas,
  saveCallback,
}: {
  canvas: fabric.Canvas | null;
  saveCallback?: (v: { json: string; width: number; height: number }) => void;
}) {
  const canvasHistory = useRef<string[]>([]),
    index = useRef(0),
    [historyIndex, updateIndex] = useState(0);
  const setHistoryIndex = useCallback((n: React.SetStateAction<number>) => {
    index.current = typeof n === "function" ? n(index.current) : n;
    updateIndex(index.current);
  }, []);
  const notify = useCallback(
    (json: string) => {
      const clip = canvas?.getObjects().find((o) => o.name === "clip");
      saveCallback?.({
        json,
        width: clip?.width ?? 0,
        height: clip?.height ?? 0,
      });
    },
    [canvas, saveCallback],
  );
  const save = useCallback(
    (force = false) => {
      const c = canvas as Canvas | null;
      if (!c || c.__studioRestoring || c.__studioReadOnly) return;
      const json = studioCanvasJson(c);
      c.__studioPendingText = false;
      if (canvasHistory.current[index.current] !== json) {
        canvasHistory.current = [
          ...canvasHistory.current.slice(0, index.current + 1),
          json,
        ].slice(-60);
        setHistoryIndex(canvasHistory.current.length - 1);
        notify(json);
      } else if (force) notify(json);
    },
    [canvas, notify, setHistoryIndex],
  );
  const restore = useCallback(
    (n: number) => {
      const c = canvas as Canvas | null;
      if (
        !c ||
        c.__studioRestoring ||
        n < 0 ||
        n >= canvasHistory.current.length
      )
        return;
      c.__studioRestoring = true;
      c.discardActiveObject();
      c.loadFromJSON(canvasHistory.current[n], () => {
        c.__studioRestoring = false;
        c.requestRenderAll();
        setHistoryIndex(n);
        notify(canvasHistory.current[n]);
        c.fire("studio:ready");
      });
    },
    [canvas, notify, setHistoryIndex],
  );
  return {
    save,
    canUndo: () => historyIndex > 0,
    canRedo: () => historyIndex < canvasHistory.current.length - 1,
    undo: () => restore(index.current - 1),
    redo: () => restore(index.current + 1),
    setHistoryIndex,
    canvasHistory,
  };
}
