import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPhotoCrop, centeredPhotoCrop, normalizePhotoAdjustments, readPhotoAdjustments, PHOTO_DEFAULTS } from '../src/lib/domain/photo-editing.ts';
import { validateStudioScene } from '../src/lib/domain/studio.ts';

test('adjustments accept neutral values and constrain invalid imported values', () => {
  assert.deepEqual(normalizePhotoAdjustments({}), PHOTO_DEFAULTS);
  assert.deepEqual(normalizePhotoAdjustments({ brightness: Infinity, contrast: 1, saturation: -9, blur: NaN }), { brightness: 0, contrast: .95, saturation: -1, blur: 0 });
});
test('reads persisted adjustment filters without interpreting unrelated effects', () => {
  assert.deepEqual(readPhotoAdjustments([{ type: 'Sepia' }, { type: 'Brightness', brightness: .23 }, { type: 'Saturation', saturation: -.4 }, null]), { brightness: .23, saturation: -.4, contrast: 0, blur: 0 });
});
for (const [width, height] of [[120,180],[4000,3000],[1,1],[17,2000]]) {
  test(`all preset crops remain bounded for ${width}x${height}`, () => {
    for (const ratio of [1,4/5,9/16,16/9]) {
      const c = centeredPhotoCrop(width,height,ratio);
      assert.ok(c.x >= 0 && c.y >= 0 && c.width >= 1 && c.height >= 1);
      assert.ok(c.x + c.width <= width && c.y + c.height <= height);
      assert.ok(Math.abs(c.width - c.height * ratio) <= Math.max(1, ratio));
    }
  });
}
test('invalid or oversized manual crop cannot escape the source', () => {
  assert.deepEqual(boundedPhotoCrop(120,180,{x:500,y:-10,width:Infinity,height:9999}),{x:119,y:0,width:1,height:180});
  assert.deepEqual(centeredPhotoCrop(120,180,NaN),{x:0,y:0,width:120,height:180});
});
test('photo edits persist through the existing safe document format', () => {
  const src='/api/produtos/imagem/00000000-0000-0000-0000-000000000001';
  const scene={objects:[{type:'rect',name:'clip',width:1080,height:1350},{type:'image',src,width:120,height:120,cropX:0,cropY:30,flipX:true,shadow:{color:'rgba(0,0,0,0.25)',blur:24,offsetY:12},filters:[{type:'Brightness',brightness:.2}]}]};
  assert.equal(validateStudioScene(JSON.parse(JSON.stringify(scene))).ok,true);
  assert.equal(scene.objects[1].src,src);
  assert.equal(validateStudioScene({...scene,objects:[...scene.objects,{type:'image',src:'https://another-company.example/private.png'}]}).ok,false);
});
