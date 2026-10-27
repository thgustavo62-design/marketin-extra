// Adapted from canva-clone, Copyright 2025 Alimardon Davronov, Apache-2.0. See THIRD_PARTY_NOTICES.md.
import { designPrintPoints } from "@/lib/domain/design-presets";
import { fabric } from "fabric";
import { studioCanvasJson } from "../scene-json";
import { useCallback, useState, useMemo, useRef } from "react";

import {
  Editor,
  FILL_COLOR,
  STROKE_WIDTH,
  STROKE_COLOR,
  CIRCLE_OPTIONS,
  DIAMOND_OPTIONS,
  TRIANGLE_OPTIONS,
  BuildEditorProps,
  RECTANGLE_OPTIONS,
  EditorHookProps,
  STROKE_DASH_ARRAY,
  TEXT_OPTIONS,
  FONT_FAMILY,
  FONT_WEIGHT,
  FONT_SIZE,
  JSON_KEYS,
} from "@/features/studio/types";
import { useHistory } from "@/features/studio/hooks/use-history";
import {
  createFilter,
  downloadFile,
  isTextType,
  transformText,
} from "@/features/studio/utils";
import { useHotkeys } from "@/features/studio/hooks/use-hotkeys";
import { useClipboard } from "@/features/studio/hooks/use-clipboard";
import { useAutoResize } from "@/features/studio/hooks/use-auto-resize";
import { useCanvasEvents } from "@/features/studio/hooks/use-canvas-events";
import { useWindowEvents } from "@/features/studio/hooks/use-window-events";
import { useLoadState } from "@/features/studio/hooks/use-load-state";

const buildEditor = ({
  save,
  undo,
  redo,
  canRedo,
  canUndo,
  autoZoom,
  copy,
  paste,
  canvas,
  fillColor,
  fontFamily,
  setFontFamily,
  setFillColor,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  selectedObjects,
  strokeDashArray,
  setStrokeDashArray,
}: BuildEditorProps): Editor => {
  const generateSaveOptions = () => {
    const { width, height, left, top } = getWorkspace() as fabric.Rect;

    return {
      name: "Image",
      format: "png",
      quality: 1,
      width,
      height,
      left,
      top,
    };
  };

  const exportImage = (format: "png" | "jpeg" | "svg") => {
    const clip = getWorkspace() as fabric.Rect,
      before = canvas.viewportTransform?.slice();
    canvas.discardActiveObject();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    try {
      if (format === "svg") {
        let svg = canvas.toSVG({
          viewBox: {
            x: clip.left ?? 0,
            y: clip.top ?? 0,
            width: clip.width ?? 1080,
            height: clip.height ?? 1920,
          },
          width: String(clip.width),
          height: String(clip.height),
        });
        const images = new Map<string, string>();
        const collect = (o: fabric.Object) => {
          if (o.type === "image") {
            const img = o as fabric.Image,
              el = img.getElement() as HTMLImageElement | HTMLCanvasElement,
              c = document.createElement("canvas");
            c.width = el.width;
            c.height = el.height;
            c.getContext("2d")!.drawImage(el, 0, 0);
            images.set(img.getSrc(), c.toDataURL("image/png"));
          }
          if (o.type === "group")
            (o as fabric.Group).getObjects().forEach(collect);
        };
        canvas.getObjects().forEach(collect);
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        doc.querySelectorAll("image").forEach((img) => {
          const src =
            img.getAttribute("href") ||
            img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
          if (src && images.has(src))
            img.setAttributeNS(
              "http://www.w3.org/1999/xlink",
              "xlink:href",
              images.get(src)!,
            );
        });
        svg = new XMLSerializer().serializeToString(doc);
        const url = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" }),
        );
        downloadFile(url, "svg");
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else
        downloadFile(
          canvas.toDataURL({ ...generateSaveOptions(), format, quality: 1 }),
          format === "jpeg" ? "jpg" : format,
        );
    } finally {
      if (before) canvas.setViewportTransform(before);
      canvas.requestRenderAll();
    }
  };
  const savePng = () => exportImage("png"),
    saveJpg = () => exportImage("jpeg"),
    saveSvg = () => exportImage("svg");
  const savePdf = async () => {
    const { PDFDocument } = await import("pdf-lib"),
      clip = getWorkspace() as fabric.Rect,
      before = canvas.viewportTransform?.slice();
    canvas.discardActiveObject();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    try {
      const png = canvas.toDataURL({ ...generateSaveOptions(), format: "png" }),
        pdf = await PDFDocument.create(),
        image = await pdf.embedPng(png),
        { width, height } = designPrintPoints(
          clip.width ?? 2480,
          clip.height ?? 3508,
        ),
        page = pdf.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(await pdf.save())], {
          type: "application/pdf",
        }),
      );
      downloadFile(url, "pdf");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      if (before) canvas.setViewportTransform(before);
      canvas.requestRenderAll();
    }
  };
  const saveJson = async () => {
    const dataUrl = JSON.parse(studioCanvasJson(canvas));

    await transformText(dataUrl.objects);
    const fileString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(dataUrl, null, "\t"),
    )}`;
    downloadFile(fileString, "json");
  };

  const loadJson = (json: string) => {
    const data = JSON.parse(json);

    (canvas as any).__studioRestoring = true;
    canvas.loadFromJSON(data, () => {
      autoZoom();
      (canvas as any).__studioRestoring = false;
      save();
    });
  };

  const getWorkspace = () => {
    return canvas.getObjects().find((object) => object.name === "clip");
  };

  const center = (object: fabric.Object) => {
    const workspace = getWorkspace();
    const center = workspace?.getCenterPoint();

    if (!center) return;

    // @ts-ignore
    canvas._centerObject(object, center);
  };

  const addToCanvas = (object: fabric.Object) => {
    center(object);
    canvas.add(object);
    canvas.setActiveObject(object);
  };

  return {
    savePdf,
    savePng,
    saveJpg,
    saveSvg,
    saveJson,
    loadJson,
    canUndo,
    canRedo,
    autoZoom,
    getWorkspace,
    zoomIn: () => {
      let zoomRatio = canvas.getZoom();
      zoomRatio += 0.05;
      const center = canvas.getCenter();
      canvas.zoomToPoint(
        new fabric.Point(center.left, center.top),
        zoomRatio > 1 ? 1 : zoomRatio,
      );
    },
    zoomOut: () => {
      let zoomRatio = canvas.getZoom();
      zoomRatio -= 0.05;
      const center = canvas.getCenter();
      canvas.zoomToPoint(
        new fabric.Point(center.left, center.top),
        zoomRatio < 0.2 ? 0.2 : zoomRatio,
      );
    },
    changeSize: (value: { width: number; height: number }) => {
      const workspace = getWorkspace();

      workspace?.set({
        width: Math.max(8, Math.min(8192, Number(value.width) || 1080)),
        height: Math.max(8, Math.min(8192, Number(value.height) || 1920)),
      });
      autoZoom();
      save();
    },
    changeBackground: (value: string) => {
      const workspace = getWorkspace();
      workspace?.set({ fill: value });
      canvas.renderAll();
      save();
    },
    enableDrawingMode: () => {
      canvas.discardActiveObject();
      canvas.renderAll();
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.width = strokeWidth;
      canvas.freeDrawingBrush.color = strokeColor;
    },
    disableDrawingMode: () => {
      canvas.isDrawingMode = false;
    },
    onUndo: () => undo(),
    onRedo: () => redo(),
    onCopy: () => copy(),
    onPaste: () => paste(),
    changeImageFilter: (value: string) => {
      const objects = canvas.getActiveObjects();
      objects.forEach((object) => {
        if (object.type === "image") {
          const imageObject = object as fabric.Image;

          const effect = createFilter(value);

          imageObject.filters = effect ? [effect] : [];
          imageObject.applyFilters();
          canvas.renderAll();
        }
      });
    },
    addImage: (value: string) => {
      fabric.Image.fromURL(
        value,
        (image) => {
          const workspace = getWorkspace();

          image.scale(
            Math.min(
              ((workspace?.width || 1080) * 0.75) / (image.width || 1),
              ((workspace?.height || 1920) * 0.75) / (image.height || 1),
            ),
          );

          addToCanvas(image);
        },
        {
          crossOrigin: "anonymous",
        },
      );
    },
    delete: () => {
      canvas.getActiveObjects().forEach((object) => canvas.remove(object));
      canvas.discardActiveObject();
      canvas.renderAll();
    },
    addText: (value, options) => {
      const object = new fabric.Textbox(value, {
        ...TEXT_OPTIONS,
        fill: fillColor,
        ...options,
      });

      addToCanvas(object);
    },
    getActiveOpacity: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return 1;
      }

      const value = selectedObject.get("opacity") ?? 1;

      return value;
    },
    changeFontSize: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontSize exists.
          object.set({ fontSize: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontSize: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return FONT_SIZE;
      }

      // @ts-ignore
      // Faulty TS library, fontSize exists.
      const value = selectedObject.get("fontSize") || FONT_SIZE;

      return value;
    },
    changeTextAlign: (value: string) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, textAlign exists.
          object.set({ textAlign: value });
        }
      });
      canvas.renderAll();
    },
    getActiveTextAlign: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return "left";
      }

      // @ts-ignore
      // Faulty TS library, textAlign exists.
      const value = selectedObject.get("textAlign") || "left";

      return value;
    },
    changeFontUnderline: (value: boolean) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, underline exists.
          object.set({ underline: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontUnderline: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return false;
      }

      // @ts-ignore
      // Faulty TS library, underline exists.
      const value = selectedObject.get("underline") || false;

      return value;
    },
    changeFontLinethrough: (value: boolean) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, linethrough exists.
          object.set({ linethrough: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontLinethrough: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return false;
      }

      // @ts-ignore
      // Faulty TS library, linethrough exists.
      const value = selectedObject.get("linethrough") || false;

      return value;
    },
    changeFontStyle: (value: string) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontStyle exists.
          object.set({ fontStyle: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontStyle: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return "normal";
      }

      // @ts-ignore
      // Faulty TS library, fontStyle exists.
      const value = selectedObject.get("fontStyle") || "normal";

      return value;
    },
    changeFontWeight: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontWeight exists.
          object.set({ fontWeight: value });
        }
      });
      canvas.renderAll();
    },
    changeOpacity: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        object.set({ opacity: value });
      });
      canvas.renderAll();
    },
    bringForward: () => {
      canvas.getActiveObjects().forEach((object) => {
        canvas.bringForward(object);
      });

      canvas.renderAll();

      const workspace = getWorkspace();
      workspace?.sendToBack();
    },
    sendBackwards: () => {
      canvas.getActiveObjects().forEach((object) => {
        canvas.sendBackwards(object);
      });

      canvas.renderAll();
      const workspace = getWorkspace();
      workspace?.sendToBack();
    },
    changeFontFamily: (value: string) => {
      setFontFamily(value);
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontFamily exists.
          object.set({ fontFamily: value });
        }
      });
      canvas.renderAll();
    },
    changeFillColor: (value: string) => {
      setFillColor(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ fill: value });
      });
      canvas.renderAll();
    },
    changeStrokeColor: (value: string) => {
      setStrokeColor(value);
      canvas.getActiveObjects().forEach((object) => {
        // Text types don't have stroke
        if (isTextType(object.type)) {
          object.set({ fill: value });
          return;
        }

        object.set({ stroke: value });
      });
      canvas.freeDrawingBrush.color = value;
      canvas.renderAll();
    },
    changeStrokeWidth: (value: number) => {
      setStrokeWidth(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ strokeWidth: value });
      });
      canvas.freeDrawingBrush.width = value;
      canvas.renderAll();
    },
    changeStrokeDashArray: (value: number[]) => {
      setStrokeDashArray(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ strokeDashArray: value });
      });
      canvas.renderAll();
    },
    addCircle: () => {
      const object = new fabric.Circle({
        ...CIRCLE_OPTIONS,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addSoftRectangle: () => {
      const object = new fabric.Rect({
        ...RECTANGLE_OPTIONS,
        rx: 50,
        ry: 50,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addRectangle: () => {
      const object = new fabric.Rect({
        ...RECTANGLE_OPTIONS,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addTriangle: () => {
      const object = new fabric.Triangle({
        ...TRIANGLE_OPTIONS,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addInverseTriangle: () => {
      const HEIGHT = TRIANGLE_OPTIONS.height;
      const WIDTH = TRIANGLE_OPTIONS.width;

      const object = new fabric.Polygon(
        [
          { x: 0, y: 0 },
          { x: WIDTH, y: 0 },
          { x: WIDTH / 2, y: HEIGHT },
        ],
        {
          ...TRIANGLE_OPTIONS,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          strokeDashArray: strokeDashArray,
        },
      );

      addToCanvas(object);
    },
    addDiamond: () => {
      const HEIGHT = DIAMOND_OPTIONS.height;
      const WIDTH = DIAMOND_OPTIONS.width;

      const object = new fabric.Polygon(
        [
          { x: WIDTH / 2, y: 0 },
          { x: WIDTH, y: HEIGHT / 2 },
          { x: WIDTH / 2, y: HEIGHT },
          { x: 0, y: HEIGHT / 2 },
        ],
        {
          ...DIAMOND_OPTIONS,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          strokeDashArray: strokeDashArray,
        },
      );
      addToCanvas(object);
    },
    canvas,
    getActiveFontWeight: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return FONT_WEIGHT;
      }

      // @ts-ignore
      // Faulty TS library, fontWeight exists.
      const value = selectedObject.get("fontWeight") || FONT_WEIGHT;

      return value;
    },
    getActiveFontFamily: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return fontFamily;
      }

      // @ts-ignore
      // Faulty TS library, fontFamily exists.
      const value = selectedObject.get("fontFamily") || fontFamily;

      return value;
    },
    getActiveFillColor: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return fillColor;
      }

      const value = selectedObject.get("fill") || fillColor;

      // Currently, gradients & patterns are not supported
      return value as string;
    },
    getActiveStrokeColor: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeColor;
      }

      const value = selectedObject.get("stroke") || strokeColor;

      return value;
    },
    getActiveStrokeWidth: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeWidth;
      }

      const value = selectedObject.get("strokeWidth") || strokeWidth;

      return value;
    },
    getActiveStrokeDashArray: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeDashArray;
      }

      const value = selectedObject.get("strokeDashArray") || strokeDashArray;

      return value;
    },
    selectedObjects,
  };
};

export const useEditor = ({
  defaultState,
  readOnly = false,
  defaultHeight,
  defaultWidth,
  clearSelectionCallback,
  saveCallback,
}: EditorHookProps) => {
  const initialState = useRef(defaultState);
  const initialWidth = useRef(defaultWidth);
  const initialHeight = useRef(defaultHeight);

  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [selectedObjects, setSelectedObjects] = useState<fabric.Object[]>([]);

  const [fontFamily, setFontFamily] = useState(FONT_FAMILY);
  const [fillColor, setFillColor] = useState(FILL_COLOR);
  const [strokeColor, setStrokeColor] = useState(STROKE_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTH);
  const [strokeDashArray, setStrokeDashArray] =
    useState<number[]>(STROKE_DASH_ARRAY);

  useWindowEvents();

  const { save, canRedo, canUndo, undo, redo, canvasHistory, setHistoryIndex } =
    useHistory({
      canvas,
      saveCallback: readOnly ? undefined : saveCallback,
    });

  const { copy, paste } = useClipboard({ canvas });

  const { autoZoom } = useAutoResize({
    canvas,
    container,
  });

  useCanvasEvents({
    save,
    canvas,
    setSelectedObjects,
    clearSelectionCallback,
  });

  useHotkeys({
    undo,
    redo,
    copy,
    paste,
    save,
    canvas,
  });

  useLoadState({
    canvas,
    autoZoom,
    initialState,
    canvasHistory,
    setHistoryIndex,
  });

  const editor = useMemo(() => {
    if (canvas) {
      const built = buildEditor({
        save,
        undo,
        redo,
        canUndo,
        canRedo,
        autoZoom,
        copy,
        paste,
        canvas,
        fillColor,
        strokeWidth,
        strokeColor,
        setFillColor,
        setStrokeColor,
        setStrokeWidth,
        strokeDashArray,
        selectedObjects,
        setStrokeDashArray,
        fontFamily,
        setFontFamily,
      });
      for (const key of [
        "changeSize",
        "changeBackground",
        "changeImageFilter",
        "delete",
        "changeFontSize",
        "changeTextAlign",
        "changeFontUnderline",
        "changeFontLinethrough",
        "changeFontStyle",
        "changeFontWeight",
        "changeFontFamily",
        "changeOpacity",
        "bringForward",
        "sendBackwards",
        "changeStrokeWidth",
        "changeFillColor",
        "changeStrokeColor",
        "changeStrokeDashArray",
      ]) {
        const fn = (built as any)[key];
        (built as any)[key] = (...args: any[]) => {
          if (readOnly) return;
          const out = fn(...args);
          save();
          return out;
        };
      }
      return built;
    }

    return undefined;
  }, [
    readOnly,
    canRedo,
    canUndo,
    undo,
    redo,
    save,
    autoZoom,
    copy,
    paste,
    canvas,
    fillColor,
    strokeWidth,
    strokeColor,
    selectedObjects,
    strokeDashArray,
    fontFamily,
  ]);

  const init = useCallback(
    ({
      initialCanvas,
      initialContainer,
    }: {
      initialCanvas: fabric.Canvas;
      initialContainer: HTMLDivElement;
    }) => {
      (initialCanvas as any).__studioReadOnly = readOnly;
      (initialCanvas as any).__studioRestoring = Boolean(initialState.current);
      fabric.Object.prototype.set({
        cornerColor: "#FFF",
        cornerStyle: "circle",
        borderColor: "#8150e4",
        borderScaleFactor: 1.5,
        transparentCorners: false,
        borderOpacityWhenMoving: 1,
        cornerStrokeColor: "#8150e4",
      });

      const initialWorkspace = new fabric.Rect({
        width: initialWidth.current,
        height: initialHeight.current,
        name: "clip",
        fill: "white",
        selectable: false,
        hasControls: false,
        shadow: new fabric.Shadow({
          color: "rgba(0,0,0,0.8)",
          blur: 5,
        }),
      });

      initialCanvas.setWidth(initialContainer.offsetWidth);
      initialCanvas.setHeight(initialContainer.offsetHeight);

      initialCanvas.add(initialWorkspace);
      initialCanvas.centerObject(initialWorkspace);
      initialCanvas.clipPath = initialWorkspace;

      setCanvas(initialCanvas);
      setContainer(initialContainer);

      const currentState = JSON.stringify(initialCanvas.toJSON(JSON_KEYS));
      canvasHistory.current = [currentState];
      setHistoryIndex(0);
    },
    [
      canvasHistory, // No need, this is from useRef
      setHistoryIndex, // No need, this is from useState
    ],
  );

  return { init, editor };
};
