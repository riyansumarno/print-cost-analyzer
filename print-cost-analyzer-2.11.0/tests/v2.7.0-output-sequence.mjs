import assert from 'node:assert/strict';
import { buildPrintJob } from '../assets/js/print-job.js';

const pricing={
 regular:{simplex:{H:300,HW:500,W:1000,D:1500},duplex_pairs:{'H+H':400}},
 volume:{simplex:{H:250,HW:400,W:800,D:1500},duplex_pairs:{'H+H':400}},
 volumeThresholds:{H:250,HW:50,W:25,D:null}, volumeStrategy:'marginal_volume_by_color_class'
};
const analysis=n=>({pages:Array.from({length:n},(_,i)=>({page:i+1,type:'H'}))});

const simplex=buildPrintJob(5,{pagesPerSide:1,duplex:false},analysis(5),pricing);
assert.equal(simplex.sheets.length,5);
assert.deepEqual(simplex.sheets.flatMap(s=>s.front.pages.filter(Boolean)),[1,2,3,4,5]);

const duplex=buildPrintJob(5,{pagesPerSide:1,duplex:true},analysis(5),pricing);
assert.equal(duplex.sheets.length,3);
assert.deepEqual(duplex.sheets.flatMap(s=>[...(s.front?.pages||[]),...(s.back?.pages||[])].filter(Boolean)),[1,2,3,4,5]);
assert.equal(duplex.sheets.at(-1).back,null,'Sisi belakang kosong terakhir harus dapat divisualkan sebagai sisi virtual oleh UI');

const multiple=buildPrintJob(7,{pagesPerSide:2,duplex:true},analysis(7),pricing);
assert.equal(multiple.sheets.length,2);
assert.deepEqual(multiple.sheets.flatMap(s=>[...(s.front?.pages||[]),...(s.back?.pages||[])].filter(Boolean)),[1,2,3,4,5,6,7]);

const booklet=buildPrintJob(5,{layoutMode:'booklet',duplex:true},analysis(5),pricing);
assert.equal(booklet.addedBlankPages,3);
assert.equal(booklet.sheets.length,2);
const bookletPages=booklet.sheets.flatMap(s=>[...(s.front?.pages||[]),...(s.back?.pages||[])]).filter(Boolean).sort((a,b)=>a-b);
assert.deepEqual(bookletPages,[1,2,3,4,5]);

console.log('v2.7.0-output-sequence: OK');
