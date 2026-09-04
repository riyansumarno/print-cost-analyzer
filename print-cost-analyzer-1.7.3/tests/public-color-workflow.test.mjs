import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const match = html.match(/<select id="printColorMode">([\s\S]*?)<\/select>/);
assert.ok(match, 'printColorMode select must exist');
const options = [...match[1].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m => ({ value:m[1], label:m[2] }));
assert.deepEqual(options, [
  { value: 'auto', label: 'Sesuai warna dokumen' },
  { value: 'bw', label: 'Hitam-putih semua' },
]);
assert.ok(!html.includes('<option value="color">Semua warna</option>'));
assert.ok(!html.includes('<option value="front-back">'));
assert.ok(!html.includes('<option value="custom">Kustom per sisi</option>'));
assert.match(html, /id="printSideOverride"[^>]*>/, 'internal override element may remain for engine compatibility');
const overrideLabel = html.match(/<label class="side-override-control"[^>]*>/)?.[0] || '';
assert.match(overrideLabel, /hidden/, 'per-side override must be hidden from public UI');
console.log('public color workflow: 8 assertions passed');
