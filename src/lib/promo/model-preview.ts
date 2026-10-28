import { normalizeTheme, type PromoFormat } from "../domain/promo";
import { pharmacyModelTheme } from "../domain/pharmacy-models";
import { drawPage, loadPromoFonts } from "./render";

let samples: Promise<HTMLImageElement[]> | undefined;
function samplePhotos() {
  return (samples ??= Promise.all(
    ["#6EAB9A", "#D0A2B4", "#8099B8", "#AF9ACB"].map((color, i) => {
      // Original geometric illustrations, never inserted into a customer's campaign.
      const canvas = document.createElement("canvas");
      canvas.width = 280;
      canvas.height = 340;
      const ctx = canvas.getContext("2d")!;
      const x = i % 2 ? 55 : 78,
        width = i % 2 ? 170 : 124;
      ctx.fillStyle = "#243A43";
      ctx.fillRect(x + 18, 30, width - 36, 34);
      ctx.fillStyle = color;
      ctx.fillRect(x, 68, width, 230);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(x + 12, 142, width - 24, 91);
      ctx.fillStyle = color;
      ctx.fillRect(x + 27, 161, width - 54, 9);
      ctx.fillRect(x + 27, 181, width - 54, 5);
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = canvas.toDataURL("image/png");
      });
    }),
  ));
}
export async function drawModelPreview(
  canvas: HTMLCanvasElement,
  o: {
    modelKey: string;
    primary?: string;
    accent?: string;
    format: PromoFormat;
  },
  active = () => true,
) {
  await loadPromoFonts();
  const photos = await samplePhotos();
  if (!active()) return;
  const theme = pharmacyModelTheme(o.modelKey, normalizeTheme({}), o);
  theme.footerLines = ["SUA EMPRESA • SUA IDENTIDADE"];
  drawPage(canvas, {
    format: o.format,
    theme,
    title: null,
    validity: "VALIDADE DA SUA CAMPANHA",
    assets: {},
    items: [
      "CUIDADO DIÁRIO 200 ML",
      "HIGIENE & CONFORTO 400 ML",
      "SUA SELEÇÃO DE PRODUTOS",
      "BELEZA & BEM-ESTAR 150 ML",
    ].map((name, i) => ({
      name,
      price: [9.99, 29.99, 4.99, 19.99][i],
      img: photos[i],
    })),
  });
}
