import type { StudioScene } from "@/lib/domain/studio";
export function dataUrlBlob(src: string): Blob {
  const [meta, data] = src.split(",");
  return new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
    type: meta.slice(5).split(";")[0],
  });
}
export async function uploadStudioImage(
  id: string,
  file: Blob,
): Promise<string> {
  if (file.size > 4 * 1024 * 1024)
    throw new Error("Envie uma imagem de até 4 MB.");
  const fd = new FormData();
  fd.set("file", file, "studio-image.webp");
  const r = await fetch(`/api/promocoes/camada-imagem/${id}`, {
      method: "POST",
      body: fd,
    }),
    out = await r.json();
  if (!r.ok || !out.id)
    throw new Error(out.error ?? "Não foi possível enviar a imagem.");
  return `/api/promocoes/asset/${out.id}`;
}
export async function persistSceneImages(
  scene: StudioScene,
  id: string,
  copyLocal = false,
): Promise<StudioScene> {
  const copy = JSON.parse(JSON.stringify(scene)) as StudioScene,
    urls = new Map<string, string>();
  async function visit(v: unknown): Promise<void> {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) await visit(x);
      return;
    }
    const o = v as Record<string, unknown>;
    if (
      o.type === "image" &&
      typeof o.src === "string" &&
      (o.src.startsWith("data:image/") ||
        (copyLocal && o.src.startsWith("/api/")))
    ) {
      const src = o.src;
      if (!urls.has(src)) {
        let blob: Blob;
        if (src.startsWith("data:")) blob = dataUrlBlob(src);
        else {
          const r = await fetch(src);
          if (!r.ok)
            throw new Error("Não foi possível copiar uma imagem da arte.");
          blob = await r.blob();
        }
        if (blob.size > 3 * 1024 * 1024) {
          const bmp = await createImageBitmap(blob),
            c = document.createElement("canvas"),
            s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
          c.width = Math.round(bmp.width * s);
          c.height = Math.round(bmp.height * s);
          c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
          bmp.close();
          blob = await new Promise<Blob>((resolve, reject) =>
            c.toBlob(
              (b) =>
                b ? resolve(b) : reject(new Error("Falha ao preparar imagem.")),
              "image/webp",
              0.88,
            ),
          );
        }
        urls.set(src, await uploadStudioImage(id, blob));
      }
      o.src = urls.get(src)!;
    }
    for (const x of Object.values(o))
      if (x && typeof x === "object") await visit(x);
  }
  await visit(copy);
  return copy;
}
