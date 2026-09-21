/**
 * Full-page scan support.
 *
 * Full-page scan berbeda dari PDF native/mixed: satu image XObject dapat menutup
 * hampir seluruh halaman walaupun secara visual hanya berisi teks hitam. Karena itu,
 * raster footprint TIDAK boleh dipakai sebagai bukti dominasi warna pada mode ini.
 */

export const SCAN_PIXEL_CONFIG = Object.freeze({
    // Abaikan sekitar 3% tepi sebagai bukti warna. Ink tetap dihitung.
    ignoreBorderRatio: 0.03,

    // Background scan boleh mempunyai cast sedikit lebih besar daripada PDF native.
    // Threshold chroma inti tetap memakai coherent-color standar agar warna nyata
    // yang benar-benar kuat tidak hilang.
    backgroundMinLuma: 210,
    backgroundMaxChroma: 24,
    minBackgroundSampleRatio: 0.06,
    maxWhiteBalanceGain: 0.10,
});

const n = value => {
    const x = Number(value);
    return Number.isFinite(x) ? x : 0;
};

/**
 * Heuristik struktural. Sengaja ketat agar PDF native dengan satu logo besar tidak
 * dianggap scan. Text layer kosong + raster hampir satu halaman adalah sinyal utama.
 */
export function isLikelyFullPageScan(structure, textItems = 0) {
    if (!structure?.available || !structure.hasRasterImage) return false;

    const area = n(structure.rasterImageAreaCoverage);
    const rasterOps = n(structure.rasterImageOps);
    const visibleText = n(structure.visibleTextPaintOps);
    const vectorPaint = n(structure.vectorPathPaintOps);

    return (
        textItems === 0
        && visibleText === 0
        && area >= 85
        && rasterOps >= 1
        && vectorPaint <= 2
    );
}

/**
 * Extra guard setelah pixel analyzer. Tujuannya menahan residual scan yang masih
 * sedikit melewati threshold per-pixel, tanpa menyembunyikan warna kuat yang nyata.
 */
export function reconcileScanClassification(pixel) {
    if (!pixel) return pixel;

    const c = n(pixel.colorCoverage);
    const s = n(pixel.strongColorCoverage);
    const blocks = n(pixel.activeColorBlockCoverage);
    const strongBlocks = n(pixel.activeStrongBlockCoverage);
    const p95 = n(pixel.p95InkChroma);

    const lowSignificance = (
        c <= 2.15
        && s <= 1.35
        && blocks <= 8.5
        && strongBlocks <= 5.5
        && p95 <= 58
    );

    if (pixel.type !== 'W' && lowSignificance) {
        const edge = Math.max(c / 2.15, s / 1.35, blocks / 8.5, strongBlocks / 5.5);
        const confidence = Math.max(78, Math.min(98, Math.round(97 - edge * 14)));
        return {
            ...pixel,
            type: 'H',
            confidence,
            reason: 'Full-page scan: residual RGB/cast/warna tepi berada di bawah ambang warna visual yang bermakna.',
            scanResidualSuppressed: true,
        };
    }

    return {
        ...pixel,
        scanResidualSuppressed: false,
        reason: pixel.reason,
    };
}
