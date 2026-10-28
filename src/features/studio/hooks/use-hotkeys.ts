import { useEffect } from "react";
import { fabric } from "fabric";
import {
  deleteSelection,
  nudgeSelection,
  groupSelection,
  ungroupSelection,
  orderSelection,
  canTransformSelection,
} from "../layout-operations";
export function useHotkeys({
  canvas,
  undo,
  redo,
  save,
  copy,
  paste,
}: {
  canvas: fabric.Canvas | null;
  undo: () => void;
  redo: () => void;
  save: (force?: boolean) => void;
  copy: () => void;
  paste: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        !canvas ||
        (canvas as fabric.Canvas & { __studioReadOnly?: boolean })
          .__studioReadOnly
      )
        return;
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        ) ||
        (canvas.getActiveObject() as fabric.IText)?.isEditing
      )
        return;
      const mod = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (
        !mod &&
        !e.altKey &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
        canTransformSelection(canvas)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudgeSelection(
          canvas,
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        );
      }
      if (mod && k === "g" && canTransformSelection(canvas)) {
        e.preventDefault();
        e.shiftKey ? ungroupSelection(canvas) : groupSelection(canvas);
      }
      if (mod && k === "d" && canTransformSelection(canvas)) {
        e.preventDefault();
        copy();
        paste();
      }
      if (
        mod &&
        (k === "[" ||
          k === "]" ||
          e.code === "BracketLeft" ||
          e.code === "BracketRight") &&
        canTransformSelection(canvas)
      ) {
        e.preventDefault();
        orderSelection(
          canvas,
          k === "]" || e.code === "BracketRight"
            ? e.shiftKey
              ? "front"
              : "forward"
            : e.shiftKey
              ? "back"
              : "backward",
        );
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        canTransformSelection(canvas)
      ) {
        e.preventDefault();
        deleteSelection(canvas);
      }
      if (mod && k === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
      }
      if (mod && k === "c") {
        e.preventDefault();
        copy();
      }
      if (mod && k === "v") {
        e.preventDefault();
        paste();
      }
      if (mod && k === "s") {
        e.preventDefault();
        save(true);
      }
      if (mod && k === "a") {
        e.preventDefault();
        canvas.discardActiveObject();
        canvas.setActiveObject(
          new fabric.ActiveSelection(
            canvas
              .getObjects()
              .filter(
                (o) => o.selectable && o.visible !== false && o.name !== "clip",
              ),
            { canvas },
          ),
        );
        canvas.requestRenderAll();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [canvas, undo, redo, save, copy, paste]);
}
