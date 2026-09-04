import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.min.mjs';
import { analyzeImageData, DEFAULT_ANALYSIS_CONFIG } from './pixel-analyzer.js?v=1.7.3';
import { analyzeOperatorList, reconcilePageAnalysis } from './pdf-structure-analyzer.js?v=1.7.3';
import { adaptDocumentClassification } from './adaptive-classifier.js?v=1.7.3';
import { SCAN_PIXEL_CONFIG, isLikelyFullPageScan, reconcileScanClassification } from './scan-classifier.js?v=1.7.3';
import { calibrateDocumentDiagnostics } from './diagnostics.js?v=1.7.3';
import { buildPrintJob, chooseNupLayout, getNupSlotOrder, getSideAt, PRINT_JOB_DEFAULTS } from './print-job.js?v=1.7.3';
import { loadEffectivePricing, getMaterial, getSize, getPricingSelection } from './pricing-engine.js?v=1.7.3';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.min.mjs';

const CONFIG = window.PRINT_ANALYZER_CONFIG || {};
const MAX_SIZE = Number(CONFIG.maxFileSize) || (200 * 1024 * 1024);
const RENDER_MAX_DIMENSION = 1600;
const MIN_RENDER_SCALE = 0.8;
const MAX_RENDER_SCALE = 2.4;
const PREVIEW_MAX_DPR = 2;
const PREVIEW_MAX_CANVAS_DIMENSION = 8192;
const PREVIEW_MAX_CANVAS_PIXELS = 32 * 1024 * 1024;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const elements = {
    fileInput: $('#fileInput'),
    dropZone: $('#dropZone'),
    uploadText: $('#uploadText'),
    selectedFile: $('#selectedFile'),
    selectedFileName: $('#selectedFileName'),
    selectedFileMeta: $('#selectedFileMeta'),
    clearBtn: $('#clearBtn'),
    analyzeBtn: $('#analyzeBtn'),
    analyzeBtnLabel: $('#analyzeBtnLabel'),
    newAnalysisBtn: $('#newAnalysisBtn'),
    progressWrap: $('#analysisProgress'),
    progressBar: $('#analysisProgressBar'),
    progressText: $('#analysisProgressText'),
    progressValue: $('#analysisProgressValue'),
    previewSubtitle: $('#previewSubtitle'),
    previewEmpty: $('#previewEmpty'),
    pdfViewer: $('#pdfViewer'),
    previewCanvas: $('#previewCanvas'),
    canvasStage: $('#canvasStage'),
    canvasLoader: $('#canvasLoader'),
    prevPageBtn: $('#prevPageBtn'),
    nextPageBtn: $('#nextPageBtn'),
    pageInput: $('#pageInput'),
    pageTotal: $('#pageTotal'),
    zoomOutBtn: $('#zoomOutBtn'),
    zoomInBtn: $('#zoomInBtn'),
    zoomLabel: $('#zoomLabel'),
    resultEmpty: $('#resultEmpty'),
    resultContent: $('#resultContent'),
    resultSubtitle: $('#resultSubtitle'),
    totalCost: $('#totalCost'),
    resultFileMeta: $('#resultFileMeta'),
    hCount: $('#hCount'),
    hwCount: $('#hwCount'),
    wCount: $('#wCount'),
    hPrice: $('#hPrice'),
    hwPrice: $('#hwPrice'),
    wPrice: $('#wPrice'),
    visiblePageCount: $('#visiblePageCount'),
    pageResults: $('#pageResults'),
    printSettings: $('#printSettings'), mediaSource: $('#mediaSource'), printMaterial: $('#printMaterial'), paperSize: $('#paperSize'), pricingTierLabel: $('#pricingTierLabel'), mediaPriceHint: $('#mediaPriceHint'), layoutMode: $('#layoutMode'), pageRangeMode: $('#pageRangeMode'), pageRangeField: $('#pageRangeField'), pageRange: $('#pageRange'), pageSubset: $('#pageSubset'), pageOrder: $('#pageOrder'), pagesPerSideField: $('#pagesPerSideField'), pagesPerSide: $('#pagesPerSide'), nupOrderField: $('#nupOrderField'), nupOrder: $('#nupOrder'), sideMode: $('#sideMode'), flipField: $('#flipField'), duplexFlip: $('#duplexFlip'), sheetOrientation: $('#sheetOrientation'), bookletSettings: $('#bookletSettings'), bookletBinding: $('#bookletBinding'), printColorMode: $('#printColorMode'), sideColorSettings: $('#sideColorSettings'), frontColorMode: $('#frontColorMode'), backColorMode: $('#backColorMode'), backColorField: $('#backColorField'), printCopies: $('#printCopies'), collateCopies: $('#collateCopies'), pageBorder: $('#pageBorder'), jobMiniSummary: $('#jobMiniSummary'),
    previewTabs: $('#previewTabs'), documentPreviewTab: $('#documentPreviewTab'), printPreviewTab: $('#printPreviewTab'), printViewer: $('#printViewer'), prevPrintSideBtn: $('#prevPrintSideBtn'), nextPrintSideBtn: $('#nextPrintSideBtn'), printSideInput: $('#printSideInput'), printSideTotal: $('#printSideTotal'), printSideTitle: $('#printSideTitle'), printSidePages: $('#printSidePages'), printSideType: $('#printSideType'), printSideOverride: $('#printSideOverride'), printCanvasStage: $('#printCanvasStage'), printCanvasLoader: $('#printCanvasLoader'), printPreviewCanvas: $('#printPreviewCanvas'), printHint: $('#printHint'),
    jobSheetCount: $('#jobSheetCount'), jobSideCount: $('#jobSideCount'), jobMediaLabel: $('#jobMediaLabel'), jobTierLabel: $('#jobTierLabel'), jobNupLabel: $('#jobNupLabel'), jobCopiesLabel: $('#jobCopiesLabel'), jobColorSummary: $('#jobColorSummary'),
    copyrightYears: $('#copyrightYears'),
};

const state = {
    file: null,
    pdfData: null,
    loadingTask: null,
    pdf: null,
    previewRenderTask: null,
    previewRenderToken: 0,
    previewPage: 1,
    previewZoom: 1,
    analysis: null,
    resultFilter: 'ALL',
    selectedResultPage: null,
    analyzing: false,
    previewMode: 'document', printSettings: { ...PRINT_JOB_DEFAULTS }, printJob: null, printSideOverrides: {},
    printSheet: 1, printSide: 'front', printSideIndex: 1, printPreviewToken: 0, sourcePageAspect: 0.707,
    pricingConfig: null, pricingSelection: null,
};

function normalizeVisibleUrl() {
    const url = new URL(window.location.href);
    const cleanPath = url.pathname.replace(/\/index\.(?:php|html)$/i, '/');

    if (cleanPath !== url.pathname || url.search) {
        window.history.replaceState({}, document.title, cleanPath + url.hash);
    }
}

normalizeVisibleUrl();

function updateCopyrightYears() {
    if (!elements.copyrightYears) return;

    const startYear = Number(CONFIG.projectStartYear) || 2026;
    const currentYear = new Date().getFullYear();
    const safeCurrentYear = Math.max(startYear, currentYear);
    const range = safeCurrentYear > startYear
        ? `${startYear}–${safeCurrentYear}`
        : `${startYear}`;

    elements.copyrightYears.textContent = `© ${range}`;
}

updateCopyrightYears();

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / (1024 ** index);
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);
}

function formatPercent(value) {
    return `${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}


function getPrintableSides(job = state.printJob) {
    const out = [];
    for (const sheet of (job?.sheets || [])) {
        for (const sideName of ['front', 'back']) {
            const side = sheet?.[sideName];
            if (side?.pages?.some(Boolean)) out.push({ sheet: sheet.sheet, sideName, side });
        }
    }
    return out;
}

function syncInternalSideFromIndex() {
    const sides = getPrintableSides();
    if (!sides.length) {
        state.printSideIndex = 1;
        state.printSheet = 1;
        state.printSide = 'front';
        state.printSideIndex = 1;
        return null;
    }
    state.printSideIndex = clamp(state.printSideIndex, 1, sides.length);
    const item = sides[state.printSideIndex - 1];
    state.printSheet = item.sheet;
    state.printSide = item.sideName;
    return item;
}

function currentPricing() {
    if (!state.pricingConfig) return { prices: {H:300,HW:500,W:1000,duplexCredit:0}, tier:'normal', tierLabel:'Normal', material:null, size:null };
    return getPricingSelection(state.pricingConfig, elements.printMaterial?.value, elements.paperSize?.value, elements.mediaSource?.value || 'store');
}

function refreshPricingUi({refreshJob = true} = {}) {
    if (!state.pricingConfig || !elements.printMaterial || !elements.paperSize) return;
    const material = getMaterial(state.pricingConfig, elements.printMaterial.value);
    const previousSize = elements.paperSize.value;
    elements.paperSize.innerHTML = '';
    for (const size of (material?.sizes || [])) {
        const opt = document.createElement('option');
        opt.value = size.id; opt.textContent = size.label || size.id;
        elements.paperSize.appendChild(opt);
    }
    if ([...elements.paperSize.options].some(o => o.value === previousSize)) elements.paperSize.value = previousSize;
    const selection = currentPricing();
    state.pricingSelection = selection;
    elements.pricingTierLabel.textContent = `Tarif ${selection.tierLabel} · ${selection.mediaSourceLabel}`;
    elements.mediaPriceHint.textContent = `${selection.mediaSource === 'customer' ? 'Kertas pelanggan' : 'Media toko'} · ${selection.material?.name || '-'} · ${selection.size?.label || selection.size?.id || '-'} · H ${formatRupiah(selection.prices.H)} · HW ${formatRupiah(selection.prices.HW)} · W ${formatRupiah(selection.prices.W)}`;
    if (elements.hPrice) elements.hPrice.textContent = `${formatRupiah(selection.prices.H)}/sisi`;
    if (elements.hwPrice) elements.hwPrice.textContent = `${formatRupiah(selection.prices.HW)}/sisi`;
    if (elements.wPrice) elements.wPrice.textContent = `${formatRupiah(selection.prices.W)}/sisi`;
    if (elements.hPrice) elements.hPrice.textContent = `${formatRupiah(selection.prices.H)}/sisi`;
    if (elements.hwPrice) elements.hwPrice.textContent = `${formatRupiah(selection.prices.HW)}/sisi`;
    if (elements.wPrice) elements.wPrice.textContent = `${formatRupiah(selection.prices.W)}/sisi`;
    if (elements.sideMode) {
        const duplexAllowed = selection.material?.duplex !== false;
        [...elements.sideMode.options].forEach(o => { if (o.value !== 'simplex') o.disabled = !duplexAllowed; });
        if (!duplexAllowed && elements.sideMode.value !== 'simplex') elements.sideMode.value = 'simplex';
    }
    if (state.analysis) state.analysis.prices = {...selection.prices};
    if (refreshJob && state.pdf) refreshPrintJob({render: state.previewMode === 'print'});
}

async function initializePricing() {
    state.pricingConfig = await loadEffectivePricing();
    elements.printMaterial.innerHTML = '';
    for (const material of (state.pricingConfig.materials || [])) {
        const opt = document.createElement('option');
        opt.value = material.id; opt.textContent = material.name;
        elements.printMaterial.appendChild(opt);
    }
    refreshPricingUi({refreshJob:false});
}

function readPrintSettingsFromUi() {
    const sideMode = elements.sideMode?.value || 'simplex';
    return {
        layoutMode: elements.layoutMode?.value || 'normal',
        pageRangeMode: elements.pageRangeMode?.value || 'all',
        pageRange: elements.pageRange?.value || '',
        pageSubset: elements.pageSubset?.value || 'all',
        pageOrder: elements.pageOrder?.value || 'normal',
        pagesPerSide: Number(elements.pagesPerSide?.value) || 1,
        nupOrder: elements.nupOrder?.value || 'ltr',
        duplex: sideMode !== 'simplex',
        duplexMethod: sideMode === 'duplex-manual' ? 'manual' : 'auto',
        flip: elements.duplexFlip?.value || 'long',
        orientation: elements.sheetOrientation?.value || 'auto',
        bookletBinding: elements.bookletBinding?.value || 'left',
        colorMode: elements.printColorMode?.value || 'auto',
        frontColor: elements.frontColorMode?.value || 'auto',
        backColor: elements.backColorMode?.value || 'auto',
        copies: Number(elements.printCopies?.value) || 1,
        collate: Boolean(elements.collateCopies?.checked),
        pageBorder: Boolean(elements.pageBorder?.checked),
    };
}

function updatePrintSettingsVisibility() {
    if (!elements.sideMode) return;
    const booklet = elements.layoutMode?.value === 'booklet';

    if (booklet) {
        elements.pagesPerSide.value = '2';
        if (elements.sideMode.value === 'simplex') elements.sideMode.value = 'duplex-auto';
        elements.sheetOrientation.value = 'landscape';
        elements.duplexFlip.value = 'short';
    }

    const duplex = elements.sideMode.value !== 'simplex' || booklet;
    const nup = Number(elements.pagesPerSide.value) > 1;

    elements.pageRangeField.hidden = elements.pageRangeMode.value !== 'custom';
    elements.bookletSettings.hidden = !booklet;
    elements.pagesPerSide.disabled = booklet || state.analyzing;
    elements.sheetOrientation.disabled = booklet || state.analyzing;
    elements.duplexFlip.disabled = booklet || state.analyzing;
    elements.flipField.hidden = !duplex;
    elements.nupOrderField.hidden = booklet || !nup;
    elements.nupOrder.disabled = booklet || !nup || state.analyzing;
    if (elements.sideColorSettings) elements.sideColorSettings.hidden = true;
    elements.backColorField.hidden = !duplex;

    if (!duplex && state.printSide === 'back') state.printSide = 'front';
}

function writePrintSettingsToUi(x = PRINT_JOB_DEFAULTS) {
    if (!elements.pagesPerSide) return;
    elements.layoutMode.value = x.layoutMode || 'normal';
    elements.pageRangeMode.value = x.pageRangeMode || 'all';
    elements.pageRange.value = x.pageRange || '';
    elements.pageSubset.value = x.pageSubset || 'all';
    elements.pageOrder.value = x.pageOrder || 'normal';
    elements.pagesPerSide.value = String(x.pagesPerSide ?? 1);
    elements.nupOrder.value = x.nupOrder || 'ltr';
    elements.sideMode.value = x.duplex ? (x.duplexMethod === 'manual' ? 'duplex-manual' : 'duplex-auto') : 'simplex';
    elements.duplexFlip.value = x.flip || 'long';
    elements.sheetOrientation.value = x.orientation || 'auto';
    elements.bookletBinding.value = x.bookletBinding || 'left';
    elements.printColorMode.value = x.colorMode || 'auto';
    if (elements.frontColorMode) elements.frontColorMode.value = x.frontColor || 'auto';
    if (elements.backColorMode) elements.backColorMode.value = x.backColor || 'auto';
    elements.printCopies.value = String(x.copies || 1);
    elements.collateCopies.checked = x.collate !== false;
    elements.pageBorder.checked = x.pageBorder !== false;
    updatePrintSettingsVisibility();
}

function formatPrintMode(x) {
    if (x.layoutMode === 'booklet') {
        return `Booklet · 2-up · duplex ${x.duplexMethod === 'manual' ? 'manual' : 'otomatis'}`;
    }
    return `${x.pagesPerSide} halaman/sisi · ${x.duplex ? `2 sisi ${x.duplexMethod === 'manual' ? 'manual' : ''}`.trim() : '1 sisi'}`;
}

function sideOverrideKey(sheet = state.printSheet, side = state.printSide) {
    return `${Number(sheet) || 1}:${side === 'back' ? 'back' : 'front'}`;
}

function updatePrintJobUi() {
    const job = state.printJob;
    if (!job) return;
    const x = job.settings;
    const pricing = currentPricing();
    elements.jobMiniSummary.innerHTML = '';
    const title = document.createElement('strong');
    const details = document.createElement('span');
    title.textContent = formatPrintMode(x);

    const notes = [
        `${job.selectedPageCount}/${job.totalPages} halaman`,
        `${job.physicalSheets} lembar/rangkap`,
        `${x.copies}× = ${job.totalPhysicalSheets} lembar`,
    ];
    if (job.addedBlankPages > 0) notes.push(`+${job.addedBlankPages} halaman kosong booklet`);
    if (job.duplexCreditTotal > 0) notes.push(`kredit duplex ${formatRupiah(job.duplexCreditTotal)}/rangkap`);
    if (job.invalidRangeTokens.length) notes.push(`rentang diabaikan: ${job.invalidRangeTokens.join(', ')}`);
    notes.push(job.resolved ? formatRupiah(job.totalCost) : 'biaya menunggu analisis');
    details.textContent = notes.join(' · ');
    elements.jobMiniSummary.append(title, details);

    const sides = getPrintableSides(job);
    state.printSideIndex = clamp(state.printSideIndex, 1, Math.max(1, sides.length));
    elements.printSideTotal.textContent = String(sides.length);
    elements.printSideInput.max = String(Math.max(1, sides.length));
    elements.printSideInput.value = String(sides.length ? state.printSideIndex : 1);
    elements.prevPrintSideBtn.disabled = sides.length <= 1 || state.printSideIndex <= 1;
    elements.nextPrintSideBtn.disabled = sides.length <= 1 || state.printSideIndex >= sides.length;
    syncInternalSideFromIndex();

    if (state.analysis) {
        elements.jobSheetCount.textContent = String(job.totalPhysicalSheets);
        elements.jobSideCount.textContent = String(job.totalPrintedSides);
        elements.jobMediaLabel.textContent = `${pricing.mediaSource === 'customer' ? 'Pelanggan' : 'Toko'} · ${pricing.material?.name || '-'} · ${pricing.size?.label || pricing.size?.id || '-'}`;
        elements.jobTierLabel.textContent = pricing.tierLabel;
        elements.jobNupLabel.textContent = x.layoutMode === 'booklet' ? 'Booklet' : `${x.pagesPerSide}-up`;
        elements.jobCopiesLabel.textContent = `${x.copies}×${x.collate ? ' · collate' : ''}`;
        const extra = job.addedBlankPages > 0 ? ` · blank ${job.addedBlankPages}` : '';
        const productionColorMode = x.colorMode === 'bw' || (job.sideCounts.HW === 0 && job.sideCounts.W === 0)
            ? 'Hitam-Putih'
            : 'Auto Color';
        const customerColorLabel = x.colorMode === 'bw' ? 'Hitam-putih semua' : 'Sesuai warna dokumen';
        elements.jobColorSummary.textContent = job.resolved
            ? `Warna cetak: ${customerColorLabel} · H ${job.sideCounts.H} · HW ${job.sideCounts.HW} · W ${job.sideCounts.W} · Mode produksi: ${productionColorMode}${extra}`
            : `Analyzer sedang menentukan komposisi warna untuk kebutuhan cetak.${extra}`;
        if (job.resolved) elements.totalCost.textContent = formatRupiah(job.totalCost);
        elements.resultFileMeta.textContent = `${state.analysis.filename} · ${state.analysis.file_size} · ${formatPrintMode(x)}`;
    }
}

function refreshPrintJob({ render = true } = {}) {
    if (!state.pdf) {
        state.printJob = null;
        return;
    }
    updatePrintSettingsVisibility();
    state.printSettings = readPrintSettingsFromUi();
    state.printJob = buildPrintJob(
        state.pdf.numPages,
        state.printSettings,
        state.analysis,
        currentPricing().prices,
        state.printSideOverrides,
    );

    if (state.printJob.physicalSheets > 0) {
        state.printSideIndex = clamp(state.printSideIndex, 1, Math.max(1, getPrintableSides(state.printJob).length));
        syncInternalSideFromIndex();
    } else {
        state.printSheet = 1;
        state.printSide = 'front';
        state.printSideIndex = 1;
    }

    updatePrintJobUi();
    if (render && state.previewMode === 'print') renderPrintSidePreview();
}

function setPreviewMode(mode) {
    if (state.analyzing) return;
    const next = mode === 'print' ? 'print' : 'document';
    state.previewMode = next;
    const print = next === 'print';
    elements.pdfViewer.hidden = print || !state.pdf;
    elements.printViewer.hidden = !print || !state.pdf;
    elements.documentPreviewTab.classList.toggle('is-active', !print);
    elements.printPreviewTab.classList.toggle('is-active', print);
    elements.documentPreviewTab.setAttribute('aria-selected', String(!print));
    elements.printPreviewTab.setAttribute('aria-selected', String(print));
    if (print) {
        refreshPrintJob({ render: false });
        renderPrintSidePreview();
    } else if (state.pdf) {
        renderPreviewPage(state.previewPage);
    }
}

async function renderPdfPageToSlot(pageNumber, ctx, slot, gray, token, drawBorder = true) {
    if (!state.pdf || token !== state.printPreviewToken) return;
    const page = await state.pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const pad = Math.max(5, Math.round(Math.min(slot.width, slot.height) * 0.025));
    const availableWidth = Math.max(1, slot.width - pad * 2);
    const availableHeight = Math.max(1, slot.height - pad * 2);
    const scale = Math.min(availableWidth / base.width, availableHeight / base.height);
    const viewport = page.getViewport({ scale: Math.max(0.08, scale) });
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(viewport.width));
    tmp.height = Math.max(1, Math.round(viewport.height));
    const tmpCtx = tmp.getContext('2d', { alpha: false });
    tmpCtx.fillStyle = '#fff';
    tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
    await page.render({ canvasContext: tmpCtx, viewport, background: 'rgb(255,255,255)', intent: 'print' }).promise;
    page.cleanup();
    if (token !== state.printPreviewToken) return;

    const x = slot.x + (slot.width - tmp.width) / 2;
    const y = slot.y + (slot.height - tmp.height) / 2;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
    if (gray) ctx.filter = 'grayscale(1)';
    ctx.drawImage(tmp, x, y);
    ctx.restore();

    if (drawBorder) {
        ctx.save();
        ctx.strokeStyle = 'rgba(15,23,42,.22)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(slot.x + 0.75, slot.y + 0.75, slot.width - 1.5, slot.height - 1.5);
        ctx.restore();
    }
}

function renderEmptyPrintCanvas(message) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const stageWidth = Math.max(360, elements.printCanvasStage.clientWidth - 44);
    const width = Math.min(980, stageWidth);
    const height = width * 0.707;
    const canvas = elements.printPreviewCanvas;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 17px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(message, width / 2, height / 2);
}

async function renderPrintSidePreview() {
    if (!state.pdf || !state.printJob || state.previewMode !== 'print' || state.analyzing) return;
    const token = ++state.printPreviewToken;
    const job = state.printJob;
    const sides = getPrintableSides(job);

    elements.printCanvasLoader.hidden = false;
    if (!sides.length) {
        elements.printSideInput.value = '1';
        elements.printSideTotal.textContent = '0';
        elements.prevPrintSideBtn.disabled = true;
        elements.nextPrintSideBtn.disabled = true;
        elements.printSideTitle.textContent = 'Belum ada sisi cetak';
        elements.printSidePages.textContent = 'Periksa rentang/subset halaman.';
        elements.printSideType.textContent = '—';
        elements.printSideType.className = 'type-badge type-auto';
        elements.printSideOverride.value = 'auto';
        elements.printSideOverride.disabled = true;
        renderEmptyPrintCanvas('Tidak ada halaman yang dipilih untuk dicetak');
        elements.printHint.textContent = 'Rentang atau subset halaman saat ini menghasilkan 0 halaman.';
        elements.printCanvasLoader.hidden = true;
        return;
    }

    elements.printSideOverride.disabled = false;
    state.printSideIndex = clamp(state.printSideIndex, 1, sides.length);
    const item = syncInternalSideFromIndex();
    const side = item?.side || getSideAt(job, state.printSheet, state.printSide);

    elements.printSideInput.value = String(state.printSideIndex);
    elements.printSideTotal.textContent = String(sides.length);
    elements.prevPrintSideBtn.disabled = state.printSideIndex <= 1;
    elements.nextPrintSideBtn.disabled = state.printSideIndex >= sides.length;

    elements.printSideTitle.textContent = `Sisi Cetak ${state.printSideIndex}`;
    elements.printSidePages.textContent = side?.pages?.length
        ? side.pages.map(n => n ? `Hal. ${n}` : 'Kosong').join(' · ')
        : 'Sisi kosong';
    const type = side?.type || null;
    elements.printSideType.textContent = type || 'AUTO';
    elements.printSideType.className = `type-badge ${type ? `type-${type.toLowerCase()}` : 'type-auto'}`;
    elements.printSideType.title = side?.reason || 'Klasifikasi otomatis tersedia setelah analisis.';
    elements.printSideOverride.value = state.printSideOverrides[sideOverrideKey()] || 'auto';

    try {
        const layout = chooseNupLayout(job.settings.pagesPerSide, job.settings.orientation, state.sourcePageAspect);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const stageWidth = Math.max(360, elements.printCanvasStage.clientWidth - 44);
        const canvasWidth = Math.min(980, stageWidth);
        const canvasHeight = canvasWidth / layout.sheetAspect;
        const canvas = elements.printPreviewCanvas;
        canvas.width = Math.max(1, Math.round(canvasWidth * dpr));
        canvas.height = Math.max(1, Math.round(canvasHeight * dpr));
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const outer = Math.max(12, canvasWidth * 0.025);
        const gap = Math.max(8, canvasWidth * 0.012);
        const slotWidth = (canvasWidth - outer * 2 - gap * (layout.cols - 1)) / layout.cols;
        const slotHeight = (canvasHeight - outer * 2 - gap * (layout.rows - 1)) / layout.rows;
        const slots = [];
        for (let row = 0; row < layout.rows; row++) {
            for (let col = 0; col < layout.cols; col++) slots.push({x:outer + col*(slotWidth+gap),y:outer + row*(slotHeight+gap),width:slotWidth,height:slotHeight});
        }
        const slotOrder = job.settings.layoutMode === 'booklet' ? slots.map((_, i) => i) : getNupSlotOrder(layout.rows, layout.cols, job.settings.nupOrder);
        const gray = side.requestedMode === 'bw' || side.type === 'H';

        for (let i = 0; i < slots.length; i++) {
            if (token !== state.printPreviewToken) return;
            const pageNumber = side.pages[i] || null;
            const slot = slots[slotOrder[i] ?? i];
            if (pageNumber) await renderPdfPageToSlot(pageNumber, ctx, slot, gray, token, job.settings.pageBorder);
            else {
                ctx.save(); ctx.fillStyle='#fff'; ctx.fillRect(slot.x,slot.y,slot.width,slot.height);
                if (job.settings.pageBorder) { ctx.setLineDash([8,7]); ctx.strokeStyle='rgba(100,116,139,.34)'; ctx.strokeRect(slot.x+1,slot.y+1,slot.width-2,slot.height-2); }
                ctx.restore();
            }
        }

        const modeText = job.settings.layoutMode === 'booklet' ? `booklet · jilid ${job.settings.bookletBinding === 'right' ? 'kanan' : 'kiri'}` : `${job.settings.pagesPerSide}-up · ${job.settings.nupOrder}`;
        const duplexText = job.settings.duplex ? `duplex ${job.settings.duplexMethod === 'manual' ? 'manual' : 'otomatis'} · ${job.settings.flip === 'short' ? 'sisi pendek' : 'sisi panjang'}` : 'simplex';
        const blankText = job.addedBlankPages ? ` · ${job.addedBlankPages} blank otomatis` : '';
        elements.printHint.textContent = `Sisi ${state.printSideIndex}/${sides.length} · ${modeText} · ${layout.orientation} · ${duplexText}${blankText}. Urutan preview langsung mengikuti urutan sisi yang akan dicetak.`;
    } catch (error) {
        console.error('Simulasi hasil cetak gagal:', error);
        showToast('error', 'Simulasi sisi cetak gagal dirender');
    } finally {
        if (token === state.printPreviewToken) elements.printCanvasLoader.hidden = true;
    }
}

function sweetAlert(options) {
    if (window.Swal?.fire) {
        return window.Swal.fire({
            background: '#0f1a2c',
            color: '#eef4ff',
            confirmButtonColor: '#2f6bff',
            cancelButtonColor: '#334155',
            reverseButtons: true,
            ...options,
        });
    }

    // Fallback hanya jika CDN SweetAlert2 gagal dimuat.
    window.alert(options.text || options.title || 'Terjadi kesalahan.');
    return Promise.resolve({ isConfirmed: true });
}

function showToast(icon, title) {
    if (!window.Swal?.fire) return;

    window.Swal.fire({
        toast: true,
        position: 'top-end',
        icon,
        title,
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
        background: '#0f1a2c',
        color: '#eef4ff',
    });
}

function setProgress(percent, text) {
    const safePercent = clamp(Math.round(percent), 0, 100);
    elements.progressWrap.hidden = false;
    elements.progressBar.style.width = `${safePercent}%`;
    elements.progressText.textContent = text;
    elements.progressValue.textContent = `${safePercent}%`;
}

function resetProgress() {
    elements.progressWrap.hidden = true;
    elements.progressBar.style.width = '0%';
    elements.progressText.textContent = '';
    elements.progressValue.textContent = '0%';
}

function setAnalyzing(active) {
    state.analyzing = active;
    elements.analyzeBtn.disabled = active || !state.file || !state.pdf;
    elements.fileInput.disabled = active;
    elements.clearBtn.disabled = active;
    elements.prevPageBtn.disabled = active || state.previewPage <= 1;
    elements.nextPageBtn.disabled = active || !state.pdf || state.previewPage >= state.pdf.numPages;
    elements.pageInput.disabled = active || !state.pdf;
    elements.zoomOutBtn.disabled = active || !state.pdf;
    elements.zoomInBtn.disabled = active || !state.pdf;
    [elements.mediaSource,elements.printMaterial,elements.paperSize,elements.layoutMode,elements.pageRangeMode,elements.pageRange,elements.pageSubset,elements.pageOrder,elements.pagesPerSide,elements.nupOrder,elements.sideMode,elements.duplexFlip,elements.sheetOrientation,elements.bookletBinding,elements.printColorMode,elements.frontColorMode,elements.backColorMode,elements.printCopies,elements.collateCopies,elements.pageBorder,elements.printSideOverride].forEach(c=>{if(c)c.disabled=active;});
    if (!active) updatePrintSettingsVisibility();

    elements.analyzeBtn.classList.toggle('is-loading', active);
    elements.analyzeBtnLabel.textContent = active ? 'Sedang Menganalisis…' : 'Analisis Biaya Cetak';
}

function isPdf(file) {
    return Boolean(file && (
        file.type === 'application/pdf'
        || file.name.toLowerCase().endsWith('.pdf')
    ));
}

async function destroyPdf() {
    // Batalkan semua permintaan preview yang masih berjalan/menunggu.
    // Token mencegah render lama memperbarui canvas setelah file diganti.
    state.previewRenderToken += 1;

    if (state.previewRenderTask) {
        const task = state.previewRenderTask;
        try {
            task.cancel();
        } catch (_) {
            // noop
        }
        try {
            await task.promise;
        } catch (error) {
            if (error?.name !== 'RenderingCancelledException') {
                console.warn('Pembatalan preview PDF gagal:', error);
            }
        }
        if (state.previewRenderTask === task) state.previewRenderTask = null;
    }

    if (state.loadingTask) {
        try {
            if (typeof state.loadingTask.destroy === 'function' && !state.loadingTask.destroyed) {
                await state.loadingTask.destroy();
            }
        } catch (error) {
            console.warn('Cleanup PDF gagal:', error);
        }
    }

    state.loadingTask = null;
    state.pdf = null;
    state.pdfData = null;
}

function resetPreviewUi() {
    elements.canvasLoader.hidden = true;
    elements.previewEmpty.hidden = false;
    elements.pdfViewer.hidden = true;
    elements.printViewer.hidden = true;
    elements.previewTabs.hidden = true;
    elements.printSettings.hidden = true;
    elements.previewSubtitle.textContent = 'Belum ada file yang dipilih.';
    elements.previewCanvas.width = 1;
    elements.previewCanvas.height = 1;
    elements.pageInput.value = '1';
    elements.pageTotal.textContent = '0';
    elements.zoomLabel.textContent = '100%';
    state.previewPage = 1; state.previewZoom = 1; state.previewMode='document'; state.printSheet=1; state.printSide='front'; state.printSideIndex=1; state.printJob=null; state.printSideOverrides={}; state.printPreviewToken++; state.sourcePageAspect=.707; state.printSettings={...PRINT_JOB_DEFAULTS}; writePrintSettingsToUi(state.printSettings);
}

function resetResultUi() {
    state.analysis = null;
    state.resultFilter = 'ALL';
    state.selectedResultPage = null;
    elements.resultContent.hidden = true;
    elements.resultEmpty.hidden = false;
    elements.resultSubtitle.textContent = 'Hasil akan tampil tanpa memuat ulang halaman.';
    elements.pageResults.replaceChildren();
    elements.newAnalysisBtn.hidden = true;
    if(elements.jobSheetCount)elements.jobSheetCount.textContent='0';if(elements.jobSideCount)elements.jobSideCount.textContent='0';if(elements.jobNupLabel)elements.jobNupLabel.textContent='1-up';if(elements.jobCopiesLabel)elements.jobCopiesLabel.textContent='1×';if(elements.jobColorSummary)elements.jobColorSummary.textContent='Analyzer akan menghitung biaya warna tiap sisi secara otomatis.';
    $$('.filter-pill').forEach(button => button.classList.toggle('is-active', button.dataset.pageFilter === 'ALL'));
    $$('.stat-card').forEach(button => button.classList.remove('is-active'));
}

async function resetApplication({ confirm = false } = {}) {
    if (confirm && (state.file || state.analysis)) {
        const answer = await sweetAlert({
            icon: 'question',
            title: 'Analisis file baru?',
            text: 'File dan hasil analisis saat ini akan dibersihkan dari tampilan.',
            showCancelButton: true,
            confirmButtonText: 'Ya, lanjutkan',
            cancelButtonText: 'Batal',
        });
        if (!answer.isConfirmed) return;
    }

    await destroyPdf();
    state.file = null;
    state.analysis = null;
    elements.fileInput.value = '';
    elements.selectedFile.hidden = true;
    elements.uploadText.textContent = 'Klik atau seret PDF ke sini';
    resetProgress();
    resetPreviewUi();
    resetResultUi();
    setAnalyzing(false);
}

async function validateAndLoadFile(file) {
    if (!isPdf(file)) {
        await sweetAlert({
            icon: 'warning',
            title: 'Format tidak didukung',
            text: 'Print Cost Analyzer saat ini hanya menerima file PDF.',
            confirmButtonText: 'Mengerti',
        });
        return;
    }

    if (file.size > MAX_SIZE) {
        await sweetAlert({
            icon: 'warning',
            title: 'File terlalu besar',
            text: `Ukuran maksimum adalah ${formatBytes(MAX_SIZE)}. File ini berukuran ${formatBytes(file.size)}.`,
            confirmButtonText: 'Mengerti',
        });
        return;
    }

    await destroyPdf();
    resetResultUi();
    resetProgress();

    state.file = file;
    state.previewPage = 1;
    state.previewZoom = 1;

    elements.selectedFile.hidden = false;
    elements.selectedFileName.textContent = file.name;
    elements.selectedFileMeta.textContent = `${formatBytes(file.size)} · PDF`;
    elements.uploadText.textContent = 'File siap dipreview';
    elements.previewEmpty.hidden = true;
    elements.pdfViewer.hidden = false;
    elements.previewSubtitle.textContent = 'Membuka dokumen…';
    elements.canvasLoader.hidden = false;
    elements.analyzeBtn.disabled = true;

    try {
        state.pdfData = new Uint8Array(await file.arrayBuffer());
        state.loadingTask = pdfjsLib.getDocument({
            data: state.pdfData,
            isEvalSupported: false,
            useSystemFonts: true,
            verbosity: 0,
        });
        state.pdf = await state.loadingTask.promise;

        if (!state.pdf.numPages) {
            throw new Error('PDF tidak memiliki halaman yang dapat ditampilkan.');
        }

        elements.pageTotal.textContent = String(state.pdf.numPages);
        elements.pageInput.max = String(state.pdf.numPages);
        elements.previewSubtitle.textContent = `${state.pdf.numPages} halaman · ${formatBytes(file.size)}`;
        elements.previewTabs.hidden=false;elements.printSettings.hidden=false;state.previewMode='document';state.printSheet=1;state.printSide='front';state.printSideIndex=1;writePrintSettingsToUi(state.printSettings);
        try{const fp=await state.pdf.getPage(1);const fv=fp.getViewport({scale:1});state.sourcePageAspect=fv.width/Math.max(1,fv.height);fp.cleanup();}catch(_){state.sourcePageAspect=.707;}
        refreshPrintJob({render:false});

        await renderPreviewPage(1);
        setAnalyzing(false);
    } catch (error) {
        console.error(error);
        await destroyPdf();
        elements.canvasLoader.hidden = true;
        elements.pdfViewer.hidden = true; elements.printViewer.hidden=true; elements.previewTabs.hidden=true; elements.printSettings.hidden=true;
        elements.previewEmpty.hidden = false;
        elements.previewSubtitle.textContent = 'Preview gagal dimuat.';
        elements.analyzeBtn.disabled = true;

        let message = error?.message || 'PDF gagal dibuka.';
        if (/password/i.test(message)) {
            message = 'PDF dilindungi password dan belum dapat dianalisis.';
        }

        await sweetAlert({
            icon: 'error',
            title: 'PDF tidak dapat dibuka',
            text: message,
            confirmButtonText: 'Tutup',
        });
    }
}

async function renderPreviewPage(pageNumber) {
    if (!state.pdf || state.analyzing) return;

    const nextPage = clamp(Number(pageNumber) || 1, 1, state.pdf.numPages);
    const renderToken = ++state.previewRenderToken;
    state.previewPage = nextPage;

    if (state.analysis) {
        state.selectedResultPage = nextPage;
        syncSelectedResultRow({ scrollIntoView: true });
    }

    elements.pageInput.value = String(nextPage);
    elements.canvasLoader.hidden = false;

    // PDF.js tidak mengizinkan satu canvas dipakai oleh dua render bersamaan.
    // Batalkan render lama dan tunggu promise-nya benar-benar selesai sebelum
    // canvas yang sama dipakai kembali.
    if (state.previewRenderTask) {
        const previousTask = state.previewRenderTask;
        try {
            previousTask.cancel();
        } catch (_) {
            // noop
        }
        try {
            await previousTask.promise;
        } catch (error) {
            if (error?.name !== 'RenderingCancelledException') {
                console.warn('Render preview sebelumnya berhenti dengan error:', error);
            }
        }
        if (state.previewRenderTask === previousTask) state.previewRenderTask = null;
    }

    // Jika selama menunggu pembatalan muncul permintaan yang lebih baru,
    // hentikan permintaan ini agar tidak terjadi race pada canvas.
    if (renderToken !== state.previewRenderToken || !state.pdf || state.analyzing) return;

    let page = null;
    let renderTask = null;

    try {
        page = await state.pdf.getPage(nextPage);
        if (renderToken !== state.previewRenderToken) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const stageWidth = Math.max(320, elements.canvasStage.clientWidth - 40);
        const fitScale = stageWidth / Math.max(1, baseViewport.width);
        const displayScale = clamp(fitScale * state.previewZoom, 0.35, 3.5);
        const dpr = Math.min(PREVIEW_MAX_DPR, window.devicePixelRatio || 1);

        // Batasi dimensi bitmap agar PDF dengan ukuran halaman ekstrem tidak
        // melewati batas canvas browser. Tampilan CSS tetap mengikuti zoom.
        const cssViewport = page.getViewport({ scale: displayScale });
        const requestedWidth = Math.max(1, cssViewport.width * dpr);
        const requestedHeight = Math.max(1, cssViewport.height * dpr);
        const canvasSafetyScale = Math.min(
            1,
            PREVIEW_MAX_CANVAS_DIMENSION / requestedWidth,
            PREVIEW_MAX_CANVAS_DIMENSION / requestedHeight,
            Math.sqrt(PREVIEW_MAX_CANVAS_PIXELS / Math.max(1, requestedWidth * requestedHeight)),
        );
        const renderScale = Math.max(0.05, displayScale * dpr * canvasSafetyScale);
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = elements.previewCanvas;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Canvas 2D tidak tersedia pada browser ini.');

        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
            canvasContext: ctx,
            viewport,
            background: 'rgb(255,255,255)',
            intent: 'display',
        });
        state.previewRenderTask = renderTask;

        await renderTask.promise;

        if (renderToken !== state.previewRenderToken) return;
        updatePreviewControls();
    } catch (error) {
        const cancelled = error?.name === 'RenderingCancelledException';
        const superseded = renderToken !== state.previewRenderToken;

        if (!cancelled && !superseded) {
            console.error('Preview render gagal:', error);
            showToast('error', `Preview halaman gagal dirender${error?.message ? `: ${error.message}` : ''}`);
        }
    } finally {
        if (state.previewRenderTask === renderTask) state.previewRenderTask = null;
        try { page?.cleanup(); } catch (_) { /* noop */ }
        if (renderToken === state.previewRenderToken) elements.canvasLoader.hidden = true;
    }
}

function updatePreviewControls() {
    if (!state.pdf) return;
    elements.prevPageBtn.disabled = state.analyzing || state.previewPage <= 1;
    elements.nextPageBtn.disabled = state.analyzing || state.previewPage >= state.pdf.numPages;
    elements.pageInput.value = String(state.previewPage);
    elements.zoomLabel.textContent = `${Math.round(state.previewZoom * 100)}%`;
}

async function inspectPageStructure(page, baseViewport) {
    try {
        const operatorList = await page.getOperatorList({ intent: 'print' });
        return analyzeOperatorList(operatorList, pdfjsLib.OPS, {
            pageWidth: baseViewport?.width || 0,
            pageHeight: baseViewport?.height || 0,
        });
    } catch (error) {
        console.warn('Analisis struktur PDF dilewati:', error);
        return {
            available: false,
            hasRasterImage: false,
            rasterImageOps: 0,
            rasterImageOpsWithArea: 0,
            rasterImagePaintArea: 0,
            rasterImageAreaCoverage: 0,
            hasChromaticVector: false,
            chromaticColorOps: 0,
            achromaticColorOps: 0,
            chromaticPaintOps: 0,
            achromaticPaintOps: 0,
            visibleTextPaintOps: 0,
            unknownPaintOps: 0,
            hasComplexPaint: false,
            complexPaintOps: 0,
            colorSpaceOps: 0,
            unknownColorOps: 0,
        };
    }
}

async function renderAndAnalyzePage(page, pageNumber) {
    const baseViewport = page.getViewport({ scale: 1 });
    const maxBaseDimension = Math.max(baseViewport.width, baseViewport.height);
    const renderScale = clamp(
        RENDER_MAX_DIMENSION / Math.max(maxBaseDimension, 1),
        MIN_RENDER_SCALE,
        MAX_RENDER_SCALE
    );

    const viewport = page.getViewport({ scale: renderScale });
    const renderCanvas = document.createElement('canvas');
    const renderContext2d = renderCanvas.getContext('2d', { alpha: false, willReadFrequently: false });

    renderCanvas.width = Math.max(1, Math.round(viewport.width));
    renderCanvas.height = Math.max(1, Math.round(viewport.height));

    await page.render({
        canvasContext: renderContext2d,
        viewport,
        background: 'rgb(255,255,255)',
        intent: 'print',
    }).promise;

    const maxDimension = Math.max(renderCanvas.width, renderCanvas.height);
    const downscale = Math.min(1, DEFAULT_ANALYSIS_CONFIG.analysisMaxDimension / maxDimension);
    const analysisWidth = Math.max(1, Math.round(renderCanvas.width * downscale));
    const analysisHeight = Math.max(1, Math.round(renderCanvas.height * downscale));
    const analysisCanvas = document.createElement('canvas');
    const analysisContext = analysisCanvas.getContext('2d', { alpha: false, willReadFrequently: true });

    analysisCanvas.width = analysisWidth;
    analysisCanvas.height = analysisHeight;
    analysisContext.fillStyle = '#ffffff';
    analysisContext.fillRect(0, 0, analysisWidth, analysisHeight);
    analysisContext.imageSmoothingEnabled = true;
    analysisContext.imageSmoothingQuality = 'high';
    analysisContext.drawImage(renderCanvas, 0, 0, analysisWidth, analysisHeight);

    const imageData = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight);

    let textItems = 0;
    try {
        const textContent = await page.getTextContent({ disableNormalization: true });
        textItems = Array.isArray(textContent.items) ? textContent.items.length : 0;
    } catch (_) {
        textItems = 0;
    }

    const structure = await inspectPageStructure(page, baseViewport);
    const fullPageScan = isLikelyFullPageScan(structure, textItems);
    let pixelAnalysis = analyzeImageData(
        imageData,
        analysisWidth,
        analysisHeight,
        fullPageScan ? SCAN_PIXEL_CONFIG : {}
    );
    if (fullPageScan) {
        pixelAnalysis = reconcileScanClassification(pixelAnalysis);
    }
    const analysis = reconcilePageAnalysis(pixelAnalysis, structure, textItems);

    renderCanvas.width = 1;
    renderCanvas.height = 1;
    analysisCanvas.width = 1;
    analysisCanvas.height = 1;
    page.cleanup();

    return {
        page: pageNumber,
        type: analysis.type,
        color_coverage: analysis.colorCoverage,
        strong_color_coverage: analysis.strongColorCoverage,
        ink_coverage: analysis.inkCoverage,
        color_ink_ratio: analysis.colorInkRatio,
        active_color_blocks: analysis.activeColorBlockCoverage,
        confidence: analysis.confidence,
        white_balance: analysis.whiteBalanceApplied,
        p95_chroma: analysis.p95InkChroma,
        raw_color_coverage: analysis.rawColorCoverage || 0,
        fringe_rejected: analysis.fringeRejectedCoverage || 0,
        text_items: textItems,
        semantic_override: !!analysis.semanticOverride,
        native_black: !!analysis.nativeBlack,
        analysis_source: analysis.analysisSource || 'pixel-fallback',
        raster_images: structure.rasterImageOps,
        raster_images_with_area: structure.rasterImageOpsWithArea || 0,
        raster_image_area: analysis.rasterImageAreaCoverage || structure.rasterImageAreaCoverage || 0,
        raster_color_density: analysis.rasterColorDensity || 0,
        raster_strong_density: analysis.rasterStrongColorDensity || 0,
        vector_color_ops: structure.chromaticColorOps,
        vector_paint_ops: structure.chromaticPaintOps,
        achromatic_color_ops: structure.achromaticColorOps,
        achromatic_paint_ops: structure.achromaticPaintOps,
        visible_text_paint_ops: structure.visibleTextPaintOps,
        unknown_paint_ops: structure.unknownPaintOps,
        color_space_ops: structure.colorSpaceOps,
        unknown_color_ops: structure.unknownColorOps,
        complex_paint_ops: structure.complexPaintOps,
        structure_available: structure.available,
        full_page_scan: fullPageScan,
        scan_residual_suppressed: !!analysis.scanResidualSuppressed,
        reason: analysis.reason,
    };
}

async function analyzePdf() {
    if (!state.file || !state.pdf) {
        throw new Error('Pilih file PDF terlebih dahulu.');
    }

    const totalPages = state.pdf.numPages;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        const percent = 4 + Math.round(((pageNumber - 1) / totalPages) * 90);
        setProgress(percent, `Menganalisis halaman ${pageNumber} dari ${totalPages}…`);
        const page = await state.pdf.getPage(pageNumber);
        pages.push(await renderAndAnalyzePage(page, pageNumber));

        // Memberi kesempatan UI memperbarui progress pada dokumen panjang.
        if (pageNumber % 4 === 0) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }

    setProgress(94, 'Mengkalibrasi karakter dokumen…');
    const adaptive = adaptDocumentClassification(pages);
    const diagnostics = calibrateDocumentDiagnostics(adaptive.pages, adaptive.profile);

    return {
        action: 'save_client_analysis',
        filename: state.file.name,
        file_type: 'PDF',
        file_size_bytes: state.file.size,
        total_pages: totalPages,
        engine: `PDF.js 6.2.108 + Coherent-Color + Scan-Aware + Raster-Footprint + Adaptive Document Analyzer + Diagnostics ${CONFIG.analyzerVersion || '1.5.0'}`,
        document_profile: diagnostics.profile,
        pages: diagnostics.pages,
    };
}

async function saveAnalysis(payload) {
    setProgress(96, 'Memvalidasi hasil dan menghitung biaya di browser…');
    const pages = Array.isArray(payload.pages) ? payload.pages : [];
    if (!pages.length) throw new Error('Tidak ada halaman valid untuk dianalisis.');
    const counts = {H:0, HW:0, W:0};
    for (const page of pages) {
        const type = ['H','HW','W'].includes(page.type) ? page.type : 'H';
        page.type = type;
        counts[type]++;
    }
    const pricing = currentPricing();
    return {
        filename: payload.filename || 'document.pdf',
        file_type: 'PDF',
        file_size: formatBytes(payload.file_size_bytes || 0),
        file_size_bytes: payload.file_size_bytes || 0,
        total_pages: pages.length,
        pages,
        h_count: counts.H,
        hw_count: counts.HW,
        w_count: counts.W,
        total_cost: counts.H*pricing.prices.H + counts.HW*pricing.prices.HW + counts.W*pricing.prices.W,
        prices: {...pricing.prices},
        engine: payload.engine,
        ui_version: CONFIG.version || '1.7.3',
        document_profile: {
            ...payload.document_profile,
            document_mode: payload.document_profile?.documentMode || payload.document_profile?.document_mode || 'Native/Mixed PDF'
        },
        analysis_basis: 'Analisis 100% client-side; Advanced Print Modes + static pricing 1.7.3 + customer-supplied media + simplified customer color choices.'
    };
}

function renderResults(analysis) {
    state.analysis = analysis;
    state.resultFilter = 'ALL';
    state.selectedResultPage = state.previewPage;

    elements.resultEmpty.hidden = true;
    elements.resultContent.hidden = false;
    elements.newAnalysisBtn.hidden = false;
    const documentMode = analysis.document_profile?.document_mode || 'PDF';
    elements.resultSubtitle.textContent = `${analysis.total_pages} halaman · ${documentMode}`;
    elements.totalCost.textContent = formatRupiah(analysis.total_cost);
    elements.resultFileMeta.textContent = `${analysis.filename} · ${analysis.file_size}`;
    elements.hCount.textContent = analysis.h_count;
    elements.hwCount.textContent = analysis.hw_count;
    elements.wCount.textContent = analysis.w_count;
    elements.hPrice.textContent = `${formatRupiah(analysis.prices?.H || 300)}/sisi`;
    elements.hwPrice.textContent = `${formatRupiah(analysis.prices?.HW || 500)}/sisi`;
    elements.wPrice.textContent = `${formatRupiah(analysis.prices?.W || 1000)}/sisi`;

    $$('.filter-pill').forEach(button => button.classList.toggle('is-active', button.dataset.pageFilter === 'ALL'));
    $$('.stat-card').forEach(button => button.classList.remove('is-active'));
    refreshPrintJob({render:state.previewMode==='print'});
    renderPageResults();
}

function renderPageResults() {
    if (!state.analysis) return;

    const pages = state.analysis.pages.filter(page => (
        state.resultFilter === 'ALL' || page.type === state.resultFilter
    ));

    elements.visiblePageCount.textContent = `${pages.length} halaman`;
    const fragment = document.createDocumentFragment();

    for (const page of pages) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'page-result-row';
        row.dataset.page = String(page.page);
        row.title = `Tampilkan halaman ${page.page} di preview`;
        const isSelected = Number(page.page) === Number(state.selectedResultPage);
        row.classList.toggle('is-selected', isSelected);
        if (isSelected) {
            row.setAttribute('aria-current', 'page');
        }

        const top = document.createElement('div');
        top.className = 'page-result-top';

        const number = document.createElement('strong');
        number.textContent = `Hal. ${page.page}`;

        const type = document.createElement('span');
        type.className = `type-badge type-${page.type.toLowerCase()}`;
        type.textContent = page.type;

        const confidence = document.createElement('span');
        confidence.className = 'page-confidence';
        confidence.textContent = `${page.confidence}% yakin`;
        confidence.title = `Confidence ${page.confidence}% · ${page.confidence_level || '—'}`;

        top.append(number, type, confidence);

        const metrics = document.createElement('div');
        metrics.className = 'page-result-metrics';
        metrics.textContent = `Warna ${formatPercent(page.color_coverage)} · Isi ${formatPercent(page.ink_coverage)} · Warna/isi ${formatPercent(page.color_ink_ratio)}`;

        const source = document.createElement('div');
        source.className = 'page-result-source';
        const flags = [];
        if (page.analysis_mode) flags.push(page.analysis_mode);
        if (page.white_balance) flags.push('cast dikoreksi');
        if (page.fringe_rejected > 0.05) flags.push(`fringe −${formatPercent(page.fringe_rejected)}`);
        if (!page.full_page_scan && page.raster_image_area > 0.5) flags.push(`area gambar ${formatPercent(page.raster_image_area)}`);
        if (page.scan_residual_suppressed) flags.push('noise scan ditekan');
        if (page.adaptive_score > 0) flags.push(`skor adaptif ${Number(page.adaptive_score).toFixed(3)}`);
        if (page.adaptive_changed) flags.push('dikoreksi adaptif');
        source.textContent = flags.join(' · ') || 'Analisis piksel';
        source.title = page.analysis_source ? `Sumber internal: ${page.analysis_source}` : '';

        const reason = document.createElement('div');
        reason.className = 'page-result-reason';
        reason.textContent = page.diagnostic_reason || page.reason || '';

        row.append(top, metrics, source, reason);
        fragment.appendChild(row);
    }

    elements.pageResults.replaceChildren(fragment);
    syncSelectedResultRow();
}

function syncSelectedResultRow({ scrollIntoView = false } = {}) {
    if (!elements.pageResults) return;

    const selectedPage = Number(state.selectedResultPage);
    let selectedRow = null;

    elements.pageResults.querySelectorAll('.page-result-row').forEach(row => {
        const isSelected = Number(row.dataset.page) === selectedPage;
        row.classList.toggle('is-selected', isSelected);
        if (isSelected) {
            row.setAttribute('aria-current', 'page');
            selectedRow = row;
        } else {
            row.removeAttribute('aria-current');
        }
    });

    if (scrollIntoView && selectedRow) {
        selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

async function jumpToResultPage(pageNumber) {
    if (!state.pdf) return;
    setPreviewMode('document');
    state.selectedResultPage = clamp(Number(pageNumber) || 1, 1, state.pdf.numPages);
    syncSelectedResultRow();
    state.previewZoom = 1;
    updatePreviewControls();
    await renderPreviewPage(pageNumber);
    elements.canvasStage.scrollTo({ top: 0, left: 0, behavior: 'smooth' });

    if (window.innerWidth < 900) {
        document.querySelector('.preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function runAnalysis() {
    if (state.analyzing || !state.file || !state.pdf) return;

    setAnalyzing(true);
    setProgress(2, 'Menyiapkan analisis…');

    try {
        const payload = await analyzePdf();
        const analysis = await saveAnalysis(payload);
        setProgress(100, 'Analisis selesai');
        renderResults(analysis);
        showToast('success', 'Analisis berhasil diselesaikan');
    } catch (error) {
        console.error(error);
        resetProgress();

        let message = error?.message || 'Terjadi kesalahan saat menganalisis PDF.';
        if (/password/i.test(message)) {
            message = 'PDF dilindungi password dan belum dapat dianalisis.';
        }

        await sweetAlert({
            icon: 'error',
            title: 'Analisis gagal',
            text: message,
            confirmButtonText: 'Tutup',
        });
    } finally {
        setAnalyzing(false);
    }
}

// Upload dan drag-drop.
elements.fileInput.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    await validateAndLoadFile(file);
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        event.stopPropagation();
    });
});

['dragenter', 'dragover'].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, () => elements.dropZone.classList.add('is-dragging'));
});

['dragleave', 'drop'].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, () => elements.dropZone.classList.remove('is-dragging'));
});

elements.dropZone.addEventListener('drop', async event => {
    if (state.analyzing) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await validateAndLoadFile(file);
});

elements.dropZone.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !state.analyzing) {
        event.preventDefault();
        elements.fileInput.click();
    }
});

elements.clearBtn.addEventListener('click', () => resetApplication({ confirm: true }));
elements.newAnalysisBtn.addEventListener('click', () => resetApplication({ confirm: true }));
elements.analyzeBtn.addEventListener('click', runAnalysis);

// Preview navigation.
elements.prevPageBtn.addEventListener('click', () => renderPreviewPage(state.previewPage - 1));
elements.nextPageBtn.addEventListener('click', () => renderPreviewPage(state.previewPage + 1));
elements.pageInput.addEventListener('change', () => renderPreviewPage(elements.pageInput.value));
elements.pageInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        elements.pageInput.blur();
        renderPreviewPage(elements.pageInput.value);
    }
});

elements.zoomOutBtn.addEventListener('click', () => {
    state.previewZoom = clamp(state.previewZoom - 0.15, 0.5, 2.5);
    updatePreviewControls();
    renderPreviewPage(state.previewPage);
});

elements.zoomInBtn.addEventListener('click', () => {
    state.previewZoom = clamp(state.previewZoom + 0.15, 0.5, 2.5);
    updatePreviewControls();
    renderPreviewPage(state.previewPage);
});

// Hasil dan filter.
$$('.filter-pill').forEach(button => {
    button.addEventListener('click', () => {
        state.resultFilter = button.dataset.pageFilter || 'ALL';
        $$('.filter-pill').forEach(item => item.classList.toggle('is-active', item === button));
        $$('.stat-card').forEach(item => item.classList.toggle('is-active', item.dataset.filter === state.resultFilter));
        renderPageResults();
    });
});

$$('.stat-card').forEach(button => {
    button.addEventListener('click', () => {
        const filter = button.dataset.filter || 'ALL';
        state.resultFilter = filter;
        $$('.stat-card').forEach(item => item.classList.toggle('is-active', item === button));
        $$('.filter-pill').forEach(item => item.classList.toggle('is-active', item.dataset.pageFilter === filter));
        renderPageResults();
    });
});

elements.pageResults.addEventListener('click', event => {
    const row = event.target.closest('.page-result-row');
    if (!row) return;
    jumpToResultPage(Number(row.dataset.page));
});

elements.documentPreviewTab.addEventListener('click', () => setPreviewMode('document'));
elements.printPreviewTab.addEventListener('click', () => setPreviewMode('print'));

const structuralPrintControls = [
    elements.layoutMode, elements.pageRangeMode, elements.pageRange, elements.pageSubset,
    elements.pageOrder, elements.pagesPerSide, elements.nupOrder, elements.sideMode,
];
structuralPrintControls.forEach(control => control?.addEventListener('change', () => {
    state.printSideOverrides = {};
    state.printSheet = 1;
    state.printSide = 'front';
    state.printSideIndex = 1;
    updatePrintSettingsVisibility();
    refreshPrintJob({ render: true });
}));

[
    elements.duplexFlip, elements.sheetOrientation, elements.bookletBinding,
    elements.printColorMode, elements.frontColorMode, elements.backColorMode,
    elements.collateCopies, elements.pageBorder,
].forEach(control => control?.addEventListener('change', () => {
    if (control === elements.printColorMode) {
        const help = document.querySelector('#printColorHelp');
        if (help) help.textContent = elements.printColorMode.value === 'bw'
            ? 'Seluruh dokumen akan dihitung dan dicetak hitam-putih, meskipun file asli memiliki warna.'
            : 'Direkomendasikan. Warna pada file dipertahankan dan biaya dihitung otomatis dari isi setiap sisi.';
    }
    updatePrintSettingsVisibility();
    refreshPrintJob({ render: true });
}));

elements.printCopies?.addEventListener('change', () => {
    elements.printCopies.value = String(Math.round(clamp(Number(elements.printCopies.value) || 1, 1, 999)));
    refreshPrintJob({ render: false });
});

elements.printSideOverride?.addEventListener('change', () => {
    const key = sideOverrideKey();
    const value = elements.printSideOverride.value;
    if (['H', 'HW', 'W'].includes(value)) state.printSideOverrides[key] = value;
    else delete state.printSideOverrides[key];
    updatePrintSettingsVisibility();
    refreshPrintJob({ render: true });
});

elements.prevPrintSideBtn?.addEventListener('click', () => {
    state.printSideIndex = clamp(state.printSideIndex - 1, 1, Math.max(1, getPrintableSides().length));
    syncInternalSideFromIndex();
    renderPrintSidePreview();
});
elements.nextPrintSideBtn?.addEventListener('click', () => {
    state.printSideIndex = clamp(state.printSideIndex + 1, 1, Math.max(1, getPrintableSides().length));
    syncInternalSideFromIndex();
    renderPrintSidePreview();
});
elements.printSideInput?.addEventListener('change', () => {
    state.printSideIndex = clamp(Number(elements.printSideInput.value) || 1, 1, Math.max(1, getPrintableSides().length));
    syncInternalSideFromIndex();
    renderPrintSidePreview();
});
elements.printSideInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        elements.printSideInput.blur();
        state.printSideIndex = clamp(Number(elements.printSideInput.value) || 1, 1, Math.max(1, getPrintableSides().length));
        syncInternalSideFromIndex();
        renderPrintSidePreview();
    }
});


elements.mediaSource?.addEventListener('change', () => {
    state.printSideOverrides = {};
    state.printSideIndex = 1;
    refreshPricingUi({refreshJob:true});
});
elements.printMaterial?.addEventListener('change', () => {
    state.printSideOverrides = {};
    state.printSideIndex = 1;
    refreshPricingUi({refreshJob:true});
});
elements.paperSize?.addEventListener('change', () => {
    state.printSideOverrides = {};
    state.printSideIndex = 1;
    const selection = currentPricing();
    state.pricingSelection = selection;
    elements.pricingTierLabel.textContent = `Tarif ${selection.tierLabel} · ${selection.mediaSourceLabel}`;
    elements.mediaPriceHint.textContent = `${selection.mediaSource === 'customer' ? 'Kertas pelanggan' : 'Media toko'} · ${selection.material?.name || '-'} · ${selection.size?.label || selection.size?.id || '-'} · H ${formatRupiah(selection.prices.H)} · HW ${formatRupiah(selection.prices.HW)} · W ${formatRupiah(selection.prices.W)}`;
    if (state.analysis) state.analysis.prices = {...selection.prices};
    refreshPrintJob({render:true});
});

let resizeTimer = null;
window.addEventListener('resize', () => {
    if (!state.pdf || state.analyzing) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if(state.previewMode==='print')renderPrintSidePreview(); else renderPreviewPage(state.previewPage); }, 180);
});

window.addEventListener('beforeunload', () => {
    if (state.loadingTask && typeof state.loadingTask.destroy === 'function' && !state.loadingTask.destroyed) {
        state.loadingTask.destroy().catch(() => {});
    }
});

resetPreviewUi();
resetResultUi();
setAnalyzing(false);
initializePricing().catch(error => { console.error(error); showToast('error', 'Konfigurasi tarif gagal dimuat'); });
