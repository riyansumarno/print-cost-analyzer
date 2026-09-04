import assert from 'node:assert/strict';
import {
    analyzeOperatorList,
    isAuthoritativeNativeBlack,
    reconcilePageAnalysis,
} from '../assets/js/pdf-structure-analyzer.js';

const OPS = {
    setFillGray: 1,
    setStrokeGray: 2,
    setFillRGBColor: 3,
    setStrokeRGBColor: 4,
    setFillCMYKColor: 5,
    setStrokeCMYKColor: 6,
    paintImageXObject: 7,
    paintInlineImageXObject: 8,
    shadingFill: 9,
    setFillColorN: 10,
    setStrokeColorN: 11,
    setFillColorSpace: 12,
    setStrokeColorSpace: 13,
    setFillColor: 14,
    setStrokeColor: 15,
    save: 16,
    restore: 17,
    showText: 18,
    showSpacedText: 19,
    fill: 20,
    stroke: 21,
    fillStroke: 22,
    setTextRenderingMode: 23,
    transform: 24,
};

function glyph(text) {
    return [[{ unicode: text, width: text === ' ' ? 250 : 500 }]];
}

function pixel(type = 'HW', overrides = {}) {
    return {
        type,
        colorCoverage: 4.8,
        strongColorCoverage: 0.75,
        inkCoverage: 7.0,
        colorInkRatio: 68,
        activeColorBlockCoverage: 10,
        confidence: 80,
        ...overrides,
    };
}

// 1) DeviceGray/neutral RGB/CMYK yang dipakai untuk teks adalah akromatik.
{
    const result = analyzeOperatorList({
        fnArray: [
            OPS.setFillGray, OPS.showText,
            OPS.setFillRGBColor, OPS.showText,
            OPS.setFillCMYKColor, OPS.showText,
        ],
        argsArray: [
            [0], glyph('A'),
            [0, 0, 0], glyph('B'),
            [0, 0, 0, 1], glyph('C'),
        ],
    }, OPS);
    assert.equal(result.hasChromaticVector, false);
    assert.equal(result.chromaticPaintOps, 0);
    assert.equal(result.achromaticPaintOps, 3);
}

// 2) REGRESSION: color-space setter tidak boleh dianggap paint/warna.
{
    const result = analyzeOperatorList({
        fnArray: [OPS.setFillColorSpace, OPS.setFillGray, OPS.showText, OPS.setStrokeColorSpace],
        argsArray: [['DeviceGray'], [0], glyph('Word'), ['DeviceGray']],
    }, OPS);
    assert.equal(result.colorSpaceOps, 2);
    assert.equal(result.hasComplexPaint, false);
    assert.equal(result.unknownPaintOps, 0);
    assert.equal(isAuthoritativeNativeBlack(result, 120), true);
}

// 3) v1.4: struktur native-black menjadi hint saja; coherent pixel tetap authoritative.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.setFillGray, OPS.showText],
        argsArray: [[0], glyph('Background of Study')],
    }, OPS);
    const final = reconcilePageAnalysis(pixel('HW'), structure, 250);
    assert.equal(final.type, 'HW');
    assert.equal(final.nativeBlack, true);
    assert.equal(final.analysisSource, 'coherent-pixel');
    assert.equal(final.semanticOverride, false);
}

// 4) REGRESSION dari file nyata: Word dapat memberi warna biru pada run yang
// hanya berisi spasi. Warna tersebut tidak mencetak tinta dan harus diabaikan.
{
    const structure = analyzeOperatorList({
        fnArray: [
            OPS.save,
            OPS.setFillRGBColor,
            OPS.showText,
            OPS.restore,
            OPS.setFillGray,
            OPS.showText,
        ],
        argsArray: [
            [],
            [0.184, 0.329, 0.588],
            glyph(' '),
            [],
            [0],
            glyph('COVER'),
        ],
    }, OPS);
    assert.equal(structure.chromaticColorOps, 1); // warna memang di-set
    assert.equal(structure.chromaticPaintOps, 0); // tetapi tidak melukis glyph
    assert.equal(structure.achromaticPaintOps, 1);
    assert.equal(isAuthoritativeNativeBlack(structure, 20), true);
    assert.equal(reconcilePageAnalysis(pixel('HW'), structure, 20).type, 'HW');
}

// 5) Teks biru sungguhan harus terdeteksi sebagai chromatic paint.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.setFillRGBColor, OPS.showText],
        argsArray: [[0.1, 0.35, 0.9], glyph('Blue text')],
    }, OPS);
    assert.equal(structure.hasChromaticVector, true);
    assert.equal(structure.chromaticPaintOps, 1);
    assert.equal(isAuthoritativeNativeBlack(structure, 10), false);
}

// 6) Fill kuning pada shape/table cell adalah warna nyata.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.setFillRGBColor, OPS.fill],
        argsArray: [[1, 1, 0], []],
    }, OPS);
    assert.equal(structure.chromaticPaintOps, 1);
    const final = reconcilePageAnalysis(pixel('HW'), structure, 100);
    assert.equal(final.type, 'HW');
}

// 7) Warna vektor kecil tidak memaksa override; coherent pixel tetap memutuskan.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.setFillRGBColor, OPS.showText],
        argsArray: [[0.1, 0.3, 0.9], glyph('x')],
    }, OPS);
    const final = reconcilePageAnalysis(pixel('H', {
        colorCoverage: 0.08,
        strongColorCoverage: 0.03,
    }), structure, 80);
    assert.equal(final.type, 'H');
    assert.equal(final.semanticOverride, false);
}

// 8) Scan/screenshot memiliki raster image; keputusan tetap milik pixel analyzer.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.setFillGray, OPS.showText, OPS.paintInlineImageXObject],
        argsArray: [[0], glyph('caption'), ['img-inline']],
    }, OPS);
    assert.equal(structure.hasRasterImage, true);
    assert.equal(isAuthoritativeNativeBlack(structure, 50), false);
    const final = reconcilePageAnalysis(pixel('HW'), structure, 50);
    assert.equal(final.type, 'HW');
    assert.equal(final.analysisSource, 'coherent-raster-pixel');
}

// 9) Pattern/shading harus kembali ke piksel.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.setFillGray, OPS.setFillColorN],
        argsArray: [[0], ['Pattern1']],
    }, OPS);
    assert.equal(structure.hasComplexPaint, true);
    assert.equal(isAuthoritativeNativeBlack(structure, 100), false);
}

// 10) Generic numeric color dapat dianalisis; generic non-numeric unresolved.
{
    const neutral = analyzeOperatorList({
        fnArray: [OPS.setFillColor, OPS.showText],
        argsArray: [[0, 0, 0], glyph('A')],
    }, OPS);
    assert.equal(neutral.achromaticPaintOps, 1);

    const unresolved = analyzeOperatorList({
        fnArray: [OPS.setFillColor, OPS.showText],
        argsArray: [['icc-color'], glyph('A')],
    }, OPS);
    assert.equal(unresolved.unknownColorOps, 1);
    assert.equal(unresolved.unknownPaintOps, 1);
    assert.equal(isAuthoritativeNativeBlack(unresolved, 10), false);
}

// 11) Footprint image: image 300x400 pada halaman 600x800 = 25%.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
        argsArray: [[], [300, 0, 0, 400, 40, 100], ['img1'], []],
    }, OPS, { pageWidth: 600, pageHeight: 800 });
    assert.equal(structure.rasterImageOps, 1);
    assert.equal(structure.rasterImageOpsWithArea, 1);
    assert.ok(Math.abs(structure.rasterImageAreaCoverage - 25) < 0.001);
}

// 12) Foto besar berwarna: pixel HW dipromosikan menjadi W lewat raster footprint.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
        argsArray: [[], [330, 0, 0, 400, 20, 20], ['photo'], []],
    }, OPS, { pageWidth: 600, pageHeight: 800 }); // 27.5%
    const final = reconcilePageAnalysis(pixel('HW', {
        colorCoverage: 10.5,
        strongColorCoverage: 4.0,
        inkCoverage: 23,
        colorInkRatio: 45,
        activeColorBlockCoverage: 22,
    }), structure, 20);
    assert.equal(final.type, 'W');
    assert.equal(final.analysisSource, 'coherent-raster-footprint');
}

// 13) Screenshot besar tetapi chroma kuatnya sangat sedikit tetap HW.
{
    const structure = analyzeOperatorList({
        fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
        argsArray: [[], [500, 0, 0, 600, 20, 20], ['screenshot'], []],
    }, OPS, { pageWidth: 600, pageHeight: 800 });
    const final = reconcilePageAnalysis(pixel('HW', {
        colorCoverage: 8,
        strongColorCoverage: 0.8,
        inkCoverage: 22,
        colorInkRatio: 36,
        activeColorBlockCoverage: 24,
    }), structure, 20);
    assert.equal(final.type, 'HW');
}

// 14) Montase enam foto bisa W walau footprint tidak tersedia.
{
    const structure = {
        available: true,
        hasRasterImage: true,
        rasterImageOps: 6,
        rasterImageAreaCoverage: 0,
        hasComplexPaint: false,
        unknownPaintOps: 0,
        chromaticPaintOps: 0,
        hasChromaticVector: false,
    };
    const final = reconcilePageAnalysis(pixel('HW', {
        colorCoverage: 4.4,
        strongColorCoverage: 2.4,
        inkCoverage: 20.1,
        colorInkRatio: 21.7,
        activeColorBlockCoverage: 10.4,
    }), structure, 5);
    assert.equal(final.type, 'W');
    assert.equal(final.analysisSource, 'coherent-raster-montage');
}

console.log('pdf-structure-analyzer: 14/14 tests passed');
