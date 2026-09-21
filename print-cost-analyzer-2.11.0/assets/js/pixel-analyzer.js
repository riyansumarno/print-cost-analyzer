export const DEFAULT_ANALYSIS_CONFIG = Object.freeze({
    // Ukuran maksimum canvas analisis. PDF tetap dirender lebih besar lalu dikecilkan.
    analysisMaxDimension: 1000,

    // Pada full-page scan, warna di tepi kertas sering berasal dari scanner/
    // kompresi, bukan konten yang relevan untuk tarif cetak. Nilai 0 berarti
    // tidak ada border suppression.
    ignoreBorderRatio: 0,

    // Koreksi cast scan hanya dilakukan jika background cukup putih/netral.
    backgroundMinLuma: 220,
    backgroundMaxChroma: 10,
    minBackgroundSampleRatio: 0.05,
    maxWhiteBalanceGain: 0.06,

    // Ambang piksel warna setelah white-balance.
    colorChroma: 18,
    darkColorChroma: 26,
    strongColorChroma: 32,
    minColorSaturation: 0.06,
    minStrongSaturation: 0.15,

    // Filter spasial untuk membedakan warna nyata dari RGB fringe/subpixel AA.
    localColorRadius: 2,
    localColorChroma: 10,
    localDarkColorChroma: 14,
    localStrongColorChroma: 32,
    localMinColorSaturation: 0.025,
    localMinStrongSaturation: 0.12,

    // Threshold klasifikasi halaman.
    blackMaxColorCoverage: 0.35,
    blackMaxStrongCoverage: 0.12,
    blackMaxColorInkRatio: 2.0,
    fullMinColorCoverage: 18.0,
    fullMinStrongCoverage: 5.0,
    fullAltColorCoverage: 10.0,
    fullAltColorInkRatio: 55.0,
    fullAltInkCoverage: 18.0,
    fullAltStrongCoverage: 10.0,
    fullBlockCoverage: 42.0,
    fullBlockMinColorCoverage: 8.0,
    fullBlockMinColorInkRatio: 35.0,
    fullBlockMinStrongCoverage: 3.0,

    // Halaman foto besar dengan margin putih. Rasio terhadap seluruh halaman bisa
    // berada di bawah fullMinColorCoverage, tetapi area isi tetap padat dan tersebar.
    fullPhotoMinColorCoverage: 14.0,
    fullPhotoMinStrongCoverage: 2.5,
    fullPhotoMinInkCoverage: 30.0,
    fullPhotoMinColorInkRatio: 40.0,
    fullPhotoMinBlockCoverage: 30.0,
});

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
    const p = 10 ** digits;
    return Math.round(value * p) / p;
}

function luminance(r, g, b) {
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function percentileFromHistogram(hist, total, percentile) {
    if (!total) return 0;
    const target = total * percentile;
    let running = 0;
    for (let i = 0; i < hist.length; i++) {
        running += hist[i];
        if (running >= target) return i;
    }
    return hist.length - 1;
}

function buildConfidence(type, metrics, cfg) {
    const c = metrics.colorCoverage;
    const s = metrics.strongColorCoverage;
    const ratio = metrics.colorInkRatio;

    if (type === 'H') {
        const edge = Math.max(
            c / Math.max(cfg.blackMaxColorCoverage, 0.01),
            s / Math.max(cfg.blackMaxStrongCoverage, 0.01),
            ratio / Math.max(cfg.blackMaxColorInkRatio, 0.01)
        );
        return Math.round(clamp(98 - (edge * 22), 70, 99));
    }

    if (type === 'W') {
        const photoStrength = Math.min(
            c / cfg.fullPhotoMinColorCoverage,
            s / cfg.fullPhotoMinStrongCoverage,
            metrics.inkCoverage / cfg.fullPhotoMinInkCoverage,
            ratio / cfg.fullPhotoMinColorInkRatio,
            metrics.activeColorBlockCoverage / cfg.fullPhotoMinBlockCoverage
        );
        const strength = Math.max(
            c / cfg.fullMinColorCoverage,
            ratio / cfg.fullAltColorInkRatio,
            metrics.activeColorBlockCoverage / cfg.fullBlockCoverage,
            photoStrength
        );
        return Math.round(clamp(78 + ((strength - 1) * 18), 72, 99));
    }

    // Half color paling rentan berada dekat boundary hitam/full.
    const fromBlack = Math.max(
        c / Math.max(cfg.blackMaxColorCoverage, 0.01),
        ratio / Math.max(cfg.blackMaxColorInkRatio, 0.01)
    );
    const toFull = Math.max(
        c / cfg.fullMinColorCoverage,
        ratio / cfg.fullAltColorInkRatio
    );
    const center = Math.min(fromBlack / 3, 1) * Math.max(0, 1 - toFull);
    return Math.round(clamp(76 + (center * 16), 68, 94));
}

export function classifyMetrics(metrics, config = {}) {
    const cfg = { ...DEFAULT_ANALYSIS_CONFIG, ...config };

    const fringeDominated = (
        (metrics.rawColorCoverage || 0) >= 0.5
        && (metrics.fringeRejectedCoverage || 0) >= Math.max(0.5, metrics.colorCoverage * 1.5)
        && metrics.strongColorCoverage < 0.08
        && (metrics.activeStrongBlockCoverage || 0) < 1.0
    );

    const isBlack = (
        metrics.colorCoverage < cfg.blackMaxColorCoverage
        && metrics.strongColorCoverage < cfg.blackMaxStrongCoverage
    ) || (
        metrics.colorCoverage < (cfg.blackMaxColorCoverage * 2)
        && metrics.colorInkRatio < cfg.blackMaxColorInkRatio
        && metrics.activeColorBlockCoverage < 5
    ) || fringeDominated;

    if (isBlack) {
        return {
            type: 'H',
            reason: 'Warna bermakna berada di bawah ambang noise/scan.',
            confidence: buildConfidence('H', metrics, cfg),
        };
    }

    const isFull = (
        (
            metrics.colorCoverage >= cfg.fullMinColorCoverage
            && metrics.strongColorCoverage >= cfg.fullMinStrongCoverage
        )
        || (
            metrics.colorCoverage >= cfg.fullAltColorCoverage
            && metrics.strongColorCoverage >= cfg.fullAltStrongCoverage
            && metrics.colorInkRatio >= cfg.fullAltColorInkRatio
            && metrics.inkCoverage >= cfg.fullAltInkCoverage
        )
        || (
            metrics.activeColorBlockCoverage >= cfg.fullBlockCoverage
            && metrics.colorCoverage >= cfg.fullBlockMinColorCoverage
            && metrics.colorInkRatio >= cfg.fullBlockMinColorInkRatio
            && metrics.strongColorCoverage >= cfg.fullBlockMinStrongCoverage
        )
        || (
            // Photo-dominance rule: cocok untuk satu/dua foto besar yang dikelilingi
            // margin putih. Coverage halaman bisa <18%, tetapi warna menyusun area
            // isi yang padat, cukup kuat, dan tersebar luas.
            metrics.colorCoverage >= cfg.fullPhotoMinColorCoverage
            && metrics.strongColorCoverage >= cfg.fullPhotoMinStrongCoverage
            && metrics.inkCoverage >= cfg.fullPhotoMinInkCoverage
            && metrics.colorInkRatio >= cfg.fullPhotoMinColorInkRatio
            && metrics.activeColorBlockCoverage >= cfg.fullPhotoMinBlockCoverage
        )
    );

    if (isFull) {
        return {
            type: 'W',
            reason: 'Warna mendominasi area isi atau membentuk area foto/warna yang luas dan padat.',
            confidence: buildConfidence('W', metrics, cfg),
        };
    }

    return {
        type: 'HW',
        reason: 'Warna nyata terdeteksi, tetapi belum mendominasi halaman.',
        confidence: buildConfidence('HW', metrics, cfg),
    };
}

/**
 * Menganalisis ImageData hasil render halaman PDF.
 * Angka yang dikembalikan adalah coverage piksel, bukan estimasi volume tinta/toner fisik.
 */
export function analyzeImageData(imageData, width, height, config = {}) {
    const cfg = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
    const data = imageData.data ?? imageData;
    const totalPixels = width * height;

    if (!data || data.length < totalPixels * 4 || totalPixels <= 0) {
        throw new Error('ImageData tidak valid.');
    }

    // ------------------------------------------------------------
    // PASS 1: estimasi warna background putih untuk koreksi cast scan.
    // ------------------------------------------------------------
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    let bgCount = 0;
    let opaqueCount = 0;

    for (let p = 0; p < totalPixels; p++) {
        const i = p * 4;
        const a = data[i + 3];
        if (a < 128) continue;

        opaqueCount++;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        const luma = luminance(r, g, b);

        if (luma >= cfg.backgroundMinLuma && chroma <= cfg.backgroundMaxChroma) {
            bgR += r;
            bgG += g;
            bgB += b;
            bgCount++;
        }
    }

    let gainR = 1;
    let gainG = 1;
    let gainB = 1;
    let whiteBalanceApplied = false;

    if (bgCount >= Math.max(50, opaqueCount * cfg.minBackgroundSampleRatio)) {
        bgR /= bgCount;
        bgG /= bgCount;
        bgB /= bgCount;
        const target = (bgR + bgG + bgB) / 3;
        const minGain = 1 - cfg.maxWhiteBalanceGain;
        const maxGain = 1 + cfg.maxWhiteBalanceGain;

        gainR = clamp(target / Math.max(bgR, 1), minGain, maxGain);
        gainG = clamp(target / Math.max(bgG, 1), minGain, maxGain);
        gainB = clamp(target / Math.max(bgB, 1), minGain, maxGain);

        whiteBalanceApplied = (
            Math.abs(gainR - 1) > 0.002
            || Math.abs(gainG - 1) > 0.002
            || Math.abs(gainB - 1) > 0.002
        );
    }

    // Grid mendeteksi apakah warna benar-benar membentuk area, bukan noise acak.
    const gridCols = 24;
    const gridRows = clamp(Math.round(gridCols * (height / Math.max(width, 1))), 16, 36);
    const blockTotal = new Uint32Array(gridCols * gridRows);
    const blockColor = new Uint32Array(gridCols * gridRows);
    const blockStrong = new Uint32Array(gridCols * gridRows);

    const chromaHistogram = new Uint32Array(256);
    const correctedBackgroundLuma = bgCount
        ? luminance(bgR * gainR, bgG * gainG, bgB * gainB)
        : 255;
    const inkLumaThreshold = clamp(correctedBackgroundLuma - 10, 225, 246);

    let inkPixels = 0;
    let colorPixels = 0;
    let strongColorPixels = 0;
    let rawColorPixels = 0;
    let rawStrongColorPixels = 0;
    let weightedColor = 0;
    let inkChromaSum = 0;

    // Kandidat warna mentah. Keputusan final baru dibuat setelah uji koherensi
    // spasial 3x3. RGB fringe dari subpixel antialiasing biasanya tipis dan
    // arah chroma-nya berubah di sekitar glyph, sehingga rata-rata lokalnya
    // kembali mendekati netral. Warna nyata tetap memiliki chroma lokal.
    const rawColorMask = new Uint8Array(totalPixels);

    const borderRatio = clamp(Number(cfg.ignoreBorderRatio || 0), 0, 0.12);
    const ignoreX = Math.floor(width * borderRatio);
    const ignoreY = Math.floor(height * borderRatio);

    // ------------------------------------------------------------
    // PASS 2: hitung isi + kandidat warna mentah setelah white-balance.
    // ------------------------------------------------------------
    for (let y = 0; y < height; y++) {
        const gy = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));

        for (let x = 0; x < width; x++) {
            const p = (y * width) + x;
            const i = p * 4;
            const a = data[i + 3];
            if (a < 128) continue;

            const r = clamp(data[i] * gainR, 0, 255);
            const g = clamp(data[i + 1] * gainG, 0, 255);
            const b = clamp(data[i + 2] * gainB, 0, 255);

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const chroma = max - min;
            const sat = max > 0 ? chroma / max : 0;
            const luma = luminance(r, g, b);

            const gx = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
            const block = (gy * gridCols) + gx;
            blockTotal[block]++;

            const inIgnoredBorder = borderRatio > 0 && (
                x < ignoreX || x >= (width - ignoreX)
                || y < ignoreY || y >= (height - ignoreY)
            );

            const isInk = luma < inkLumaThreshold || chroma >= 16;
            if (!isInk) continue;

            inkPixels++;
            inkChromaSum += chroma;
            chromaHistogram[Math.min(255, Math.round(chroma))]++;

            const chromaThreshold = luma < 85 ? cfg.darkColorChroma : cfg.colorChroma;
            const isRawColor = !inIgnoredBorder && chroma >= chromaThreshold && sat >= cfg.minColorSaturation;
            const isRawStrong = chroma >= cfg.strongColorChroma && sat >= cfg.minStrongSaturation;

            if (isRawColor) {
                rawColorMask[p] = 1;
                rawColorPixels++;
            }
            if (isRawStrong) rawStrongColorPixels++;
        }
    }

    function localAverageRgb(cx, cy) {
        const radius = Math.max(1, Math.min(2, Math.round(cfg.localColorRadius || 1)));
        let sr = 0, sg = 0, sb = 0, count = 0;
        const y0 = Math.max(0, cy - radius);
        const y1 = Math.min(height - 1, cy + radius);
        const x0 = Math.max(0, cx - radius);
        const x1 = Math.min(width - 1, cx + radius);

        for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
                const idx = ((yy * width) + xx) * 4;
                if (data[idx + 3] < 128) continue;
                sr += clamp(data[idx] * gainR, 0, 255);
                sg += clamp(data[idx + 1] * gainG, 0, 255);
                sb += clamp(data[idx + 2] * gainB, 0, 255);
                count++;
            }
        }
        if (!count) return [255, 255, 255];
        return [sr / count, sg / count, sb / count];
    }

    // ------------------------------------------------------------
    // PASS 3: hanya kandidat warna mentah yang diuji koherensinya.
    // Ini jauh lebih murah daripada blur seluruh halaman.
    // ------------------------------------------------------------
    for (let p = 0; p < totalPixels; p++) {
        if (!rawColorMask[p]) continue;
        const y = Math.floor(p / width);
        const x = p - (y * width);
        const [r, g, b] = localAverageRgb(x, y);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        const sat = max > 0 ? chroma / max : 0;
        const luma = luminance(r, g, b);

        const localThreshold = luma < 100 ? cfg.localDarkColorChroma : cfg.localColorChroma;
        const coherent = chroma >= localThreshold && sat >= cfg.localMinColorSaturation;
        if (!coherent) continue;

        const gx = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
        const gy = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));
        const block = (gy * gridCols) + gx;

        colorPixels++;
        blockColor[block]++;

        const strong = chroma >= cfg.localStrongColorChroma && sat >= cfg.localMinStrongSaturation;
        if (strong) {
            strongColorPixels++;
            blockStrong[block]++;
        }

        const chromaWeight = clamp((chroma - localThreshold) / 55, 0, 1);
        const satWeight = clamp((sat - cfg.localMinColorSaturation) / 0.35, 0, 1);
        weightedColor += Math.max(0.10, chromaWeight * satWeight);
    }

    const denominator = Math.max(opaqueCount, 1);
    const inkDenominator = Math.max(inkPixels, 1);

    let activeColorBlocks = 0;
    let activeStrongBlocks = 0;
    let validBlocks = 0;

    for (let i = 0; i < blockTotal.length; i++) {
        const n = blockTotal[i];
        if (!n) continue;
        validBlocks++;

        const colorRatio = blockColor[i] / n;
        const strongRatio = blockStrong[i] / n;

        if (colorRatio >= 0.03 || (colorRatio >= 0.015 && strongRatio >= 0.005)) {
            activeColorBlocks++;
        }
        if (strongRatio >= 0.02) {
            activeStrongBlocks++;
        }
    }

    const metrics = {
        inkCoverage: round((inkPixels / denominator) * 100, 2),
        colorCoverage: round((colorPixels / denominator) * 100, 2),
        strongColorCoverage: round((strongColorPixels / denominator) * 100, 2),
        rawColorCoverage: round((rawColorPixels / denominator) * 100, 2),
        rawStrongColorCoverage: round((rawStrongColorPixels / denominator) * 100, 2),
        fringeRejectedCoverage: round(((rawColorPixels - colorPixels) / denominator) * 100, 2),
        colorInkRatio: round((colorPixels / inkDenominator) * 100, 2),
        activeColorBlockCoverage: round((activeColorBlocks / Math.max(validBlocks, 1)) * 100, 2),
        activeStrongBlockCoverage: round((activeStrongBlocks / Math.max(validBlocks, 1)) * 100, 2),
        weightedColorCoverage: round((weightedColor / denominator) * 100, 2),
        avgInkChroma: round(inkChromaSum / inkDenominator, 2),
        p95InkChroma: percentileFromHistogram(chromaHistogram, inkPixels, 0.95),
        whiteBalanceApplied,
        backgroundRgb: bgCount ? [round(bgR, 1), round(bgG, 1), round(bgB, 1)] : null,
        inkLumaThreshold: round(inkLumaThreshold, 1),
        whiteBalanceGain: [round(gainR, 4), round(gainG, 4), round(gainB, 4)],
        analyzedPixels: opaqueCount,
    };

    return {
        ...metrics,
        ...classifyMetrics(metrics, cfg),
    };
}
