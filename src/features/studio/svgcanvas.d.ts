declare module "svgcanvas" {
  export class Context {
    constructor(width: number, height: number, options?: unknown);
    getSerializedSvg(fixNamedEntities?: boolean): string;
    [key: string]: any;
  }
}
