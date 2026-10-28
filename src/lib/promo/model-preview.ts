import { normalizeTheme, type PromoFormat } from "../domain/promo";
import { pharmacyModelTheme } from "../domain/pharmacy-models";
import { drawPage, loadPromoFonts } from "./render";
import { isPriceLabel } from "../domain/price-labels";

const samples: Record<string, Promise<HTMLImageElement[]>> = {};
function samplePhotos(kind: string) {
  return (samples[kind] ??= Promise.all(
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
      if (kind === "fresh") {
        ctx.clearRect(0, 0, 280, 340);
        ctx.fillStyle = ["#F0CD46", "#D95555", "#DE6940", "#EC913D"][i];
        ctx.beginPath();
        if (i === 3) {
          ctx.moveTo(95, 85);
          ctx.lineTo(190, 85);
          ctx.lineTo(120, 290);
          ctx.closePath();
        } else
          ctx.ellipse(
            140,
            190,
            i === 0 ? 100 : 85,
            i === 0 ? 48 : 90,
            i === 0 ? -0.45 : 0,
            0,
            Math.PI * 2,
          );
        ctx.fill();
        ctx.fillStyle = "#457D45";
        ctx.beginPath();
        ctx.ellipse(150, 80, 20, 42, 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === "market" && i < 3) {
        ctx.clearRect(0, 0, 280, 340);
        ctx.fillStyle = color;
        ctx.fillRect(48, 48, 184, 245);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(61, 119, 158, 102);
        ctx.fillStyle = color;
        ctx.fillRect(85, 146, 110, 10);
        ctx.fillRect(85, 170, 110, 6);
      }
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
    priceLabel?: string;
    format: PromoFormat;
  },
  active = () => true,
) {
  await loadPromoFonts();
  const kind =
    o.modelKey === "hortifruti-fresco"
      ? "fresh"
      : ["mercado-economia", "atacado-inteligente"].includes(o.modelKey)
        ? "market"
        : "pharma";
  const photos = await samplePhotos(kind);
  if (!active()) return;
  const theme = pharmacyModelTheme(o.modelKey, normalizeTheme({}), o);
  if (isPriceLabel(o.priceLabel)) theme.priceLabel = o.priceLabel;
  theme.footerLines = ["SUA EMPRESA • SUA IDENTIDADE"];
  drawPage(canvas, {
    format: o.format,
    theme,
    title: null,
    validity: "VALIDADE DA SUA CAMPANHA",
    assets: {},
    items: (kind === "fresh"
      ? ["BANANA PRATA 1 KG", "MAÇÃ GALA 1 KG", "TOMATE 1 KG", "CENOURA 1 KG"]
      : kind === "market"
        ? [
            "ARROZ TIPO 1 5 KG",
            "FEIJÃO CARIOCA 1 KG",
            "CAFÉ TORRADO 500 G",
            "ÓLEO VEGETAL 900 ML",
          ]
        : [
            "CUIDADO DIÁRIO 200 ML",
            "HIGIENE & CONFORTO 400 ML",
            "SUA SELEÇÃO DE PRODUTOS",
            "BELEZA & BEM-ESTAR 150 ML",
          ]
    ).map((name, i) => ({
      name,
      price: [9.99, 29.99, 4.99, 19.99][i],
      img: photos[i],
    })),
  });
}
