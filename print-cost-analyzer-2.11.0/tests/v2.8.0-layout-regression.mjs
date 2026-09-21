import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const pricing = JSON.parse(fs.readFileSync(new URL('../data/pricing-config.json', import.meta.url), 'utf8'));

assert.match(pricing.app_version, /^(?:2\.9\.[12]|2\.10\.0|2\.11\.0)$/);
assert.match(html, /class="setup-workspace"/);
assert.match(html, /id="settingsEmpty"/);
assert.match(html, /id="changeFileBtn"/);
assert.match(css, /grid-template-columns:minmax\(300px,4fr\) minmax\(680px,8fr\)/);
assert.match(css, /\.print-workbench\.analysis-workspace>\.preview-panel\{grid-column:1\/span 6\}/);
assert.match(css, /\.print-workbench\.analysis-workspace>\.result-panel\{grid-column:7\/-1\}/);
assert.doesNotMatch(html, /id="sourceTabs"/);
assert.doesNotMatch(html, /id="sourcePagesView"/);
assert.match(app, /changeFileBtn/);
assert.doesNotMatch(html, /Print Cost Analyzer 2\.7\.0/);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const dupes = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(dupes, [], 'HTML tidak boleh memiliki ID duplikat');

console.log('v2.8.0-layout-regression: OK');
