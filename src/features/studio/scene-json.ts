import type { fabric } from "fabric";
import { JSON_KEYS } from "./types";
export function studioCanvasJson(canvas: fabric.Canvas): string {
  const scene = canvas.toJSON(JSON_KEYS);
  function visit(v: unknown) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    const o = v as Record<string, unknown>;
    if (
      o.type === "image" &&
      typeof o.src === "string" &&
      /^https?:/.test(o.src)
    ) {
      const u = new URL(o.src);
      if (u.origin === location.origin) o.src = u.pathname + u.search;
    }
    Object.values(o).forEach(visit);
  }
  visit(scene);
  return JSON.stringify(scene);
}
