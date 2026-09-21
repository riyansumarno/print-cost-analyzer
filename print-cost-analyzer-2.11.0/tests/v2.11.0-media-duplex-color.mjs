import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const job = fs.readFileSync(path.join(root, 'assets/js/print-job.js'), 'utf8');
const pricing = JSON.parse(fs.readFileSync(path.join(root, 'data/pricing-config.json'), 'utf8'));

assert.equal(pricing.app_version, '2.11.0');
assert.match(html, /Print Cost Analyzer 2\.11\.0/);

// Opsi warna global hanya dua.
const colorSelect = html.match(/<select id="printColorMode">([\s\S]*?)<\/select>/)?.[1] || '';
const colorOptions = [...colorSelect.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(colorOptions, ['auto', 'bw']);
assert.doesNotMatch(html, /Paksa full warna/);
assert.doesNotMatch(html, /id="frontColorMode"/);
assert.doesNotMatch(html, /id="backColorMode"/);
assert.match(job, /const ALLOWED_COLOR = new Set\(\['auto', 'bw'\]\)/);
assert.doesNotMatch(job, /mode === 'color'/);
for (const preset of pricing.presets) assert.ok(['auto','bw'].includes(preset.settings.colorMode), `${preset.id}: colorMode harus auto/bw`);

// Katalog ukuran lengkap tetap terpisah dari tarif: ukuran unsupported hanya untuk display dan disabled.
const groups = new Map(pricing.size_catalog.map(g => [g.group, g.items.map(x => x.id)]));
assert.deepEqual(groups.get('Seri A'), ['A7','A6','A5','A4','A3','A3+']);
assert.deepEqual(groups.get('Seri B'), ['B7','B6','B5','B4']);
assert.deepEqual(groups.get('Seri F / Folio'), ['F5','F4','Folio']);
assert.ok(groups.get('Ukuran khusus').includes('A4s'));
assert.match(app, /opt\.disabled = !isAvailable/);
assert.match(app, /tidak tersedia/);

// Duplex dan booklet mengikuti kompatibilitas media+ukuran.
assert.match(app, /function duplexSupported/);
assert.match(app, /Object\.values\(pairs\)\.some/);
assert.match(app, /option\.disabled = !allowed/);
assert.match(app, /bookletButton\.disabled = !allowed/);
assert.match(app, /Media atau ukuran ini hanya mendukung cetak 1 sisi/);

const ncr = pricing.materials.find(m => m.id === 'ncr');
const sticker = pricing.materials.find(m => m.id === 'sticker-glossy-120-145');
const hvs = pricing.materials.find(m => m.id === 'hvs-white-70-80');
assert.equal(ncr?.duplex, false);
assert.equal(sticker?.duplex, false);
assert.equal(hvs?.duplex, true);

console.log('v2.11.0-media-duplex-color: OK');
