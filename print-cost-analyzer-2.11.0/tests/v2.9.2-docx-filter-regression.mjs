import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const pricing = JSON.parse(fs.readFileSync(new URL('../data/pricing-config.json', import.meta.url), 'utf8'));

assert.match(pricing.app_version, /^(?:2\.9\.2|2\.10\.0|2\.11\.0)$/);
assert.match(app, /docx-renderer@0\.1\.2\?bundle/);
assert.match(app, /docx-preview@0\.4\.0\?bundle/); // fallback only
assert.match(app, /renderResult\?\.pages/);
assert.match(app, /page\.scrollHeight/);
assert.match(app, /computeWordSlicePlan/);
assert.match(app, /fullHeightPx \/ info\.physicalHeightPx/);
assert.match(html, /data-filter="ALL"/);
assert.doesNotMatch(html, /data-page-filter=/);
assert.doesNotMatch(html, /class="filter-pills"/);
assert.doesNotMatch(app, /\.filter-pill/);
assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const dupes = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(dupes, []);
console.log('v2.9.2-docx-filter-regression: OK');
