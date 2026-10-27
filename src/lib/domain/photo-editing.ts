export type PhotoAdjustments = { brightness: number; contrast: number; saturation: number; blur: number };
export const PHOTO_DEFAULTS: PhotoAdjustments = { brightness: 0, contrast: 0, saturation: 0, blur: 0 };
export const PHOTO_FILTER_TYPES = new Set(['Brightness', 'Contrast', 'Saturation', 'Blur']);
const finite = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export function normalizePhotoAdjustments(raw: Partial<PhotoAdjustments>): PhotoAdjustments {
  return {
    brightness: clamp(finite(raw.brightness, 0), -1, 1),
    contrast: clamp(finite(raw.contrast, 0), -0.95, 0.95),
    saturation: clamp(finite(raw.saturation, 0), -1, 1),
    blur: clamp(finite(raw.blur, 0), 0, 1),
  };
}
export function readPhotoAdjustments(filters: unknown[]): PhotoAdjustments {
  const values = { ...PHOTO_DEFAULTS };
  for (const value of filters) {
    if (!value || typeof value !== 'object') continue;
    const f = value as Record<string, unknown>;
    for (const key of Object.keys(values) as (keyof PhotoAdjustments)[])
      if (f.type === key[0].toUpperCase() + key.slice(1)) values[key] = finite(f[key], 0);
  }
  return normalizePhotoAdjustments(values);
}
export type PhotoCrop = { x: number; y: number; width: number; height: number };
export function boundedPhotoCrop(width: number, height: number, raw: Partial<PhotoCrop>): PhotoCrop {
  const w = Math.max(1, Math.floor(finite(width, 1))), h = Math.max(1, Math.floor(finite(height, 1)));
  const x = clamp(Math.round(finite(raw.x, 0)), 0, w - 1), y = clamp(Math.round(finite(raw.y, 0)), 0, h - 1);
  return { x, y, width: clamp(Math.round(finite(raw.width, w)), 1, w - x), height: clamp(Math.round(finite(raw.height, h)), 1, h - y) };
}
export function centeredPhotoCrop(width: number, height: number, ratio: number): PhotoCrop {
  const full = boundedPhotoCrop(width, height, {});
  if (!Number.isFinite(ratio) || ratio <= 0) return full;
  const w = Math.min(full.width, full.height * ratio), h = w / ratio;
  return boundedPhotoCrop(full.width, full.height, { x: (full.width - w) / 2, y: (full.height - h) / 2, width: w, height: h });
}
