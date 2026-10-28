// Canvas-independent paint rules: only editable vector/text paints are visited.
export type Rgba = { r: number; g: number; b: number; a: number };
const byte = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
const hexByte = (v: number) => byte(v).toString(16).padStart(2, "0");
export function parseDesignColor(raw: unknown): Rgba | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase();
  s =
    (
      {
        black: "#000000",
        white: "#ffffff",
        transparent: "#00000000",
      } as Record<string, string>
    )[s] ?? s;
  if (/^#[a-f0-9]{3,4}$/.test(s))
    s = "#" + [...s.slice(1)].map((c) => c + c).join("");
  if (/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/.test(s))
    return {
      r: parseInt(s.slice(1, 3), 16),
      g: parseInt(s.slice(3, 5), 16),
      b: parseInt(s.slice(5, 7), 16),
      a: s.length === 9 ? parseInt(s.slice(7, 9), 16) / 255 : 1,
    };
  const m = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (!m) return null;
  const values = m.slice(1, 4).map(Number),
    a = m[4] === undefined ? 1 : Number(m[4]);
  if (
    !values.every((v) => Number.isFinite(v) && v >= 0 && v <= 255) ||
    !Number.isFinite(a) ||
    a < 0 ||
    a > 1
  )
    return null;
  return { r: byte(values[0]), g: byte(values[1]), b: byte(values[2]), a };
}
export const designHex = (c: Rgba) =>
  `#${hexByte(c.r)}${hexByte(c.g)}${hexByte(c.b)}`;
export function designColor(c: Rgba): string {
  return c.a >= 1
    ? designHex(c)
    : `rgba(${byte(c.r)},${byte(c.g)},${byte(c.b)},${Math.max(0, Math.min(1, c.a))})`;
}
export function colorKey(raw: unknown): string | null {
  const c = parseDesignColor(raw);
  return c ? `${designHex(c)}:${Math.round(c.a * 10000)}` : null;
}
type PaintObject = Record<string, unknown>;
type Visit = (holder: PaintObject, key: string) => void;
const paints = ["fill", "stroke", "backgroundColor", "textBackgroundColor"];
function paintFields(o: PaintObject, visit: Visit) {
  for (const key of paints) {
    const value = o[key];
    if (typeof value === "string") visit(o, key);
    else if (value && typeof value === "object" && "colorStops" in value) {
      const stops = (value as PaintObject).colorStops;
      if (Array.isArray(stops))
        for (const stop of stops)
          if (stop && typeof stop === "object") visit(stop, "color");
    }
  }
}
// Deliberately do not traverse image sources, filters, metadata, shadows or clip paths.
export function visitDesignPaints(
  objects: unknown[],
  visit: Visit,
  dirty?: (o: PaintObject) => void,
): void {
  for (const raw of objects) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as PaintObject;
    if (o.type === "image" || (o.selectable === false && o.name !== "clip"))
      continue;
    paintFields(o, visit);
    if (o.styles && typeof o.styles === "object")
      for (const line of Object.values(o.styles)) {
        if (line && typeof line === "object")
          for (const char of Object.values(line))
            if (char && typeof char === "object")
              paintFields(char as PaintObject, visit);
      }
    const children = o._objects ?? o.objects;
    if (Array.isArray(children)) visitDesignPaints(children, visit, dirty);
    dirty?.(o);
  }
}
export function documentColors(
  objects: unknown[],
): { color: string; count: number }[] {
  const found = new Map<string, { color: string; count: number }>();
  visitDesignPaints(objects, (o, k) => {
    const c = parseDesignColor(o[k]),
      key = colorKey(o[k]);
    if (!c || c.a === 0 || !key) return;
    const previous = found.get(key);
    if (previous) previous.count++;
    else found.set(key, { color: designColor(c), count: 1 });
  });
  return [...found.values()].sort((a, b) => b.count - a.count);
}
export function replaceDesignColor(
  objects: unknown[],
  from: string,
  to: string,
  dirty?: (o: PaintObject) => void,
): number {
  const key = colorKey(from),
    replacement = parseDesignColor(to);
  if (!key || !replacement || key === colorKey(to)) return 0;
  let count = 0;
  visitDesignPaints(
    objects,
    (o, k) => {
      if (colorKey(o[k]) === key) {
        o[k] = designColor(replacement);
        count++;
      }
    },
    dirty,
  );
  return count;
}
export function linearGradientCoordinates(angle: number) {
  const radians = ((Number.isFinite(angle) ? angle : 0) * Math.PI) / 180;
  const dx = Math.cos(radians),
    dy = Math.sin(radians),
    span = Math.abs(dx) + Math.abs(dy);
  return {
    x1: (1 - dx / span) / 2,
    y1: (1 - dy / span) / 2,
    x2: (1 + dx / span) / 2,
    y2: (1 + dy / span) / 2,
  };
}
export const DESIGN_PALETTES = [
  { name: "Violeta", colors: ["#6754d8", "#dcceff", "#f8f5ea", "#111214"] },
  { name: "Oceano", colors: ["#075985", "#38bdf8", "#f0f9ff", "#082f49"] },
  { name: "Natural", colors: ["#166534", "#a3e635", "#f7fee7", "#1a2e05"] },
  { name: "Solar", colors: ["#c2410c", "#fbbf24", "#fff7ed", "#431407"] },
  { name: "Rosa", colors: ["#be185d", "#f9a8d4", "#fff1f2", "#500724"] },
  { name: "Essencial", colors: ["#111827", "#64748b", "#e2e8f0", "#ffffff"] },
] as const;
