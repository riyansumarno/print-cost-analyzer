import assert from 'node:assert/strict';
import { analyzeImageData, classifyMetrics } from '../assets/js/pixel-analyzer.js';

function image(width, height, rgb = [255, 255, 255]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = rgb[0];
        data[(i * 4) + 1] = rgb[1];
        data[(i * 4) + 2] = rgb[2];
        data[(i * 4) + 3] = 255;
    }
    return data;
}

function rect(data, width, x0, y0, x1, y1, rgb) {
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = ((y * width) + x) * 4;
            data[i] = rgb[0];
            data[i + 1] = rgb[1];
            data[i + 2] = rgb[2];
        }
    }
}

function deterministicNoise(data, amount = 4) {
    let seed = 123456789;
    const rnd = () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 0xFFFFFFFF;
    };

    for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const delta = Math.round(((rnd() * 2) - 1) * amount);
            data[i + c] = Math.max(0, Math.min(255, data[i + c] + delta));
        }
    }
}

const W = 420;
const H = 594;

// 1) Dokumen BW bersih.
{
    const data = image(W, H);
    rect(data, W, 45, 80, 375, 100, [25, 25, 25]);
    rect(data, W, 45, 130, 340, 146, [75, 75, 75]);
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'H');
    assert.equal(result.colorCoverage, 0);
}

// 2) Scan BW dengan paper cast hangat + noise RGB.
{
    const data = image(W, H, [247, 244, 239]);
    rect(data, W, 45, 80, 375, 100, [50, 47, 43]);
    rect(data, W, 45, 130, 340, 146, [90, 86, 80]);
    deterministicNoise(data, 4);
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'H');
    assert.ok(result.whiteBalanceApplied);
    assert.ok(result.colorCoverage < 0.35);
}

// 3) Halaman BW dengan logo biru kecil harus HW.
{
    const data = image(W, H);
    rect(data, W, 45, 80, 375, 100, [25, 25, 25]);
    rect(data, W, 30, 25, 90, 70, [30, 90, 220]);
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'HW');
    assert.ok(result.colorCoverage > 0.35);
}

// 4) Screenshot campuran dengan header biru + tombol hijau harus HW.
{
    const data = image(W, H);
    rect(data, W, 35, 60, 385, 360, [245, 245, 245]);
    rect(data, W, 35, 60, 385, 95, [30, 90, 220]);
    rect(data, W, 65, 140, 350, 155, [45, 45, 45]);
    rect(data, W, 290, 310, 355, 340, [25, 140, 90]);
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'HW');
}

// 5) Area foto berwarna besar harus W.
{
    const data = image(W, H);
    for (let y = 50; y < 520; y++) {
        for (let x = 25; x < 395; x++) {
            const i = ((y * W) + x) * 4;
            data[i] = (x * 3 + y) % 256;
            data[i + 1] = (x + y * 2) % 256;
            data[i + 2] = (x * 2 + y * 3) % 256;
        }
    }
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'W');
    assert.ok(result.colorCoverage >= 18);
}


// 6) Simulasi RGB subpixel fringe pada teks hitam: raw chroma tinggi, tetapi
// rata-rata lokal netral. Harus tetap H.
{
    const data = image(W, H);
    // Baris glyph hitam dengan fringe merah/biru 1px di sisi kiri/kanan.
    for (let row = 0; row < 18; row++) {
        const y0 = 60 + row * 24;
        for (let x = 55; x < 360; x += 18) {
            rect(data, W, x, y0, x + 1, y0 + 14, [80, 45, 45]);
            rect(data, W, x + 1, y0, x + 7, y0 + 14, [28, 28, 28]);
            rect(data, W, x + 7, y0, x + 8, y0 + 14, [45, 45, 80]);
        }
    }
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'H');
    assert.ok(result.rawColorCoverage > result.colorCoverage);
    assert.ok(result.fringeRejectedCoverage > 0);
}

// 7) Warna nyata yang tipis tetapi koheren (teks/garis biru) harus tetap HW.
{
    const data = image(W, H);
    rect(data, W, 45, 80, 375, 100, [25, 25, 25]);
    for (let y = 140; y < 160; y += 4) {
        rect(data, W, 80, y, 260, y + 2, [25, 85, 220]);
    }
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'HW');
    assert.ok(result.colorCoverage > 0.35);
}


// 8) Screenshot dengan panel pastel besar harus tetap terbaca sebagai warna,
// tetapi tidak otomatis menjadi W hanya karena area pastel luas.
{
    const data = image(W, H);
    rect(data, W, 45, 70, 375, 360, [251, 232, 231]);
    rect(data, W, 70, 100, 350, 120, [35, 35, 35]);
    rect(data, W, 65, 390, 355, 410, [35, 35, 35]);
    const result = analyzeImageData({ data }, W, H);
    assert.equal(result.type, 'HW');
    assert.ok(result.colorCoverage > 10);
    assert.ok(result.strongColorCoverage < 10);
}

// 9) Dua foto besar dengan margin putih: coverage warna halaman tidak harus >=18%,
// tetapi isi cukup padat, tersebar, dan memiliki bukti strong-color. Harus W.
{
    const result = classifyMetrics({
        colorCoverage: 16.54,
        strongColorCoverage: 3.89,
        inkCoverage: 35.24,
        colorInkRatio: 46.94,
        activeColorBlockCoverage: 33.95,
        activeStrongBlockCoverage: 12.5,
        rawColorCoverage: 16.6,
        fringeRejectedCoverage: 0.02,
    });
    assert.equal(result.type, 'W');
}

console.log('pixel-analyzer: 9/9 tests passed');
