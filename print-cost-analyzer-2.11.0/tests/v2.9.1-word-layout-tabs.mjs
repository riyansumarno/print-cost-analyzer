import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const pricing = JSON.parse(fs.readFileSync(new URL('../data/pricing-config.json', import.meta.url), 'utf8'));

assert.match(pricing.app_version, /^(?:2\.9\.[12]|2\.10\.0|2\.11\.0)$/);
assert.match(html, /html2canvas@1\.4\.1/);
assert.match(app, /docx-(?:renderer@0\.1\.2|preview@0\.4\.0)\?bundle/);
assert.match(app, /ignoreLastRenderedPageBreak:\s*false/);
assert.match(app, /widthMm/);
assert.match(app, /heightMm/);
assert.match(app, /widthPx \* ratio/);
assert.match(app, /pdf\.addPage\(\[widthMm, heightMm\], orientation\)/);
assert.match(app, /DOC → PDF · mode kompatibilitas/);
assert.doesNotMatch(html, /id="sourceTabs"/);
assert.doesNotMatch(html, /id="sourcePagesView"/);
assert.doesNotMatch(html, /settings-summary-item[^>]+data-settings-target/);
assert.match(html, /class="handling-tabs handling-mode-switch" role="group"/);
assert.match(css, /word-conversion-surface\.docx-render/);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const dupes = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(dupes, [], 'HTML tidak boleh memiliki ID duplikat');
console.log('v2.9.1-word-layout-tabs: OK');
