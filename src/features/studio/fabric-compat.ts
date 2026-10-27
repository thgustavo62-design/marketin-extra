// Correct Fabric 5.3's invalid CanvasTextBaseline value without changing its path alignment behavior.
import { fabric } from "fabric";
const text = fabric.Text.prototype as fabric.Text & {
  _setTextStyles: (
    ctx: CanvasRenderingContext2D,
    style?: unknown,
    measuring?: boolean,
  ) => void;
};
text._setTextStyles = function (this: any, ctx, style, measuring) {
  ctx.textBaseline = this.path
    ? (({ center: "middle", ascender: "top", descender: "bottom" } as const)[
        this.pathAlign as "center" | "ascender" | "descender"
      ] ?? "alphabetic")
    : "alphabetic";
  ctx.font = this._getFontDeclaration(style, measuring);
};
