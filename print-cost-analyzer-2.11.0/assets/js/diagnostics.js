/**
 * Diagnostics & confidence calibration layer — v1.3.1.
 *
 * PENTING: modul ini TIDAK mengubah type H/HW/W. Modul hanya mengkalibrasi
 * confidence dan menambahkan label mode/alasan yang lebih mudah diaudit.
 */

const n = value => {
    const x = Number(value);
    return Number.isFinite(x) ? x : 0;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function confidenceLevel(value) {
    if (value >= 90) return 'Tinggi';
    if (value >= 80) return 'Cukup tinggi';
    return 'Sedang';
}

function deriveAnalysisMode(page) {
    const rasterArea = n(page.raster_image_area);

    if (page.full_page_scan) {
        return { code: 'full-page-scan', label: 'Full-page Scan' };
    }

    if (page.native_black && rasterArea < 0.5) {
        return { code: 'native-bw', label: 'Native BW' };
    }

    if (rasterArea >= 0.5 && n(page.text_items) > 0) {
        return { code: 'mixed-raster', label: 'Teks + Raster' };
    }

    if (rasterArea >= 0.5) {
        return { code: 'raster', label: 'Raster/Gambar' };
    }

    if (page.structure_available) {
        return { code: 'native-vector', label: 'Native/Vektor' };
    }

    return { code: 'pixel-fallback', label: 'Pixel Fallback' };
}

function calibrateH(page) {
    const c = n(page.color_coverage);
    const s = n(page.strong_color_coverage);
    const ratio = n(page.color_ink_ratio);
    const fringe = n(page.fringe_rejected);
    const raw = n(page.raw_color_coverage);
    const p95 = n(page.p95_chroma);

    if (page.full_page_scan) {
        if (page.scan_residual_suppressed) {
            const edge = Math.max(c / 2.15, s / 1.35, p95 / 58);
            return Math.round(clamp(98 - (Math.min(edge, 1.25) * 16), 78, 98));
        }
        return Math.round(clamp(n(page.confidence) || 80, 74, 92));
    }

    if (page.native_black) {
        const chromaticPaint = n(page.vector_paint_ops);
        const unknownPaint = n(page.unknown_paint_ops);
        const fringeShare = fringe / Math.max(raw, c + fringe, 0.01);
        const evidence = 94 + Math.min(4, fringeShare * 5) - (chromaticPaint * 6) - (unknownPaint * 3);
        return Math.round(clamp(evidence, 90, 99));
    }

    const fringeDominance = fringe / Math.max(c + fringe, 0.01);
    if (fringe >= 0.4 && fringeDominance >= 0.55 && s < 0.25) {
        return Math.round(clamp(88 + (fringeDominance * 10), 86, 98));
    }

    const edge = Math.max(c / 0.35, s / 0.12, ratio / 2.0);
    return Math.round(clamp(97 - (Math.min(edge, 1.4) * 16), 74, 97));
}

function calibrateHW(page) {
    const c = n(page.color_coverage);
    const s = n(page.strong_color_coverage);
    const ratio = n(page.color_ink_ratio);
    const raster = n(page.raster_image_area);
    const score = n(page.adaptive_score);
    const threshold = n(page.adaptive_threshold) || 0.65;

    // Seberapa jelas bukti bahwa halaman memang memiliki warna nyata.
    const colorEvidence = clamp(Math.max(c / 1.0, s / 0.5, ratio / 15), 0, 1);

    // Seberapa dekat halaman dengan karakter W. Nilai besar menurunkan confidence HW
    // karena halaman lebih borderline terhadap penuh warna.
    const wPressure = clamp(Math.max(
        c / 14,
        raster / 18,
        score / Math.max(threshold, 0.01)
    ), 0, 1);

    let confidence = 80 + (colorEvidence * 9) + ((1 - wPressure) * 6);

    // Raster kecil/menengah dengan warna kuat merupakan pola HW yang sangat jelas.
    if (raster > 0.5 && raster < 15 && ratio >= 20) confidence += 2;

    // Halaman adaptif yang sangat dekat threshold memang lebih ambigu.
    if (Math.abs(score - threshold) < 0.06 && score > 0) confidence -= 5;

    return Math.round(clamp(confidence, 78, 95));
}

function calibrateW(page) {
    const c = n(page.color_coverage);
    const s = n(page.strong_color_coverage);
    const ratio = n(page.color_ink_ratio);
    const raster = n(page.raster_image_area);
    const score = n(page.adaptive_score);
    const threshold = n(page.adaptive_threshold) || 0.65;

    if (page.analysis_source === 'coherent-raster-footprint' || page.analysis_source === 'coherent-raster-montage') {
        const areaStrength = clamp((raster - 18) / 18, 0, 1);
        const colorStrength = clamp(Math.max(c / 14, ratio / 45, s / 4), 0, 1);
        return Math.round(clamp(86 + (areaStrength * 7) + (colorStrength * 5), 84, 98));
    }

    if (page.adaptive_changed) {
        const margin = Math.max(0, score - threshold);
        return Math.round(clamp(82 + (Math.min(margin / 0.20, 1) * 12), 80, 95));
    }

    const strength = clamp(Math.max(c / 18, s / 5, ratio / 55), 0, 1.4);
    return Math.round(clamp(86 + ((strength - 0.7) * 12), 82, 99));
}

function deriveDiagnosticReason(page, mode) {
    const c = n(page.color_coverage);
    const raster = n(page.raster_image_area);

    if (page.type === 'H') {
        if (page.full_page_scan && page.scan_residual_suppressed) {
            return 'Residual warna scan dinilai sebagai cast/noise; halaman efektif hitam-putih.';
        }
        if (page.native_black) {
            return 'Struktur PDF akromatik; RGB pada render terutama berasal dari fringe/anti-aliasing.';
        }
        if (n(page.fringe_rejected) >= Math.max(0.5, c * 1.5)) {
            return 'Kandidat RGB didominasi fringe/noise; warna bermakna tidak cukup untuk HW.';
        }
        return 'Warna bermakna berada di bawah batas H setelah koreksi noise dan cast.';
    }

    if (page.type === 'HW') {
        if (raster > 0.5) {
            return 'Ada gambar/objek berwarna, tetapi luas dan dominasi visual belum cukup untuk W.';
        }
        return 'Warna nyata terdeteksi, tetapi belum mendominasi area isi halaman.';
    }

    if (page.analysis_source === 'coherent-raster-footprint') {
        return 'Foto/gambar berwarna menempati bagian substansial halaman sehingga dikategorikan W.';
    }
    if (page.analysis_source === 'coherent-raster-montage') {
        return 'Beberapa gambar berwarna membentuk montase yang cukup dominan untuk W.';
    }
    if (page.adaptive_changed) {
        return 'Dominasi warna melewati ambang adaptif dokumen dan dinaikkan dari HW menjadi W.';
    }
    return 'Warna mendominasi area isi atau sebaran halaman secara nyata.';
}

export function calibratePageDiagnostics(page) {
    const originalType = page.type;
    const mode = deriveAnalysisMode(page);

    let confidence;
    if (originalType === 'H') confidence = calibrateH(page);
    else if (originalType === 'W') confidence = calibrateW(page);
    else confidence = calibrateHW(page);

    return {
        ...page,
        // Invariant: type tidak pernah diubah oleh diagnostics layer.
        type: originalType,
        confidence,
        confidence_level: confidenceLevel(confidence),
        analysis_mode: mode.label,
        analysis_mode_code: mode.code,
        diagnostic_reason: deriveDiagnosticReason(page, mode),
    };
}

export function calibrateDocumentDiagnostics(pages, profile = {}) {
    const calibrated = pages.map(calibratePageDiagnostics);
    const scanCount = calibrated.filter(page => page.full_page_scan).length;
    const rasterCount = calibrated.filter(page => n(page.raster_image_area) >= 0.5 && !page.full_page_scan).length;
    const nativeCount = calibrated.length - scanCount - rasterCount;
    const total = Math.max(calibrated.length, 1);

    let documentMode = 'Native/Mixed PDF';
    if (scanCount / total >= 0.80) documentMode = 'Mayoritas Full-page Scan';
    else if (scanCount > 0) documentMode = 'Campuran Native + Scan';
    else if (rasterCount / total >= 0.35) documentMode = 'Native + Banyak Raster';

    return {
        pages: calibrated,
        profile: {
            ...profile,
            documentMode,
            nativePageCount: nativeCount,
            rasterPageCount: rasterCount,
            diagnosticsVersion: '1.3.1',
        },
    };
}
