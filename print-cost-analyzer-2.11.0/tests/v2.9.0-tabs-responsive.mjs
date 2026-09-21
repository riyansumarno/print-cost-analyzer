import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const pricing = JSON.parse(fs.readFileSync(new URL('../data/pricing-config.json', import.meta.url), 'utf8'));
assert.match(pricing.app_version, /^(?:2\.9\.[12]|2\.10\.0|2\.11\.0)$/);
for (const tab of ['document','media','layout','print']) {
  assert.match(html, new RegExp(`data-settings-tab="${tab}"`));
  assert.match(html, new RegExp(`data-settings-panel="${tab}"`));
}
assert.match(js, /function setSettingsTab\(/);
assert.match(js, /function setupSettingsTabs\(/);
assert.match(js, /setSettingsTab\('layout'\)/);
assert.match(css, /overflow-wrap:anywhere/);
assert.match(css, /\.selected-file-actions\s*\{/);
assert.match(css, /\.settings-main-tabs\s*\{/);
assert.match(html, /Bawa Sendiri/);
assert.doesNotMatch(html, /settings-summary-item[^>]+data-settings-target/);
assert.match(html, /handling-mode-switch" role="group"/);
console.log('v2.9.0-tabs-responsive: OK');
