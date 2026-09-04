import assert from 'node:assert/strict';
import {
  adaptDocumentClassification,
  computeFullColorScore,
  isEligibleForFullColor,
} from '../assets/js/adaptive-classifier.js';

const base = {
  type: 'HW', color_coverage: 0, strong_color_coverage: 0, ink_coverage: 0,
  color_ink_ratio: 0, active_color_blocks: 0, raster_images: 0,
  raster_image_area: 0, raster_color_density: 0, raster_strong_density: 0,
  confidence: 80, reason: 'base',
};

// Data nyata Hamdan dari hasil 1.1.1: harus tetap HW.
const hamdan21 = { ...base, page: 21, color_coverage: 5.72, strong_color_coverage: 3.4, ink_coverage: 12.02, color_ink_ratio: 47.53, active_color_blocks: 21.81, raster_images: 2, raster_image_area: 8.23, raster_color_density: 69.47, raster_strong_density: 41.29 };
const hamdan22 = { ...base, page: 22, color_coverage: 6.22, strong_color_coverage: 4.5, ink_coverage: 9.92, color_ink_ratio: 62.64, active_color_blocks: 18.75, raster_images: 2, raster_image_area: 6.55, raster_color_density: 94.96, raster_strong_density: 68.7 };
const hamdan23 = { ...base, page: 23, color_coverage: 4.83, strong_color_coverage: 2.5, ink_coverage: 11.79, color_ink_ratio: 40.95, active_color_blocks: 28.31, raster_images: 1, raster_image_area: 4.79, raster_color_density: 100, raster_strong_density: 52.15 };
const hamdan79 = { ...base, page: 79, color_coverage: 1.89, strong_color_coverage: 1.7, ink_coverage: 6.67, color_ink_ratio: 28.4, active_color_blocks: 5.02, raster_images: 2, raster_image_area: 6.43, raster_color_density: 29.38, raster_strong_density: 26.43 };

// Data nyata Hamdan: montage/foto dominan harus W.
const hamdan76 = { ...base, page: 76, type: 'W', color_coverage: 13.56, strong_color_coverage: 9.75, ink_coverage: 24.62, color_ink_ratio: 55.08, active_color_blocks: 27.57, raster_images: 3, raster_image_area: 26.91, raster_color_density: 50.39, raster_strong_density: 36.23 };
const hamdan77 = { ...base, page: 77, type: 'W', color_coverage: 4.45, strong_color_coverage: 2.39, ink_coverage: 20.1, color_ink_ratio: 22.14, active_color_blocks: 11.15, raster_images: 6, raster_image_area: 22.12, raster_color_density: 20.12, raster_strong_density: 10.81 };
const hamdan78 = { ...base, page: 78, type: 'W', color_coverage: 10.18, strong_color_coverage: 7.72, ink_coverage: 18.52, color_ink_ratio: 54.98, active_color_blocks: 19.36, raster_images: 6, raster_image_area: 20.24, raster_color_density: 50.29, raster_strong_density: 38.14 };
const hamdan90 = { ...base, page: 90, type: 'W', color_coverage: 9.47, strong_color_coverage: 5.04, ink_coverage: 20.57, color_ink_ratio: 46.05, active_color_blocks: 22.06, raster_images: 6, raster_image_area: 20.49, raster_color_density: 46.21, raster_strong_density: 24.59 };
const hamdan91 = { ...base, page: 91, type: 'W', color_coverage: 10.23, strong_color_coverage: 8.33, ink_coverage: 23.71, color_ink_ratio: 43.16, active_color_blocks: 20.22, raster_images: 5, raster_image_area: 24.61, raster_color_density: 41.58, raster_strong_density: 33.85 };

const tinyLogo = { ...base, page: 1, color_coverage: 3.8, strong_color_coverage: 3.0, ink_coverage: 6, color_ink_ratio: 63, active_color_blocks: 13, raster_images: 1, raster_image_area: 5.3, raster_color_density: 71, raster_strong_density: 55 };
const mapMedium = { ...base, page: 40, color_coverage: 9, strong_color_coverage: 5, ink_coverage: 18, color_ink_ratio: 50, active_color_blocks: 20, raster_images: 1, raster_image_area: 14.1, raster_color_density: 64, raster_strong_density: 35 };

assert.equal(isEligibleForFullColor(hamdan21), false);
assert.equal(isEligibleForFullColor(hamdan22), false);
assert.equal(isEligibleForFullColor(hamdan23), false);
assert.equal(isEligibleForFullColor(hamdan79), false);
assert.equal(isEligibleForFullColor(tinyLogo), false);
assert.equal(isEligibleForFullColor(mapMedium), false);

for (const page of [hamdan76, hamdan77, hamdan78, hamdan90, hamdan91]) {
  assert.equal(isEligibleForFullColor(page), true, `page ${page.page} eligible`);
  assert.ok(computeFullColorScore(page) >= 0.4, `page ${page.page} score`);
}

const doc = adaptDocumentClassification([
  tinyLogo, hamdan21, hamdan22, hamdan23, mapMedium,
  hamdan76, hamdan77, hamdan78, hamdan79, hamdan90, hamdan91,
]);

const byPage = new Map(doc.pages.map(p => [p.page, p.type]));
for (const p of [1,21,22,23,40,79]) assert.equal(byPage.get(p), 'HW', `page ${p}`);
for (const p of [76,77,78,90,91]) assert.equal(byPage.get(p), 'W', `page ${p}`);

// Layer adaptif tidak boleh mengubah H menjadi warna.
const black = { ...base, page: 3, type: 'H', color_coverage: 0.2, strong_color_coverage: 0, raster_images: 0 };
assert.equal(adaptDocumentClassification([black]).pages[0].type, 'H');

console.log('Adaptive classifier: 18 assertions passed');
