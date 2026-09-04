/**
 * Native-aware PDF paint analyzer.
 *
 * Tujuan:
 * 1) membedakan warna yang sekadar DISET dari warna yang benar-benar DIPAKAI;
 * 2) tidak menganggap color-space selection sebagai bukti warna;
 * 3) menjadikan PDF native Word/Office yang benar-benar akromatik sebagai H;
 * 4) tetap menyerahkan scan/screenshot/foto kepada pixel analyzer.
 */

function collectNumbers(value, out = []) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        out.push(value);
        return out;
    }
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        for (const item of value) collectNumbers(item, out);
    }
    return out;
}

function rangeOf(values) {
    return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function normalizeComponents(values) {
    if (!values.length) return values;
    const scale = Math.max(...values.map(v => Math.abs(v))) <= 1.5 ? 1 : 255;
    return values.map(v => Math.max(0, Math.min(1, v / scale)));
}

function isRgbChromatic(args) {
    const values = collectNumbers(args).slice(0, 3);
    if (values.length < 3) return null;
    return rangeOf(normalizeComponents(values)) > 0.018;
}

function isCmykChromatic(args) {
    const values = collectNumbers(args).slice(0, 4);
    if (values.length < 4) return null;
    const [c, m, y, k] = normalizeComponents(values);
    const rgb = [
        1 - Math.min(1, c + k),
        1 - Math.min(1, m + k),
        1 - Math.min(1, y + k),
    ];
    return rangeOf(rgb) > 0.018;
}

function classifyGenericColor(args) {
    const values = collectNumbers(args);
    if (values.length === 1) return false;
    if (values.length === 3) return isRgbChromatic(values);
    if (values.length === 4) return isCmykChromatic(values);
    return null;
}

function opSet(OPS, names) {
    return new Set(names.map(name => OPS?.[name]).filter(Number.isInteger));
}

function firstNumber(args, fallback = 0) {
    const values = collectNumbers(args);
    return values.length ? values[0] : fallback;
}

function transformDeterminant(args) {
    const values = collectNumbers(args).slice(0, 6);
    if (values.length < 6) return null;
    const [a, b, c, d] = values;
    const det = (a * d) - (b * c);
    return Number.isFinite(det) ? Math.abs(det) : null;
}

function safePercent(part, whole) {
    if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
    return Math.max(0, Math.min(100, (part / whole) * 100));
}

/**
 * PDF.js showText umumnya berisi glyph object dengan properti unicode/fontChar.
 * Kita perlu membedakan glyph nyata dari spasi kosong karena Word dapat memberi
 * warna berbeda pada sebuah run yang isinya hanya " ".
 */
function hasVisibleText(value) {
    if (value == null) return false;

    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    if (typeof value === 'number') {
        // Pada showSpacedText, number adalah penyesuaian spacing, bukan glyph.
        return false;
    }

    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        for (const item of value) {
            if (hasVisibleText(item)) return true;
        }
        return false;
    }

    if (typeof value === 'object') {
        if (value.isSpace === true) return false;
        if (typeof value.unicode === 'string') return value.unicode.trim().length > 0;
        if (typeof value.fontChar === 'string') return value.fontChar.trim().length > 0;
        if (typeof value.str === 'string') return value.str.trim().length > 0;

        // Object glyph tanpa field yang dikenal: konservatif, anggap visible.
        if ('width' in value || 'accent' in value) return true;
    }

    return false;
}

function usesFillForText(mode) {
    return mode === 0 || mode === 2 || mode === 4 || mode === 6;
}

function usesStrokeForText(mode) {
    return mode === 1 || mode === 2 || mode === 5 || mode === 6;
}

export function analyzeOperatorList(operatorList, OPS, pageGeometry = {}) {
    const result = {
        available: false,
        hasRasterImage: false,
        rasterImageOps: 0,
        rasterImageOpsWithArea: 0,
        rasterImagePaintArea: 0,
        rasterImageAreaCoverage: 0,
        hasChromaticVector: false,
        chromaticColorOps: 0,       // warna chromatic yang di-set
        achromaticColorOps: 0,      // warna akromatik yang di-set
        chromaticPaintOps: 0,       // warna chromatic yang benar-benar melukis
        achromaticPaintOps: 0,
        visibleTextPaintOps: 0,
        vectorPathPaintOps: 0,
        colorSpaceOps: 0,
        unknownColorOps: 0,
        unknownPaintOps: 0,
        hasComplexPaint: false,
        complexPaintOps: 0,
    };

    if (!operatorList || !Array.isArray(operatorList.fnArray) || !Array.isArray(operatorList.argsArray) || !OPS) {
        return result;
    }
    result.available = true;

    const rgbFillOps = opSet(OPS, ['setFillRGBColor']);
    const rgbStrokeOps = opSet(OPS, ['setStrokeRGBColor']);
    const cmykFillOps = opSet(OPS, ['setFillCMYKColor']);
    const cmykStrokeOps = opSet(OPS, ['setStrokeCMYKColor']);
    const grayFillOps = opSet(OPS, ['setFillGray']);
    const grayStrokeOps = opSet(OPS, ['setStrokeGray']);
    const genericFillOps = opSet(OPS, ['setFillColor']);
    const genericStrokeOps = opSet(OPS, ['setStrokeColor']);
    const patternFillOps = opSet(OPS, ['setFillColorN']);
    const patternStrokeOps = opSet(OPS, ['setStrokeColorN']);
    const colorSpaceOps = opSet(OPS, ['setStrokeColorSpace', 'setFillColorSpace']);

    const saveOps = opSet(OPS, ['save']);
    const restoreOps = opSet(OPS, ['restore']);
    const textModeOps = opSet(OPS, ['setTextRenderingMode']);
    const textPaintOps = opSet(OPS, [
        'showText',
        'showSpacedText',
        'nextLineShowText',
        'nextLineSetSpacingShowText',
    ]);

    const fillPathOps = opSet(OPS, ['fill', 'eoFill']);
    const strokePathOps = opSet(OPS, ['stroke', 'closeStroke']);
    const fillStrokePathOps = opSet(OPS, [
        'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke',
    ]);

    const rasterOps = opSet(OPS, [
        'paintJpegXObject',
        'paintImageXObject',
        'paintInlineImageXObject',
        'paintInlineImageXObjectGroup',
        'paintImageXObjectRepeat',
        'paintImageMaskXObject',
        'paintImageMaskXObjectGroup',
        'paintImageMaskXObjectRepeat',
        'paintSolidColorImageMask',
    ]);

    // Hanya image paint biasa yang dipakai untuk estimasi footprint foto.
    // Image-mask tidak dihitung sebagai foto karena umumnya berupa glyph/mask 1-bit.
    const footprintRasterOps = opSet(OPS, [
        'paintJpegXObject',
        'paintImageXObject',
        'paintInlineImageXObject',
    ]);
    const transformOps = opSet(OPS, ['transform']);

    const shadingOps = opSet(OPS, ['shadingFill']);

    // Default PDF graphics state adalah black/DeviceGray 0.
    let state = {
        fill: false,   // false=akromatik, true=chromatic, null=unknown
        stroke: false,
        textMode: 0,
        // Determinan CTM cukup untuk mengukur luas unit-square image XObject.
        areaScale: 1,
    };
    const stack = [];

    function setColor(kind, chromatic) {
        if (chromatic === null) {
            result.unknownColorOps++;
        } else if (chromatic) {
            result.chromaticColorOps++;
        } else {
            result.achromaticColorOps++;
        }
        state[kind] = chromatic;
    }

    function useColor(kind) {
        const value = state[kind];
        if (value === null) {
            result.unknownPaintOps++;
            return;
        }
        if (value) {
            result.chromaticPaintOps++;
            result.hasChromaticVector = true;
        } else {
            result.achromaticPaintOps++;
        }
    }

    for (let i = 0; i < operatorList.fnArray.length; i++) {
        const fn = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];

        if (saveOps.has(fn)) {
            stack.push({ ...state });
            continue;
        }
        if (restoreOps.has(fn)) {
            state = stack.pop() || state;
            continue;
        }

        if (transformOps.has(fn)) {
            const det = transformDeterminant(args);
            if (det !== null) {
                state.areaScale *= det;
            }
            continue;
        }

        if (colorSpaceOps.has(fn)) {
            // Hanya memilih ruang warna. Bukan paint dan bukan bukti chromatic.
            result.colorSpaceOps++;
            continue;
        }

        if (grayFillOps.has(fn)) { setColor('fill', false); continue; }
        if (grayStrokeOps.has(fn)) { setColor('stroke', false); continue; }
        if (rgbFillOps.has(fn)) { setColor('fill', isRgbChromatic(args)); continue; }
        if (rgbStrokeOps.has(fn)) { setColor('stroke', isRgbChromatic(args)); continue; }
        if (cmykFillOps.has(fn)) { setColor('fill', isCmykChromatic(args)); continue; }
        if (cmykStrokeOps.has(fn)) { setColor('stroke', isCmykChromatic(args)); continue; }
        if (genericFillOps.has(fn)) { setColor('fill', classifyGenericColor(args)); continue; }
        if (genericStrokeOps.has(fn)) { setColor('stroke', classifyGenericColor(args)); continue; }

        if (patternFillOps.has(fn)) {
            state.fill = null;
            result.hasComplexPaint = true;
            result.complexPaintOps++;
            continue;
        }
        if (patternStrokeOps.has(fn)) {
            state.stroke = null;
            result.hasComplexPaint = true;
            result.complexPaintOps++;
            continue;
        }

        if (textModeOps.has(fn)) {
            state.textMode = Math.max(0, Math.min(7, Math.round(firstNumber(args, 0))));
            continue;
        }

        if (textPaintOps.has(fn)) {
            // Run yang hanya berisi whitespace tidak mencetak tinta.
            if (!hasVisibleText(args)) continue;
            result.visibleTextPaintOps++;
            if (usesFillForText(state.textMode)) useColor('fill');
            if (usesStrokeForText(state.textMode)) useColor('stroke');
            continue;
        }

        if (fillPathOps.has(fn)) {
            result.vectorPathPaintOps++;
            useColor('fill');
            continue;
        }
        if (strokePathOps.has(fn)) {
            result.vectorPathPaintOps++;
            useColor('stroke');
            continue;
        }
        if (fillStrokePathOps.has(fn)) {
            result.vectorPathPaintOps++;
            useColor('fill');
            useColor('stroke');
            continue;
        }

        if (rasterOps.has(fn)) {
            result.hasRasterImage = true;
            result.rasterImageOps++;

            if (footprintRasterOps.has(fn) && Number.isFinite(state.areaScale) && state.areaScale > 0) {
                result.rasterImagePaintArea += state.areaScale;
                result.rasterImageOpsWithArea++;
            }
            continue;
        }

        if (shadingOps.has(fn)) {
            result.hasComplexPaint = true;
            result.complexPaintOps++;
            continue;
        }
    }

    const pageWidth = Number(pageGeometry?.pageWidth || 0);
    const pageHeight = Number(pageGeometry?.pageHeight || 0);
    const pageArea = pageWidth > 0 && pageHeight > 0 ? pageWidth * pageHeight : 0;
    result.rasterImageAreaCoverage = safePercent(result.rasterImagePaintArea, pageArea);

    return result;
}

export function isAuthoritativeNativeBlack(structure, textItems = 0) {
    if (!structure?.available) return false;
    if (structure.hasRasterImage) return false;
    if (structure.hasComplexPaint) return false;
    if ((structure.unknownPaintOps || 0) > 0) return false;
    if ((structure.chromaticPaintOps || 0) > 0 || structure.hasChromaticVector) return false;

    // Ada konten native yang benar-benar dilukis, atau setidaknya text layer.
    return (
        (structure.achromaticPaintOps || 0) > 0
        || (structure.visibleTextPaintOps || 0) > 0
        || textItems > 0
    );
}

export function reconcilePageAnalysis(pixel, structure, textItems = 0) {
    if (!pixel) return pixel;

    const nativeBlackHint = isAuthoritativeNativeBlack(structure, textItems);
    const imageArea = Math.max(0, Number(structure?.rasterImageAreaCoverage || 0));
    const colorDensityInRaster = imageArea > 0
        ? (Number(pixel.colorCoverage || 0) / imageArea) * 100
        : 0;
    const strongDensityInRaster = imageArea > 0
        ? (Number(pixel.strongColorCoverage || 0) / imageArea) * 100
        : 0;

    // Raster-footprint: biaya cetak tidak cukup ditentukan oleh persentase chroma seluruh
    // halaman. Foto berwarna dapat menempati 20–30% halaman tetapi tereduksi oleh
    // margin putih dan area netral di dalam foto. Footprint raster memberi konteks
    // spasial, sementara coherent pixel memastikan image tersebut benar-benar warna.
    const rasterFootprintDominant = (
        pixel.type === 'HW'
        && structure?.hasRasterImage
        && imageArea >= 18
        && Number(pixel.inkCoverage || 0) >= 15
        && colorDensityInRaster >= 15
        && strongDensityInRaster >= 8
    );

    // Fallback untuk montase beberapa foto jika operator PDF tidak memberi footprint
    // yang dapat dihitung secara andal. Tetap membutuhkan bukti chroma yang kuat.
    const rasterMontageDominant = (
        pixel.type === 'HW'
        && structure?.hasRasterImage
        && Number(structure?.rasterImageOps || 0) >= 3
        && Number(pixel.inkCoverage || 0) >= 18
        && Number(pixel.colorCoverage || 0) >= 4
        && Number(pixel.strongColorCoverage || 0) >= 2
        && Number(pixel.colorInkRatio || 0) >= 18
        && Number(pixel.activeColorBlockCoverage || 0) >= 10
    );

    if (rasterFootprintDominant || rasterMontageDominant) {
        return {
            ...pixel,
            type: 'W',
            confidence: Math.max(Number(pixel.confidence || 0), rasterFootprintDominant ? 86 : 82),
            semanticOverride: true,
            nativeBlack: false,
            rasterImageAreaCoverage: imageArea,
            rasterColorDensity: Math.max(0, colorDensityInRaster),
            rasterStrongColorDensity: Math.max(0, strongDensityInRaster),
            analysisSource: rasterFootprintDominant
                ? 'coherent-raster-footprint'
                : 'coherent-raster-montage',
            reason: rasterFootprintDominant
                ? 'Foto/gambar raster berwarna menempati bagian besar halaman; margin putih tidak menurunkan klasifikasi menjadi HW.'
                : 'Beberapa foto/gambar raster berwarna membentuk montase yang cukup dominan untuk dikategorikan penuh warna.',
        };
    }

    return {
        ...pixel,
        semanticOverride: false,
        nativeBlack: nativeBlackHint,
        rasterImageAreaCoverage: imageArea,
        rasterColorDensity: Math.max(0, colorDensityInRaster),
        rasterStrongColorDensity: Math.max(0, strongDensityInRaster),
        analysisSource: structure?.hasRasterImage ? 'coherent-raster-pixel' : 'coherent-pixel',
        reason: nativeBlackHint && pixel.type === 'H'
            ? `${pixel.reason} Struktur PDF juga konsisten dengan gray/black.`
            : pixel.reason,
    };
}

export function shouldOverrideVectorBlack() {
    return false;
}
