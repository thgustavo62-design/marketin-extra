import { useEffect } from "react";
import { fabric } from "fabric";
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
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        canvas.remove(...canvas.getActiveObjects());
        canvas.discardActiveObject();
        canvas.requestRenderAll();
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
            canvas.getObjects().filter((o) => o.selectable),
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
