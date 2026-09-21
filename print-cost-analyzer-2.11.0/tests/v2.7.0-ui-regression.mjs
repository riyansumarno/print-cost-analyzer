import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const live3d = fs.readFileSync(new URL('../assets/js/live-3d-preview.js', import.meta.url), 'utf8');
const pricing = JSON.parse(fs.readFileSync(new URL('../data/pricing-config.json', import.meta.url), 'utf8'));

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
assert.deepEqual([...new Set(dupes)], [], 'HTML tidak boleh memiliki ID duplikat');

for (const id of [
  'firstPageBtn','prevPageBtn','nextPageBtn','lastPageBtn',
  'firstPrintSideBtn','prevPrintSideBtn','nextPrintSideBtn','lastPrintSideBtn',
  'first3DSideBtn','prev3DSideBtn','next3DSideBtn','last3DSideBtn',
  'bookletFirstSpread','bookletPrevSpread','bookletNextSpread','bookletLastSpread',
  'resultDetailSummary'
]) assert.ok(ids.includes(id), `ID ${id} harus tersedia`);

assert.match(css, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/, 'Workbench/settings harus memakai grid 12 kolom');
assert.match(css, /grid-column:1\/-1/, 'Pengaturan cetak harus membentang penuh');
assert.match(css, /grid-column:1\/span 6/, 'Pratinjau harus memakai setengah area desktop');
assert.match(css, /grid-column:7\/-1/, 'Hasil analisis harus memakai setengah area desktop');
assert.match(app, /virtualBlank/, 'Navigasi hasil cetak harus mencakup sisi belakang kosong pada job duplex');
assert.match(app, /prime3DCurrentSheet/, '3D harus menyiapkan tekstur lembar secara otomatis');
assert.match(live3d, /bookletMode = 'book'/, 'Booklet 3D harus dapat dibuka pada mode buku');
assert.match(live3d, /firstSpreadBtn/, 'Booklet harus punya navigasi ke awal');
assert.match(live3d, /lastSpreadBtn/, 'Booklet harus punya navigasi ke akhir');
assert.match(pricing.app_version, /^(?:2\.9\.[12]|2\.10\.0|2\.11\.0)$/);

console.log('v2.7.0-ui-regression: OK');
