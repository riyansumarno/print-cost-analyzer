import assert from 'node:assert/strict';
import { calibratePageDiagnostics, calibrateDocumentDiagnostics } from '../assets/js/diagnostics.js';

const cases = [
    {
        name: 'native black dengan fringe tinggi tetap H dan confidence tinggi',
        page: { type:'H', color_coverage:2.1, strong_color_coverage:0.02, color_ink_ratio:19, fringe_rejected:6.0, raw_color_coverage:8.1, native_black:true, raster_image_area:0, structure_available:true, vector_paint_ops:0, unknown_paint_ops:0 },
        minConfidence: 90,
        mode: 'Native BW',
    },
    {
        name: 'full-page scan suppressed tetap H',
        page: { type:'H', color_coverage:0.4, strong_color_coverage:0.1, p95_chroma:20, full_page_scan:true, scan_residual_suppressed:true, raster_image_area:98 },
        minConfidence: 85,
        mode: 'Full-page Scan',
    },
    {
        name: 'foto kecil tetap HW',
        page: { type:'HW', color_coverage:8.0, strong_color_coverage:3, color_ink_ratio:50, raster_image_area:11.5, text_items:50, adaptive_score:0.52, adaptive_threshold:0.72 },
        minConfidence: 82,
        mode: 'Teks + Raster',
    },
    {
        name: 'foto dominan tetap W',
        page: { type:'W', color_coverage:12, strong_color_coverage:5, color_ink_ratio:48, raster_image_area:25, text_items:10, adaptive_score:0.87, adaptive_threshold:0.70, analysis_source:'coherent-raster-footprint' },
        minConfidence: 86,
        mode: 'Teks + Raster',
    },
];

for (const item of cases) {
    const out = calibratePageDiagnostics(item.page);
    assert.equal(out.type, item.page.type, `${item.name}: type berubah`);
    assert.ok(out.confidence >= item.minConfidence, `${item.name}: confidence terlalu rendah (${out.confidence})`);
    assert.equal(out.analysis_mode, item.mode, `${item.name}: mode salah`);
    assert.ok(out.diagnostic_reason.length > 10, `${item.name}: alasan kosong`);
}

const input = cases.map((c, i) => ({ ...c.page, page:i+1 }));
const output = calibrateDocumentDiagnostics(input, { mode:'fixed-guarded' });
assert.deepEqual(output.pages.map(p => p.type), input.map(p => p.type), 'Diagnostics mengubah klasifikasi');
assert.equal(output.profile.diagnosticsVersion, '1.3.1');
assert.ok(output.profile.documentMode);

console.log('Diagnostics 1.3.1: 12 assertions passed');
