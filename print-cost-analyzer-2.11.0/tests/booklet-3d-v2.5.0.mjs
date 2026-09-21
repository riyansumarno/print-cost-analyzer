import assert from 'node:assert/strict';
import { getBookletSpreads, getBookletOuterPages } from '../assets/js/live-3d-preview.js';

const left = {
  selectedPages: [1,2,3,4,5,6,7,8],
  addedBlankPages: 0,
  settings: { layoutMode: 'booklet', bookletBinding: 'left' },
  sheets: [{ front: { pages: [8,1] }, back: { pages: [2,7] } }],
};
assert.deepEqual(getBookletSpreads(left), [
  [null,1], [2,3], [4,5], [6,7], [8,null],
]);
assert.deepEqual(getBookletOuterPages(left), { front: 1, back: 8 });

const right = {
  ...left,
  settings: { layoutMode: 'booklet', bookletBinding: 'right' },
  sheets: [{ front: { pages: [1,8] }, back: { pages: [7,2] } }],
};
assert.deepEqual(getBookletSpreads(right), [
  [1,null], [3,2], [5,4], [7,6], [null,8],
]);
assert.deepEqual(getBookletOuterPages(right), { front: 1, back: 8 });

const padded = {
  selectedPages: [1,2,3,4,5,6],
  addedBlankPages: 2,
  settings: { layoutMode: 'booklet', bookletBinding: 'left' },
  sheets: [{ front: { pages: [null,1] }, back: { pages: [2,null] } }],
};
const spreads = getBookletSpreads(padded);
assert.equal(spreads[0][1], 1);
assert.equal(spreads.flat().filter(Boolean).includes(1), true);
assert.equal(spreads.length, 5);
console.log('booklet-3d-v2.5.0: OK');
