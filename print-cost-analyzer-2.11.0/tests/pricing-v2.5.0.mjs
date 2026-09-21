import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildPrintJob } from '../assets/js/print-job.js';
import { getPricingSelection } from '../assets/js/pricing-engine.js';

const config = JSON.parse(fs.readFileSync(new URL('../data/pricing-config.json', import.meta.url), 'utf8'));
const pricing = getPricingSelection(config, 'hvs-white-70-80', 'A4', 'store');

function analysis(types) {
  return { pages: types.map((type, index) => ({ page: index + 1, type, confidence: 99 })) };
}

function price(types, duplex = false) {
  return buildPrintJob(types.length, {
    duplex,
    pagesPerSide: 1,
    copies: 1,
    colorMode: 'auto',
  }, analysis(types), pricing, {}).totalCost;
}

assert.equal(price(Array(18).fill('H')), 5400);
assert.equal(price(Array(249).fill('H')), 74700);
assert.equal(price(Array(250).fill('H')), 74950);
assert.equal(price(Array(50).fill('HW')), 24900);
assert.equal(price(Array(25).fill('W')), 24800);

assert.equal(price(['H', 'H'], true), 400);
assert.equal(price(['H', 'HW'], true), 600);
assert.equal(price(['HW', 'HW'], true), 800);
assert.equal(price(['H', 'W'], true), 1000);
assert.equal(price(['HW', 'W'], true), 1200);
assert.equal(price(['W', 'W'], true), 1500);
assert.equal(price(['D', 'D'], true), 2500);
assert.equal(price(Array(250).fill('H'), true), 50000);

const duplexJob = buildPrintJob(300, { duplex: true, pagesPerSide: 1, copies: 1, colorMode: 'auto' }, analysis(Array(300).fill('H')), pricing, {});
assert.equal(duplexJob.volumeActive, false);
assert.equal(duplexJob.volumeSheetCount, 0);
assert.equal(duplexJob.volumeEligibility.H, false);

console.log('pricing-v2.5.0: OK');
