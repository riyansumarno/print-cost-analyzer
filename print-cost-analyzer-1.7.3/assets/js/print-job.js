export const PRINT_JOB_DEFAULTS = Object.freeze({
    layoutMode: 'normal',
    pagesPerSide: 1,
    duplex: false,
    duplexMethod: 'auto',
    flip: 'long',
    colorMode: 'auto',
    frontColor: 'auto',
    backColor: 'auto',
    copies: 1,
    collate: true,
    orientation: 'auto',
    pageRangeMode: 'all',
    pageRange: '',
    pageSubset: 'all',
    pageOrder: 'normal',
    nupOrder: 'ltr',
    bookletBinding: 'left',
    pageBorder: true,
});

const TYPE_RANK = Object.freeze({ H: 0, HW: 1, W: 2 });
const ALLOWED_NUP = new Set([1, 2, 4, 6, 8, 9, 16]);
const ALLOWED_COLOR = new Set(['auto', 'bw', 'color']);
const ALLOWED_SIDE_OVERRIDE = new Set(['H', 'HW', 'W']);

function clampInt(v, min, max, fallback) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizePrintSettings(input = {}) {
    const layoutMode = input.layoutMode === 'booklet' ? 'booklet' : 'normal';
    const p = Number(input.pagesPerSide);
    const colorMode = ['auto', 'bw', 'color', 'front-back', 'custom'].includes(input.colorMode)
        ? input.colorMode
        : 'auto';

    const normalized = {
        layoutMode,
        pagesPerSide: ALLOWED_NUP.has(p) ? p : 1,
        duplex: Boolean(input.duplex),
        duplexMethod: input.duplexMethod === 'manual' ? 'manual' : 'auto',
        flip: input.flip === 'short' ? 'short' : 'long',
        colorMode,
        frontColor: ALLOWED_COLOR.has(input.frontColor) ? input.frontColor : 'auto',
        backColor: ALLOWED_COLOR.has(input.backColor) ? input.backColor : 'auto',
        copies: clampInt(input.copies, 1, 999, 1),
        collate: input.collate !== false,
        orientation: ['auto', 'portrait', 'landscape'].includes(input.orientation) ? input.orientation : 'auto',
        pageRangeMode: input.pageRangeMode === 'custom' ? 'custom' : 'all',
        pageRange: String(input.pageRange || '').trim(),
        pageSubset: ['all', 'odd', 'even'].includes(input.pageSubset) ? input.pageSubset : 'all',
        pageOrder: input.pageOrder === 'reverse' ? 'reverse' : 'normal',
        nupOrder: ['ltr', 'rtl', 'ttb'].includes(input.nupOrder) ? input.nupOrder : 'ltr',
        bookletBinding: input.bookletBinding === 'right' ? 'right' : 'left',
        pageBorder: input.pageBorder !== false,
    };

    if (layoutMode === 'booklet') {
        normalized.pagesPerSide = 2;
        normalized.duplex = true;
        normalized.orientation = 'landscape';
        normalized.flip = 'short';
    }

    return normalized;
}

export function parsePageRange(expression, totalPages) {
    const total = Math.max(0, Number.parseInt(totalPages, 10) || 0);
    const text = String(expression || '').trim();
    if (!text) return { pages: [], invalidTokens: [] };

    const pages = [];
    const seen = new Set();
    const invalidTokens = [];

    for (const raw of text.split(',')) {
        const token = raw.trim();
        if (!token) continue;

        const single = token.match(/^\d+$/);
        const range = token.match(/^(\d+)\s*-\s*(\d+)$/);

        if (single) {
            const n = Number(single[0]);
            if (n >= 1 && n <= total) {
                if (!seen.has(n)) {
                    seen.add(n);
                    pages.push(n);
                }
            } else {
                invalidTokens.push(token);
            }
            continue;
        }

        if (range) {
            const from = Number(range[1]);
            const to = Number(range[2]);
            if (from < 1 || from > total || to < 1 || to > total) {
                invalidTokens.push(token);
                continue;
            }
            const step = from <= to ? 1 : -1;
            for (let n = from; ; n += step) {
                if (!seen.has(n)) {
                    seen.add(n);
                    pages.push(n);
                }
                if (n === to) break;
            }
            continue;
        }

        invalidTokens.push(token);
    }

    return { pages, invalidTokens };
}

export function selectPages(totalPages, input = {}) {
    const settings = normalizePrintSettings(input);
    const total = Math.max(0, Number.parseInt(totalPages, 10) || 0);
    let pages;
    let invalidTokens = [];

    if (settings.pageRangeMode === 'custom') {
        const parsed = parsePageRange(settings.pageRange, total);
        pages = parsed.pages;
        invalidTokens = parsed.invalidTokens;
    } else {
        pages = Array.from({ length: total }, (_, i) => i + 1);
    }

    if (settings.pageSubset === 'odd') pages = pages.filter(n => n % 2 === 1);
    if (settings.pageSubset === 'even') pages = pages.filter(n => n % 2 === 0);
    if (settings.pageOrder === 'reverse') pages = [...pages].reverse();

    return { pages, invalidTokens };
}

export function getPageAnalysisMap(analysis) {
    const map = new Map();
    for (const page of (analysis?.pages || [])) {
        const n = Number(page?.page);
        if (Number.isFinite(n)) map.set(n, page);
    }
    return map;
}

function aggregateSideMetrics(nums, pagesPerSide, map) {
    const divisor = Math.max(1, pagesPerSide);
    const metrics = {
        colorCoverage: 0,
        strongColorCoverage: 0,
        inkCoverage: 0,
        rasterArea: 0,
        activeColorBlocks: 0,
        hCount: 0,
        hwCount: 0,
        wCount: 0,
        knownCount: 0,
    };

    for (const n of nums) {
        if (!n) continue;
        const page = map.get(n);
        if (!page) continue;
        metrics.knownCount++;
        const type = TYPE_RANK[page.type] === undefined ? 'H' : page.type;
        metrics[`${type.toLowerCase()}Count`]++;
        metrics.colorCoverage += Number(page.color_coverage) || 0;
        metrics.strongColorCoverage += Number(page.strong_color_coverage) || 0;
        metrics.inkCoverage += Number(page.ink_coverage) || 0;
        metrics.rasterArea += Number(page.raster_image_area) || 0;
        metrics.activeColorBlocks += Number(page.active_color_blocks) || 0;
    }

    for (const key of ['colorCoverage', 'strongColorCoverage', 'inkCoverage', 'rasterArea', 'activeColorBlocks']) {
        metrics[key] /= divisor;
    }

    metrics.colorInkRatio = metrics.inkCoverage > 0
        ? Math.min(100, metrics.colorCoverage / metrics.inkCoverage * 100)
        : 0;
    metrics.wFraction = metrics.wCount / divisor;
    metrics.colorPageFraction = (metrics.hwCount + metrics.wCount) / divisor;
    return metrics;
}

export function classifyAutoSide(nums, pagesPerSide, map) {
    if (!(map instanceof Map) || !map.size) {
        return { type: null, metrics: null, reason: 'Menunggu hasil analisis warna.' };
    }

    const realPages = nums.filter(Boolean);
    const source = realPages.map(n => map.get(n)).filter(Boolean);
    if (!source.length) {
        return { type: null, metrics: null, reason: 'Tidak ada halaman pada sisi ini.' };
    }

    if (pagesPerSide === 1 && source.length === 1) {
        const page = source[0];
        return {
            type: TYPE_RANK[page.type] === undefined ? 'H' : page.type,
            metrics: aggregateSideMetrics(nums, pagesPerSide, map),
            reason: `Mengikuti klasifikasi Hal. ${page.page}.`,
        };
    }

    const metrics = aggregateSideMetrics(nums, pagesPerSide, map);
    if (!metrics.hwCount && !metrics.wCount) {
        return { type: 'H', metrics, reason: 'Semua halaman pada sisi ini terklasifikasi H.' };
    }

    const occupancyDominant = metrics.wFraction >= 0.5;
    const coverageDominant = metrics.colorCoverage >= 12
        && metrics.strongColorCoverage >= 2
        && metrics.colorInkRatio >= 38
        && (metrics.rasterArea >= 14 || metrics.activeColorBlocks >= 24);

    if (occupancyDominant || coverageDominant) {
        return {
            type: 'W',
            metrics,
            reason: occupancyDominant
                ? 'Setidaknya separuh slot N-up berisi halaman W.'
                : 'Cakupan warna gabungan tetap dominan setelah N-up.',
        };
    }

    return {
        type: 'HW',
        metrics,
        reason: 'Ada warna nyata, tetapi dominasi pada sisi cetak belum cukup untuk W.',
    };
}

function hasPrintableContent(nums) {
    return Array.isArray(nums) && nums.some(Boolean);
}

export function resolveSideColor(sideName, nums, settings, map, override = null) {
    const normalized = normalizePrintSettings(settings);
    if (!hasPrintableContent(nums)) {
        return { type: null, requestedMode: 'blank', forced: false, reason: 'Sisi kosong.' };
    }

    if (ALLOWED_SIDE_OVERRIDE.has(override)) {
        return {
            type: override,
            requestedMode: 'override',
            forced: true,
            reason: `Override operator: sisi ini dipaksa ${override}.`,
        };
    }

    let mode = normalized.colorMode;
    if (mode === 'front-back') mode = sideName === 'back' ? normalized.backColor : normalized.frontColor;
    if (mode === 'custom') mode = 'auto';

    if (mode === 'bw') {
        return { type: 'H', requestedMode: mode, forced: true, reason: 'Dipaksa hitam-putih oleh pengaturan job.' };
    }
    if (mode === 'color') {
        return { type: 'W', requestedMode: mode, forced: true, reason: 'Dipaksa mode warna oleh pengaturan job.' };
    }

    const auto = classifyAutoSide(nums, normalized.pagesPerSide, map);
    return { ...auto, requestedMode: 'auto', forced: false };
}

function makeNormalSheets(selectedPages, settings) {
    const logicalSides = [];
    for (let i = 0; i < selectedPages.length; i += settings.pagesPerSide) {
        const pages = selectedPages.slice(i, i + settings.pagesPerSide);
        while (pages.length < settings.pagesPerSide) pages.push(null);
        logicalSides.push({ pages });
    }

    const sheets = [];
    if (settings.duplex) {
        for (let i = 0; i < logicalSides.length; i += 2) {
            sheets.push({
                sheet: sheets.length + 1,
                front: logicalSides[i] || null,
                back: logicalSides[i + 1] || null,
            });
        }
    } else {
        for (const side of logicalSides) {
            sheets.push({ sheet: sheets.length + 1, front: side, back: null });
        }
    }

    return { sheets, addedBlankPages: 0 };
}

function makeBookletSheets(selectedPages, settings) {
    const padded = [...selectedPages];
    const originalLength = padded.length;
    while (padded.length % 4 !== 0) padded.push(null);

    const sheets = [];
    const count = padded.length;
    const physicalSheets = count / 4;

    for (let i = 0; i < physicalSheets; i++) {
        const front = [padded[count - 1 - (2 * i)], padded[2 * i]];
        const back = [padded[(2 * i) + 1], padded[count - 2 - (2 * i)]];
        if (settings.bookletBinding === 'right') {
            front.reverse();
            back.reverse();
        }
        sheets.push({
            sheet: sheets.length + 1,
            front: { pages: front, booklet: true },
            back: { pages: back, booklet: true },
        });
    }

    return { sheets, addedBlankPages: padded.length - originalLength };
}

function normalizeOverrides(overrides = {}) {
    const out = {};
    if (!overrides || typeof overrides !== 'object') return out;
    for (const [key, value] of Object.entries(overrides)) {
        if (/^\d+:(?:front|back)$/.test(key) && ALLOWED_SIDE_OVERRIDE.has(value)) out[key] = value;
    }
    return out;
}

export function buildPrintJob(totalPages, input = {}, analysis = null, prices = {}, overrides = {}) {
    const settings = normalizePrintSettings(input);
    const total = Math.max(0, Number.parseInt(totalPages, 10) || 0);
    const selection = selectPages(total, settings);
    const map = getPageAnalysisMap(analysis);
    const safeOverrides = normalizeOverrides(overrides);

    const built = settings.layoutMode === 'booklet'
        ? makeBookletSheets(selection.pages, settings)
        : makeNormalSheets(selection.pages, settings);

    const sheets = built.sheets;
    const price = {
        H: Number(prices.H) || 300,
        HW: Number(prices.HW) || 500,
        W: Number(prices.W) || 1000,
        duplexCredit: Math.max(0, Number(prices.duplexCredit) || 0),
    };

    let oneCopyCost = 0;
    let h = 0;
    let hw = 0;
    let w = 0;
    let unresolved = 0;
    let printedSides = 0;
    let duplexSheets = 0;

    for (const sheet of sheets) {
        if (settings.duplex && hasPrintableContent(sheet.front?.pages || []) && hasPrintableContent(sheet.back?.pages || [])) duplexSheets++;
        for (const sideName of ['front', 'back']) {
            const side = sheet[sideName];
            if (!side || !hasPrintableContent(side.pages)) continue;
            printedSides++;
            const key = `${sheet.sheet}:${sideName}`;
            const resolved = resolveSideColor(sideName, side.pages, settings, map, safeOverrides[key] || null);
            Object.assign(side, {
                sideName,
                type: resolved.type,
                requestedMode: resolved.requestedMode,
                forced: resolved.forced,
                reason: resolved.reason,
                metrics: resolved.metrics || null,
                override: safeOverrides[key] || null,
            });

            if (side.type) {
                oneCopyCost += price[side.type];
                if (side.type === 'H') h++;
                else if (side.type === 'HW') hw++;
                else w++;
            } else {
                unresolved++;
            }
        }
    }

    const duplexCreditTotal = duplexSheets * price.duplexCredit;
    oneCopyCost = Math.max(0, oneCopyCost - duplexCreditTotal);

    return {
        settings,
        sheets,
        totalPages: total,
        selectedPages: selection.pages,
        selectedPageCount: selection.pages.length,
        invalidRangeTokens: selection.invalidTokens,
        addedBlankPages: built.addedBlankPages,
        printedSides,
        physicalSheets: sheets.length,
        copies: settings.copies,
        collate: settings.collate,
        oneCopyCost,
        oneCopyGrossCost: oneCopyCost + duplexCreditTotal,
        duplexSheets,
        duplexCreditTotal,
        totalCost: oneCopyCost * settings.copies,
        totalPhysicalSheets: sheets.length * settings.copies,
        totalPrintedSides: printedSides * settings.copies,
        sideCounts: {
            H: h * settings.copies,
            HW: hw * settings.copies,
            W: w * settings.copies,
            unresolved: unresolved * settings.copies,
        },
        resolved: unresolved === 0,
        prices: price,
        overrides: safeOverrides,
    };
}

export function getSideAt(job, sheet, side = 'front') {
    if (!job?.sheets?.length) return null;
    const i = Math.min(job.sheets.length - 1, Math.max(0, (Number(sheet) || 1) - 1));
    return side === 'back' ? job.sheets[i].back : job.sheets[i].front;
}

export function chooseNupLayout(pagesPerSide, orientation = 'auto', sourceAspect = 0.707) {
    const n = ALLOWED_NUP.has(Number(pagesPerSide)) ? Number(pagesPerSide) : 1;
    const source = Math.max(0.2, Math.min(5, Number(sourceAspect) || 0.707));
    const base = source <= 1 ? source : 1 / source;
    const portraitAspect = base;
    const landscapeAspect = 1 / base;
    const pairs = [];

    for (let rows = 1; rows <= n; rows++) {
        const cols = Math.ceil(n / rows);
        if (rows * cols === n) pairs.push({ rows, cols });
    }

    const orientations = orientation === 'auto' ? ['portrait', 'landscape'] : [orientation];
    let best = null;

    for (const item of orientations) {
        const sheetAspect = item === 'landscape' ? landscapeAspect : portraitAspect;
        for (const pair of pairs) {
            const slotAspect = (sheetAspect / pair.cols) / (1 / pair.rows);
            const score = Math.abs(Math.log(slotAspect / source)) + Math.abs(pair.cols - pair.rows) * 0.015;
            if (!best || score < best.score) {
                best = { ...pair, orientation: item, sheetAspect, slotAspect, score };
            }
        }
    }

    return best || {
        rows: 1,
        cols: 1,
        orientation: 'portrait',
        sheetAspect: portraitAspect,
        slotAspect: portraitAspect,
        score: 0,
    };
}

export function getNupSlotOrder(rows, cols, mode = 'ltr') {
    const r = Math.max(1, Number(rows) || 1);
    const c = Math.max(1, Number(cols) || 1);
    const order = [];

    if (mode === 'ttb') {
        for (let col = 0; col < c; col++) {
            for (let row = 0; row < r; row++) order.push((row * c) + col);
        }
        return order;
    }

    for (let row = 0; row < r; row++) {
        if (mode === 'rtl') {
            for (let col = c - 1; col >= 0; col--) order.push((row * c) + col);
        } else {
            for (let col = 0; col < c; col++) order.push((row * c) + col);
        }
    }
    return order;
}
