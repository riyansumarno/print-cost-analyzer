/**
 * Document-adaptive HW/W classifier.
 *
 * Prinsip:
 * - H tetap ditentukan oleh coherent-pixel analyzer agar noise scan tidak mudah naik kelas.
 * - HW/W dievaluasi ulang setelah seluruh halaman selesai dianalisis.
 * - Threshold adaptif hanya bekerja pada zona ambigu dan selalu dibatasi guardrail absolut.
 *   Dengan demikian, satu logo/foto kecil tidak menjadi W hanya karena dokumennya dominan hitam.
 */

export const DEFAULT_ADAPTIVE_CONFIG = Object.freeze({
    defaultFullThreshold: 0.60,
    minAdaptiveThreshold: 0.52,
    maxAdaptiveThreshold: 0.68,
    minimumGapForAdaptiveSplit: 0.11,
    minimumCandidatesForAdaptiveSplit: 4,

    // Guardrail: elemen warna kecil tetap HW.
    smallRasterAreaMax: 10.0,
    smallRasterColorCoverageMax: 8.0,

    // Batas minimum agar halaman raster boleh dipertimbangkan sebagai W.
    rasterEligibleArea: 12.0,
    rasterSingleImageArea: 18.0,
    rasterMontageMinImages: 3,
    rasterMontageArea: 14.0,
    rasterMinStrongCoverage: 1.2,
    rasterMinColorDensity: 15.0,

    // Batas minimum untuk halaman warna non-raster (grafik/vector/screenshot native).
    vectorMinColorCoverage: 8.0,
    vectorMinStrongCoverage: 2.0,
    vectorMinBlocks: 18.0,
    vectorMinColorInkRatio: 28.0,

    // W yang sangat jelas tidak boleh turun hanya karena profil dokumen lain.
    obviousWScore: 0.78,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 3) => {
    const p = 10 ** digits;
    return Math.round(value * p) / p;
};

function n(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function ramp(value, low, high) {
    if (high <= low) return value >= high ? 1 : 0;
    return clamp((n(value) - low) / (high - low), 0, 1);
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Score 0..1 yang merepresentasikan dominasi warna/visual sebuah halaman.
 * Ini bukan probabilitas dan bukan volume tinta.
 */
export function computeFullColorScore(page) {
    const rasterArea = n(page.raster_image_area);
    const rasterCount = n(page.raster_images);
    const color = n(page.color_coverage);
    const strong = n(page.strong_color_coverage);
    const blocks = n(page.active_color_blocks);
    const ink = n(page.ink_coverage);
    const ratio = n(page.color_ink_ratio);
    const rasterDensity = n(page.raster_color_density);
    const rasterStrong = n(page.raster_strong_density);

    // Full-page scan: footprint raster mendekati 100% karena halaman itu sendiri
    // adalah image. Menggunakan rasterArea di sini akan memberi score palsu tinggi.
    if (page.full_page_scan) {
        const score = (
            0.30 * ramp(color, 2, 15)
            + 0.22 * ramp(strong, 0.8, 8)
            + 0.20 * ramp(blocks, 6, 35)
            + 0.12 * ramp(ink, 10, 32)
            + 0.16 * ramp(ratio, 15, 60)
        );
        return round(clamp(score, 0, 1));
    }

    if (rasterCount > 0 || rasterArea > 0) {
        const score = (
            0.28 * ramp(rasterArea, 7, 25)
            + 0.09 * ramp(rasterCount, 1, 5)
            + 0.15 * ramp(color, 3, 15)
            + 0.10 * ramp(strong, 1, 8)
            + 0.11 * ramp(blocks, 8, 30)
            + 0.09 * ramp(ink, 8, 28)
            + 0.07 * ramp(ratio, 18, 58)
            + 0.07 * ramp(rasterDensity, 18, 60)
            + 0.04 * ramp(rasterStrong, 7, 35)
        );
        return round(clamp(score, 0, 1));
    }

    const score = (
        0.29 * ramp(color, 3, 18)
        + 0.18 * ramp(strong, 1, 10)
        + 0.21 * ramp(blocks, 8, 42)
        + 0.12 * ramp(ink, 8, 30)
        + 0.20 * ramp(ratio, 18, 60)
    );
    return round(clamp(score, 0, 1));
}

export function isEligibleForFullColor(page, config = {}) {
    const cfg = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    const rasterArea = n(page.raster_image_area);
    const rasterCount = n(page.raster_images);
    const color = n(page.color_coverage);
    const strong = n(page.strong_color_coverage);
    const blocks = n(page.active_color_blocks);
    const ratio = n(page.color_ink_ratio);
    const rasterDensity = n(page.raster_color_density);
    const rasterStrong = n(page.raster_strong_density);

    if (page.type === 'H') return false;

    if (page.full_page_scan) {
        // Raster footprint diabaikan. W hanya dipertimbangkan bila warna scan
        // benar-benar kuat dan tersebar di area isi.
        return (
            color >= 4.0
            && strong >= 1.4
            && blocks >= 10.0
            && ratio >= 18.0
        );
    }

    // Logo/foto kecil tetap HW, walaupun warnanya sangat jenuh.
    if (
        rasterCount > 0
        && rasterArea < cfg.smallRasterAreaMax
        && color < cfg.smallRasterColorCoverageMax
    ) {
        return false;
    }

    if (rasterCount > 0 || rasterArea > 0) {
        const enoughColorEvidence = (
            strong >= cfg.rasterMinStrongCoverage
            || rasterStrong >= 8
        ) && (
            rasterDensity >= cfg.rasterMinColorDensity
            || color >= 5
        );

        if (!enoughColorEvidence) return false;

        // Satu/dua gambar harus benar-benar besar. Montase boleh memakai footprint
        // sedikit lebih rendah karena beberapa gambar bersama-sama membentuk halaman foto.
        if (rasterCount >= cfg.rasterMontageMinImages) {
            return rasterArea >= cfg.rasterMontageArea;
        }

        return rasterArea >= cfg.rasterSingleImageArea;
    }

    return (
        color >= cfg.vectorMinColorCoverage
        && strong >= cfg.vectorMinStrongCoverage
        && blocks >= cfg.vectorMinBlocks
        && ratio >= cfg.vectorMinColorInkRatio
    );
}

/**
 * Mencari split alami score halaman berwarna. Threshold selalu di-clamp agar
 * karakter satu file tidak membuat standar biaya berubah ekstrem.
 */
export function deriveAdaptiveThreshold(pages, config = {}) {
    const cfg = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    const candidates = pages
        .filter(page => page.type !== 'H' && isEligibleForFullColor(page, cfg))
        .map(page => computeFullColorScore(page))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (candidates.length < cfg.minimumCandidatesForAdaptiveSplit) {
        return {
            threshold: cfg.defaultFullThreshold,
            mode: 'fixed-guarded',
            candidateCount: candidates.length,
            gap: 0,
        };
    }

    let largestGap = 0;
    let split = cfg.defaultFullThreshold;

    for (let i = 1; i < candidates.length; i++) {
        const left = candidates[i - 1];
        const right = candidates[i];
        const gap = right - left;

        // Hindari split pada ekor score yang terlalu rendah/tinggi.
        const midpoint = (left + right) / 2;
        if (midpoint < 0.40 || midpoint > 0.82) continue;

        if (gap > largestGap) {
            largestGap = gap;
            split = midpoint;
        }
    }

    let threshold = cfg.defaultFullThreshold;
    let mode = 'fixed-guarded';

    if (largestGap >= cfg.minimumGapForAdaptiveSplit) {
        threshold = clamp(split, cfg.minAdaptiveThreshold, cfg.maxAdaptiveThreshold);
        mode = 'adaptive-gap';
    } else {
        // Tanpa gap jelas, gunakan pusat distribusi secara sangat terbatas.
        // Clamp menjaga konsistensi antarfile.
        const center = median(candidates);
        threshold = clamp(
            (cfg.defaultFullThreshold * 0.75) + (center * 0.25),
            cfg.minAdaptiveThreshold,
            cfg.maxAdaptiveThreshold
        );
        mode = 'adaptive-soft';
    }

    return {
        threshold: round(threshold),
        mode,
        candidateCount: candidates.length,
        gap: round(largestGap),
    };
}

export function adaptDocumentClassification(pages, config = {}) {
    const cfg = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    const profile = deriveAdaptiveThreshold(pages, cfg);

    const adaptedPages = pages.map(page => {
        if (page.type === 'H') {
            return {
                ...page,
                adaptive_score: 0,
                adaptive_threshold: profile.threshold,
                adaptive_mode: profile.mode,
                adaptive_changed: false,
            };
        }

        const score = computeFullColorScore(page);
        const eligible = isEligibleForFullColor(page, cfg);
        const originalType = page.type;

        // H dan W yang sudah lolos rule absolut pada pass per-halaman menjadi anchor.
        // Layer adaptif hanya menaikkan halaman HW yang benar-benar berada di zona ambigu.
        // Ini mencegah karakter dokumen lain menurunkan halaman foto/montase yang sudah jelas W.
        let type = originalType;
        if (originalType === 'HW' && eligible && (score >= profile.threshold || score >= cfg.obviousWScore)) {
            type = 'W';
        }

        const changed = type !== originalType;
        const reason = changed
            ? (type === 'W'
                ? `Klasifikasi adaptif: dominasi visual melewati ambang dokumen (${score.toFixed(3)} ≥ ${profile.threshold.toFixed(3)}).`
                : `Klasifikasi adaptif: warna nyata ada, tetapi footprint/dominasi belum cukup untuk W (${score.toFixed(3)} < ${profile.threshold.toFixed(3)} atau guardrail).`)
            : page.reason;

        return {
            ...page,
            type,
            reason,
            confidence: changed
                ? Math.max(78, Math.min(96, Math.round(76 + Math.abs(score - profile.threshold) * 80)))
                : page.confidence,
            adaptive_score: score,
            adaptive_threshold: profile.threshold,
            adaptive_mode: profile.mode,
            adaptive_changed: changed,
        };
    });

    return {
        pages: adaptedPages,
        profile: {
            ...profile,
            colorPageCount: pages.filter(page => page.type !== 'H').length,
            scanPageCount: pages.filter(page => page.full_page_scan).length,
            scanDocumentRatio: round(pages.filter(page => page.full_page_scan).length / Math.max(pages.length, 1)),
        },
    };
}
