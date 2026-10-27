import { useCallback, useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { createFilter } from '../utils';
import { FlipHorizontal2, FlipVertical2, RotateCcw } from 'lucide-react';
import { boundedPhotoCrop, centeredPhotoCrop, normalizePhotoAdjustments, PHOTO_DEFAULTS, PHOTO_FILTER_TYPES, readPhotoAdjustments, type PhotoAdjustments, type PhotoCrop } from '@/lib/domain/photo-editing';

// Non-destructive Fabric adjustments: original image source remains untouched.
export function PhotoControls({ image, canvas }: { image: fabric.Image; canvas: fabric.Canvas }) {
  const [values, setValues] = useState(() => readPhotoAdjustments(image.filters ?? []));
  const valuesRef = useRef(values), dirty = useRef(false);
  const original = image.getOriginalSize();
  const [crop, setCrop] = useState(() => ({ x: 100 * (image.cropX ?? 0) / original.width, y: 100 * (image.cropY ?? 0) / original.height, width: 100 * (image.width ?? original.width) / original.width, height: 100 * (image.height ?? original.height) / original.height }));
  const [, rerender] = useState(0);
  const writable = () => !(canvas as fabric.Canvas & { __studioReadOnly?: boolean }).__studioReadOnly;
  const commit = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    canvas.fire('object:modified', { target: image });
  }, [canvas, image]);
  useEffect(() => () => commit(), [commit]);
  useEffect(() => {
    const next = readPhotoAdjustments(image.filters ?? []), size = image.getOriginalSize();
    valuesRef.current = next; setValues(next);
    setCrop({ x: 100 * (image.cropX ?? 0) / size.width, y: 100 * (image.cropY ?? 0) / size.height, width: 100 * (image.width ?? size.width) / size.width, height: 100 * (image.height ?? size.height) / size.height });
  }, [image]);
  const render = () => { image.setCoords(); canvas.requestRenderAll(); rerender(n => n + 1); };
  const apply = (patch: Partial<PhotoAdjustments>) => {
    if (!writable()) return;
    const next = normalizePhotoAdjustments({ ...valuesRef.current, ...patch });
    image.filters = (image.filters ?? []).filter(f => !PHOTO_FILTER_TYPES.has((f as { type?: string }).type ?? ""));
    if (next.brightness) image.filters.push(new fabric.Image.filters.Brightness({ brightness: next.brightness }));
    if (next.contrast) image.filters.push(new fabric.Image.filters.Contrast({ contrast: next.contrast }));
    if (next.saturation) image.filters.push(new fabric.Image.filters.Saturation({ saturation: next.saturation }));
    if (next.blur) image.filters.push(new fabric.Image.filters.Blur({ blur: next.blur }));
    image.applyFilters(); valuesRef.current = next; setValues(next); dirty.current = true; render();
  };
  const preset = (kind: string) => {
    if (!writable()) return;
    const adjustments = (image.filters ?? []).filter(f => PHOTO_FILTER_TYPES.has((f as { type?: string }).type ?? ""));
    const effect = createFilter(kind === 'Sepia' ? 'sepia' : kind === 'Brownie' ? 'brownie' : kind === 'Grayscale' ? 'greyscale' : 'none');
    image.filters = effect ? [effect, ...adjustments] : adjustments;
    image.applyFilters(); dirty.current = true; render(); commit();
  };
  const applyCrop = (box: PhotoCrop) => {
    if (!writable()) return;
    const c = boundedPhotoCrop(original.width, original.height, box), center = image.getCenterPoint();
    image.set({ cropX: c.x, cropY: c.y, width: c.width, height: c.height });
    image.setPositionByOrigin(center, 'center', 'center');
    setCrop({ x: c.x * 100 / original.width, y: c.y * 100 / original.height, width: c.width * 100 / original.width, height: c.height * 100 / original.height });
    dirty.current = true; render(); commit();
  };
  const shadow = image.shadow as fabric.Shadow | null;
  return <div className="photo-controls">
    <p className="studio-muted">Edite a foto sem substituir o arquivo original. As alterações acompanham esta arte e podem ser desfeitas.</p>
    <h3>Luz e cor</h3>
    {([['brightness', 'Brilho', -100, 100], ['contrast', 'Contraste', -95, 95], ['saturation', 'Saturação', -100, 100], ['blur', 'Desfoque', 0, 100]] as const).map(([key, label, min, max]) => <label key={key} className="photo-slider">
      <span>{label}<output>{Math.round(values[key] * 100)}</output></span>
      <input type="range" aria-label={label} min={min} max={max} value={Math.round(values[key] * 100)} onChange={e => apply({ [key]: Number(e.target.value) / 100 })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>)}
    <button type="button" className="studio-choice" onClick={() => { if (!writable()) return; image.filters = []; image.applyFilters(); valuesRef.current = { ...PHOTO_DEFAULTS }; setValues({ ...PHOTO_DEFAULTS }); dirty.current = true; render(); commit(); }}><RotateCcw size={14} /> Restaurar cores</button>
    <h3>Efeitos rápidos</h3>
    <div className="photo-buttons">{[['', 'Sem efeito'], ['Grayscale', 'Preto e branco'], ['Sepia', 'Sépia'], ['Brownie', 'Vintage']].map(([key, label]) => <button type="button" key={key} aria-pressed={key ? (image.filters ?? []).some(f => (f as { type?: string }).type === key) : !(image.filters ?? []).some(f => !PHOTO_FILTER_TYPES.has((f as { type?: string }).type ?? ""))} onClick={() => preset(key)}>{label}</button>)}</div>
    <h3>Espelhar</h3>
    <div className="photo-buttons">
      <button type="button" aria-pressed={!!image.flipX} onClick={() => { if (!writable()) return; image.set('flipX', !image.flipX); dirty.current = true; render(); commit(); }}><FlipHorizontal2 size={16} /> Horizontal</button>
      <button type="button" aria-pressed={!!image.flipY} onClick={() => { if (!writable()) return; image.set('flipY', !image.flipY); dirty.current = true; render(); commit(); }}><FlipVertical2 size={16} /> Vertical</button>
    </div>
    <h3>Recortar foto</h3>
    <p className="studio-muted">Recorte centralizado, com proporções preservadas. Você pode ajustar a área abaixo.</p>
    <div className="photo-buttons">{[[1, '1:1'], [4/5, '4:5'], [9/16, '9:16'], [16/9, '16:9']].map(([ratio, label]) => <button type="button" key={label} onClick={() => applyCrop(centeredPhotoCrop(original.width, original.height, Number(ratio)))}>{label}</button>)}</div>
    <form onSubmit={e => { e.preventDefault(); applyCrop({ x: crop.x * original.width / 100, y: crop.y * original.height / 100, width: crop.width * original.width / 100, height: crop.height * original.height / 100 }); }}>
      <div className="photo-crop-grid">{([['x', 'Esquerda'], ['y', 'Topo'], ['width', 'Largura'], ['height', 'Altura']] as const).map(([key, label]) => <label key={key}>{label} (%)<input type="number" aria-label={`${label} do recorte (%)`} min={key === 'x' || key === 'y' ? 0 : 0.1} max={100} step="any" value={Math.round(crop[key] * 10) / 10} onChange={e => setCrop(c => ({ ...c, [key]: Number(e.target.value) }))} /></label>)}</div>
      <button type="submit" className="studio-choice">Aplicar recorte</button>
    </form>
    <button type="button" className="studio-choice" onClick={() => applyCrop(boundedPhotoCrop(original.width, original.height, {}))}>Restaurar enquadramento original</button>
    <h3>Profundidade</h3>
    <label className="photo-shadow"><input type="checkbox" checked={!!shadow} onChange={e => { if (!writable()) return; image.set('shadow', e.target.checked ? new fabric.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 24, offsetX: 0, offsetY: 12 }) : undefined); dirty.current = true; render(); commit(); }} /> Sombra suave</label>
  </div>;
}
