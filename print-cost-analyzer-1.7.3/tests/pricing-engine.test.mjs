import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPricingSelection } from '../assets/js/pricing-engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, '../data/pricing-config.json'), 'utf8'));

function selection(tier, material='hvs-white-70', size='A4', source='store') {
  const c = structuredClone(config);
  c.active_tier = tier;
  return getPricingSelection(c, material, size, source);
}

const floor = selection('floor');
const competitive = selection('competitive');
const normal = selection('normal');
assert.equal(floor.prices.H, 250);
assert.equal(competitive.prices.H, 300);
assert.equal(normal.prices.H, 350);
assert.equal(floor.prices.HW, 350);
assert.equal(competitive.prices.HW, 400);
assert.equal(normal.prices.HW, 500);
assert.equal(floor.prices.W, 400);
assert.equal(competitive.prices.W, 450);
assert.equal(normal.prices.W, 600);

for (const material of config.materials) {
  for (const size of material.sizes || []) {
    const t = size.tariffs;
    for (const key of ['H','HW','W']) {
      assert.ok(t.floor[key] <= t.competitive[key], `${material.id}/${size.id}/${key}: floor > competitive`);
      assert.ok(t.competitive[key] <= t.normal[key], `${material.id}/${size.id}/${key}: competitive > normal`);
    }
  }
}


const ownFloor = selection('floor', 'hvs-white-70', 'A4', 'customer');
const ownCompetitive = selection('competitive', 'hvs-white-70', 'A4', 'customer');
const ownNormal = selection('normal', 'hvs-white-70', 'A4', 'customer');
assert.deepEqual([ownFloor.prices.H, ownFloor.prices.HW, ownFloor.prices.W], [150,200,250]);
assert.deepEqual([ownCompetitive.prices.H, ownCompetitive.prices.HW, ownCompetitive.prices.W], [150,250,300]);
assert.deepEqual([ownNormal.prices.H, ownNormal.prices.HW, ownNormal.prices.W], [200,300,400]);
assert.equal(ownNormal.prices.duplexCredit, 0);
assert.equal(ownNormal.mediaSource, 'customer');

const ownPhoto = selection('normal', 'photo-230-glossy', 'A4', 'customer');
assert.deepEqual([ownPhoto.prices.H, ownPhoto.prices.HW, ownPhoto.prices.W], [450,1150,2250]);
const ownPhotoA3 = selection('normal', 'photo-230-glossy', 'A3', 'customer');
assert.deepEqual([ownPhotoA3.prices.H, ownPhotoA3.prices.HW, ownPhotoA3.prices.W], [850,2200,4500]);

for (const [profileId, profile] of Object.entries(config.customer_supplied_tariffs || {})) {
  for (const [sizeGroup, data] of Object.entries(profile.sizes || {})) {
    for (const key of ['H','HW','W']) {
      assert.ok(data.floor[key] <= data.competitive[key], `${profileId}/${sizeGroup}/${key}: own floor > competitive`);
      assert.ok(data.competitive[key] <= data.normal[key], `${profileId}/${sizeGroup}/${key}: own competitive > normal`);
    }
    assert.equal(data.floor.duplex_credit, 0);
    assert.equal(data.competitive.duplex_credit, 0);
    assert.equal(data.normal.duplex_credit, 0);
  }
}

console.log('pricing-engine: OK');
