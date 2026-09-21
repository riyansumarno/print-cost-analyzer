import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = JSON.parse(fs.readFileSync(new URL('../data/pricing-config.json', import.meta.url)));
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

assert.match(config.app_version, /^(?:2\.9\.[12]|2\.10\.0|2\.11\.0)$/);
assert.equal(config.media_source_labels.customer, 'Bawa Sendiri');
const hvs = config.materials.find(m => m.id === 'hvs-white-70-80');
const a4 = hvs.sizes.find(s => s.id === 'A4');
assert.deepEqual(a4.customer_regular.simplex, { H: 200, HW: 300, W: 400, D: 800 });
assert.deepEqual(a4.customer_volume.simplex, { H: 150, HW: 250, W: 300, D: 800 });
assert.equal(a4.customer_regular.duplex_pairs['H+H'], 300);
assert.ok(a4.customer_regular.simplex.H < a4.regular.simplex.H);
assert.ok(a4.customer_regular.simplex.W < a4.regular.simplex.W);

for (const material of config.materials) {
  for (const size of material.sizes || []) {
    for (const cls of ['H','HW','W','D']) {
      assert.ok(Number.isFinite(size.customer_regular?.simplex?.[cls]), `${material.id}/${size.id}: missing Bawa Sendiri ${cls}`);
      assert.ok(size.customer_regular.simplex[cls] <= size.regular.simplex[cls], `${material.id}/${size.id}: Bawa Sendiri > store ${cls}`);
    }
  }
}

assert.match(html, /id="fileInput"[^>]*multiple/);
assert.match(html, /\.docx/);
assert.match(html, /\.jpg/);
assert.match(html, />Bawa Sendiri</);
assert.match(html, /(?:id="layoutMode"[^>]*hidden|hidden=""[^>]*id="layoutMode")/);
assert.doesNotMatch(html, /Dari pelanggan/i);
assert.match(app, /convertWordToPdf/);
assert.match(app, /convertImagesToPdf/);
assert.match(app, /setHandlingMode/);
assert.match(app, /x\.layoutMode === 'booklet' \? 'booklet'/);
assert.doesNotMatch(app, /validateAndLoadFile\(/);

console.log('v2.7.0-backcompat: OK');
