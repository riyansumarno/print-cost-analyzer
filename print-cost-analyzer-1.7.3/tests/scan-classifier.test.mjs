import assert from 'node:assert/strict';
import {
  SCAN_PIXEL_CONFIG,
  isLikelyFullPageScan,
  reconcileScanClassification,
} from '../assets/js/scan-classifier.js';
import { analyzeImageData } from '../assets/js/pixel-analyzer.js';

function image(width, height, rgb = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}
function rect(data, width, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = ((y * width) + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
  }
}

// Detector struktural: satu raster hampir seluruh halaman tanpa text layer.
assert.equal(isLikelyFullPageScan({ available:true, hasRasterImage:true, rasterImageAreaCoverage:97, rasterImageOps:1, visibleTextPaintOps:0, vectorPathPaintOps:0 }, 0), true);
assert.equal(isLikelyFullPageScan({ available:true, hasRasterImage:true, rasterImageAreaCoverage:97, rasterImageOps:1, visibleTextPaintOps:0, vectorPathPaintOps:0 }, 20), false);
assert.equal(isLikelyFullPageScan({ available:true, hasRasterImage:true, rasterImageAreaCoverage:22, rasterImageOps:6, visibleTextPaintOps:20, vectorPathPaintOps:1 }, 100), false);

// Regression dari Minna no Nihongo: residual scan yang sempat HW harus menjadi H.
{
  const result = reconcileScanClassification({
    type:'HW', colorCoverage:1.70, strongColorCoverage:1.10,
    activeColorBlockCoverage:5.27, activeStrongBlockCoverage:4.29,
    p95InkChroma:35, confidence:84, reason:'old',
  });
  assert.equal(result.type, 'H');
  assert.equal(result.scanResidualSuppressed, true);
}

// Warna scan yang benar-benar kuat tidak boleh disembunyikan.
{
  const result = reconcileScanClassification({
    type:'HW', colorCoverage:4.6, strongColorCoverage:2.2,
    activeColorBlockCoverage:14, activeStrongBlockCoverage:9,
    p95InkChroma:86, confidence:88, reason:'real color',
  });
  assert.equal(result.type, 'HW');
  assert.equal(result.scanResidualSuppressed, false);
}

// Synthetic scan BW dengan cast ringan + garis tepi warna harus tetap H.
{
  const W=420, H=594;
  const data=image(W,H,[248,247,244]);
  for(let y=70;y<520;y+=28) rect(data,W,45,y,360,y+7,[45,44,43]);
  rect(data,W,0,0,10,H,[244,235,196]);
  rect(data,W,W-10,0,W,H,[224,221,244]);
  rect(data,W,365,45,400,78,[195,188,215]);
  let result=analyzeImageData({data},W,H,SCAN_PIXEL_CONFIG);
  result=reconcileScanClassification(result);
  assert.equal(result.type,'H');
}

// Full-page scan berwarna nyata tetap W.
{
  const W=420, H=594;
  const data=image(W,H,[250,250,248]);
  rect(data,W,45,75,375,500,[30,120,220]);
  let result=analyzeImageData({data},W,H,SCAN_PIXEL_CONFIG);
  result=reconcileScanClassification(result);
  assert.equal(result.type,'W');
}

console.log('scan-classifier: 8 assertions passed');
