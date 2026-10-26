import { studioCanvasJson } from "../scene-json";
// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
import { fabric } from "fabric";
import { useEffect, useRef } from "react";

import { JSON_KEYS } from "@/features/studio/types";

interface UseLoadStateProps {
  autoZoom: () => void;
  canvas: fabric.Canvas | null;
  initialState: React.MutableRefObject<string | undefined>;
  canvasHistory: React.MutableRefObject<string[]>;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
}

export const useLoadState = ({
  canvas,
  autoZoom,
  initialState,
  canvasHistory,
  setHistoryIndex,
}: UseLoadStateProps) => {
  const initialized = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    if (initialized.current !== canvas && initialState?.current && canvas) {
      const data = JSON.parse(initialState.current);

      (canvas as any).__studioRestoring = true;
      canvas.loadFromJSON(data, () => {
        const currentState = studioCanvasJson(canvas);

        canvasHistory.current = [currentState];
        setHistoryIndex(0);
        autoZoom();
        (canvas as any).__studioRestoring = false;
        if ((canvas as any).__studioReadOnly)
          canvas.getObjects().forEach((o) => (o.selectable = false));
      });
      initialized.current = canvas;
    }
  }, [
    canvas,
    autoZoom,
    initialState, // no need, this is a ref
    canvasHistory, // no need, this is a ref
    setHistoryIndex, // no need, this is a dispatch
  ]);
};
