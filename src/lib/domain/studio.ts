export const MAX_STUDIO_BYTES = 900_000,
  MAX_STUDIO_OBJECTS = 2000;
export type StudioScene = {
  objects: Record<string, unknown>[];
  [key: string]: unknown;
};
export type StudioPage = {
  scene: StudioScene;
  revision: number;
  source_hash: string;
  updated_at?: string;
};
// Fabric 5 assumes text styles exist when serializing a loaded document.
// Partial/imported scenes can omit this optional field; preserve all actual styling.
export function withStudioTextDefaults(scene: StudioScene): StudioScene {
  const copy = structuredClone(scene);
  const visit = (objects: Record<string, unknown>[]) => {
    for (const o of objects) {
      if (!o || typeof o !== "object") continue;
      if (
        ["text", "i-text", "textbox"].includes(String(o.type)) &&
        o.styles == null
      )
        o.styles = {};
      if (Array.isArray(o.objects)) visit(o.objects);
    }
  };
  visit(copy.objects);
  return copy;
}
export function studioKey(format: string, page: number): string | null {
  return ["story", "feed", "a4"].includes(format) &&
    Number.isInteger(page) &&
    page >= 0 &&
    page < 200
    ? `${format}:${page}`
    : null;
}
const imagePath =
  /^\/api\/(?:produtos\/imagem\/[a-f0-9-]{36}|promocoes\/(?:asset\/[a-f0-9-]{36}|biblioteca\/[a-f0-9-]{36}|tema-arte\/[a-f0-9-]{36}|tema\/[a-f0-9-]{36}\/(?:background|header|footer|badge|tag)\/(?:story|feed|a4)))(?:\?[a-zA-Z0-9=&._%-]*)?$/i;
export function studioImageSource(v: unknown): v is string {
  return (
    typeof v === "string" &&
    (imagePath.test(v) ||
      /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))
  );
}
// Fabric's SVG importer resolves local image paths against the page origin.
// Only generated same-origin images on our existing allowlist may be made relative.
export function relativeStudioImageSource(
  value: unknown,
  origin: string,
): string | null {
  if (typeof value !== "string") return null;
  try {
    const base = new URL(origin), url = new URL(value, base);
    const path = url.pathname + url.search;
    return (
      ["http:", "https:"].includes(base.protocol) &&
      url.origin === base.origin &&
      !url.username && !url.password && !url.hash &&
      imagePath.test(path)
    ) ? path : null;
  } catch {
    return null;
  }
}
export function validateStudioScene(
  raw: unknown,
): { ok: true; scene: StudioScene } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "Documento inválido." };
  try {
    if (new TextEncoder().encode(JSON.stringify(raw)).length > MAX_STUDIO_BYTES)
      return {
        ok: false,
        error: "A arte ficou grande demais. Divida o conteúdo em mais páginas.",
      };
  } catch {
    return { ok: false, error: "Documento inválido." };
  }
  const scene = raw as StudioScene;
  if (
    !Array.isArray(scene.objects) ||
    scene.objects.length > MAX_STUDIO_OBJECTS
  )
    return { ok: false, error: "Quantidade de elementos inválida." };
  const clips = scene.objects.filter((o) => o && o.name === "clip");
  if (
    clips.length !== 1 ||
    clips[0].type !== "rect" ||
    !Number.isFinite(clips[0].width) ||
    !Number.isFinite(clips[0].height) ||
    Number(clips[0].width) < 8 ||
    Number(clips[0].height) < 8 ||
    Number(clips[0].width) > 8192 ||
    Number(clips[0].height) > 8192
  )
    return {
      ok: false,
      error: "A página precisa medir entre 8 e 8192 pixels.",
    };
  let objects = 0,
    nodes = 0;
  const walk = (v: unknown, depth: number): boolean => {
    if (depth > 24 || ++nodes > 150000) return false;
    if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) <= 1e8;
    if (v === null || typeof v !== "object") return typeof v !== "function";
    if (Array.isArray(v)) return v.every((x) => walk(x, depth + 1));
    const o = v as Record<string, unknown>;
    if (
      "layerName" in o &&
      (typeof o.layerName !== "string" ||
        !o.layerName.trim() ||
        o.layerName.length > 80)
    )
      return false;
    if (o.type === "pattern" || o.type === "Pattern") return false;
    if (typeof o.type === "string" && ++objects > MAX_STUDIO_OBJECTS)
      return false;
    if (o.type === "image" && !studioImageSource(o.src)) return false;
    return Object.entries(o).every(([k, x]) =>
      ![
        "__proto__",
        "prototype",
        "constructor",
        "source",
        "href",
        "url",
        "crossOrigin",
      ].includes(k)
        ? walk(x, depth + 1)
        : k === "crossOrigin" && (x === null || x === "anonymous"),
    );
  };
  return walk(scene, 0)
    ? { ok: true, scene }
    : {
        ok: false,
        error:
          "O documento contém recursos externos ou elementos não suportados.",
      };
}
export const studioSourceChanged = (saved: string, current: string) =>
  saved !== current;
