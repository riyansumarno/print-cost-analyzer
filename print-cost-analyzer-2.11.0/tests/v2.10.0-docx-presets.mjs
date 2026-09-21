import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pricing = JSON.parse(fs.readFileSync(path.join(root, 'data/pricing-config.json'), 'utf8'));

assert.equal(pricing.app_version, '2.11.0');
assert.match(html, /Print Cost Analyzer 2\.11\.0/);
assert.match(app, /readDocxLayoutMetadata/);
assert.match(app, /lastRenderedPageBreak/);
assert.match(app, /savedPageCount/);
assert.match(app, /physicalHeightPx\s*=\s*Math\.max\(1, widthPx \* ratio\)/);
assert.doesNotMatch(app, /physicalHeightPx\s*=\s*Math\.max\(1, rect\.height/);
assert.match(app, /Pagination Word perlu diperiksa/);
assert.match(app, /PRESET_BASE_SETTINGS/);
assert.match(app, /elements\.mediaSource\.value = x\.mediaSource/);
assert.match(app, /elements\.pageRangeMode\.value = x\.pageRangeMode/);
assert.match(app, /elements\.sheetOrientation\.value = x\.orientation/);
assert.match(app, /elements\.printColorMode\.value = x\.colorMode === 'bw' \? 'bw' : 'auto'/);

const materials = new Map(pricing.materials.map(m => [m.id, new Set(m.sizes.map(s => s.id))]));
const required = new Set(['mediaSource','material','size','pageRangeMode','pageRange','pageSubset','pageOrder','copies','collate','layoutMode','pagesPerSide','nupOrder','scaleMode','customScale','orientation','bookletBinding','pageBorder','sideMode','flip','colorMode','frontColor','backColor']);
assert.ok(pricing.presets.length >= 15);
assert.ok(pricing.presets.some(p => p.settings.size === 'A3'));
assert.ok(pricing.presets.some(p => p.settings.size === 'A3+'));
assert.ok(pricing.presets.some(p => p.settings.layoutMode === 'booklet' && p.settings.size === 'A3'));
for (const preset of pricing.presets) {
  for (const key of required) assert.ok(Object.hasOwn(preset.settings, key), `${preset.id} missing ${key}`);
  assert.ok(materials.has(preset.settings.material), `${preset.id}: unknown material`);
  assert.ok(materials.get(preset.settings.material).has(preset.settings.size), `${preset.id}: unsupported size`);
}
console.log('v2.10.0-docx-presets: OK');
