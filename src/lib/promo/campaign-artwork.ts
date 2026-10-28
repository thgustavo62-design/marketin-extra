import type { ThemeConfig } from "../domain/promo";
let header: Promise<HTMLImageElement> | undefined;
export function campaignArtwork(
  theme: ThemeConfig,
): Promise<HTMLImageElement | null> {
  if (theme.visual?.artwork !== "corta-preco-v1") return Promise.resolve(null);
  return (header ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => {
      header = undefined;
      reject(Error("Não foi possível carregar a base da campanha."));
    };
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = Math.round((img.height * 0.292 * 1080) / img.width);
      canvas
        .getContext("2d")!
        .drawImage(
          img,
          0,
          0,
          img.width,
          img.height * 0.292,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      const cropped = new Image();
      cropped.onload = () => resolve(cropped);
      cropped.onerror = () => reject(Error("Falha ao preparar o cabeçalho."));
      cropped.src = canvas.toDataURL("image/png");
    };
    img.src = "/campaign-bases/corta-preco-v1.webp";
  }));
}
