import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.min.mjs';
import { analyzeImageData, DEFAULT_ANALYSIS_CONFIG } from './pixel-analyzer.js?v=2.11.0';
import { analyzeOperatorList, reconcilePageAnalysis } from './pdf-structure-analyzer.js?v=2.11.0';
import { adaptDocumentClassification } from './adaptive-classifier.js?v=2.11.0';
import { SCAN_PIXEL_CONFIG, isLikelyFullPageScan, reconcileScanClassification } from './scan-classifier.js?v=2.11.0';
import { calibrateDocumentDiagnostics } from './diagnostics.js?v=2.11.0';
import { buildPrintJob, chooseNupLayout, getNupSlotOrder, getSideAt, PRINT_JOB_DEFAULTS } from './print-job.js?v=2.11.0';
import { loadEffectivePricing, getMaterial, getSize, getPricingSelection } from './pricing-engine.js?v=2.11.0';
import { initLive3D } from './live-3d-preview.js?v=2.11.0';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.min.mjs';

const CONFIG = window.PRINT_ANALYZER_CONFIG || {};
const MAX_SIZE = Number(CONFIG.maxFileSize) || (200 * 1024 * 1024);
const RENDER_MAX_DIMENSION = 1600;
const MIN_RENDER_SCALE = 0.8;
const MAX_RENDER_SCALE = 2.4;
const PREVIEW_MAX_DPR = 2;
const PREVIEW_MAX_CANVAS_DIMENSION = 8192;
const PREVIEW_MAX_CANVAS_PIXELS = 32 * 1024 * 1024;
const PDF_CSS_UNITS = 96 / 72;

// Physical media dimensions are used only for technical/live preview geometry.
// Pricing remains driven by data/pricing-config.json.
const MEDIA_SIZE_MM = Object.freeze({
    A7: [74, 105],
    A6: [105, 148],
    A5: [148, 210],
    B5: [176, 250],
    A4: [210, 297],
    A4s: [210, 330],
    F4: [215.9, 330],
    Folio: [215.9, 330],
    B4: [250, 353],
    A3: [297, 420],
    'A3+': [329, 483],
});

function getMediaDimensionsMm(sizeId, orientation = 'portrait') {
    const base = MEDIA_SIZE_MM[sizeId] || MEDIA_SIZE_MM.A4;
    const landscape = orientation === 'landscape';
    return landscape ? { width: base[1], height: base[0] } : { width: base[0], height: base[1] };
}

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const elements = {
    fileInput: $('#fileInput'),
    uploadPanel: $('.upload-panel'),
    dropZone: $('#dropZone'),
    sourceTabs: $('#sourceTabs'),
    sourceDocumentTab: $('#sourceDocumentTab'),
    sourcePagesTab: $('#sourcePagesTab'),
    sourceDocumentView: $('#sourceDocumentView'),
    sourcePagesView: $('#sourcePagesView'),
    sourceThumbnailList: $('#sourceThumbnailList'),
    sourceThumbnailStatus: $('#sourceThumbnailStatus'),
    uploadText: $('#uploadText'),
    selectedFile: $('#selectedFile'),
    selectedFileName: $('#selectedFileName'),
    selectedFileMeta: $('#selectedFileMeta'),
    fileBadge: $('#fileBadge'),
    clearBtn: $('#clearBtn'),
    changeFileBtn: $('#changeFileBtn'),
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
    firstPageBtn: $('#firstPageBtn'),
    prevPageBtn: $('#prevPageBtn'),
    nextPageBtn: $('#nextPageBtn'),
    lastPageBtn: $('#lastPageBtn'),
    pageInput: $('#pageInput'),
    pageTotal: $('#pageTotal'),
    zoomOutBtn: $('#zoomOutBtn'),
    zoomInBtn: $('#zoomInBtn'),
    zoomLabel: $('#zoomLabel'),
    fitPageBtn: $('#fitPageBtn'),
    fitWidthBtn: $('#fitWidthBtn'),
    actualSizeBtn: $('#actualSizeBtn'),
    rotatePreviewBtn: $('#rotatePreviewBtn'),
    resultEmpty: $('#resultEmpty'),
    resultContent: $('#resultContent'),
    resultSubtitle: $('#resultSubtitle'),
    totalCost: $('#totalCost'),
    resultFileMeta: $('#resultFileMeta'),
    allCount: $('#allCount'),
    hCount: $('#hCount'),
    hwCount: $('#hwCount'),
    wCount: $('#wCount'),
    dCount: $('#dCount'),
    hPrice: $('#hPrice'),
    hwPrice: $('#hwPrice'),
    wPrice: $('#wPrice'),
    dPrice: $('#dPrice'),
    workbench: $('#workbench'),
    workspaceActions: $('#workspaceActions'), openSettingsBtn: $('#openSettingsBtn'), openPreviewBtn: $('#openPreviewBtn'), openResultsBtn: $('#openResultsBtn'),
    settingsDialog: $('#settingsDialog'), previewDialog: $('#previewDialog'), resultDialog: $('#resultDialog'),
    visiblePageCount: $('#visiblePageCount'),
    pageResults: $('#pageResults'),
    settingsEmpty: $('#settingsEmpty'),
    printSettings: $('#printSettings'), presetSelect: $('#presetSelect'), scaleMode: $('#scaleMode'), customScaleField: $('#customScaleField'), customScale: $('#customScale'), mediaSource: $('#mediaSource'), printMaterial: $('#printMaterial'), paperSize: $('#paperSize'), pricingTierLabel: $('#pricingTierLabel'), mediaPriceHint: $('#mediaPriceHint'), layoutMode: $('#layoutMode'), pageRangeMode: $('#pageRangeMode'), pageRangeField: $('#pageRangeField'), pageRange: $('#pageRange'), pageSubset: $('#pageSubset'), pageOrder: $('#pageOrder'), pagesPerSideField: $('#pagesPerSideField'), pagesPerSide: $('#pagesPerSide'), nupOrderField: $('#nupOrderField'), nupOrder: $('#nupOrder'), sideMode: $('#sideMode'), flipField: $('#flipField'), duplexFlip: $('#duplexFlip'), sheetOrientation: $('#sheetOrientation'), bookletSettings: $('#bookletSettings'), bookletBinding: $('#bookletBinding'), printColorMode: $('#printColorMode'), sideColorSettings: $('#sideColorSettings'), frontColorMode: $('#frontColorMode'), backColorMode: $('#backColorMode'), backColorField: $('#backColorField'), printCopies: $('#printCopies'), collateCopies: $('#collateCopies'), pageBorder: $('#pageBorder'), jobMiniSummary: $('#jobMiniSummary'),
    previewTabs: $('#previewTabs'), documentPreviewTab: $('#documentPreviewTab'), printPreviewTab: $('#printPreviewTab'), threeDPreviewTab: $('#threeDPreviewTab'), threeDViewer: $('#threeDViewer'), threeDStage: $('#threeDStage'), threeDObject: $('#threeDObject'), threeDFront: $('#threeDFront'), threeDBack: $('#threeDBack'), threeDStack: $('#threeDStack'), threeDFlipBtn: $('#threeDFlipBtn'), threeDResetBtn: $('#threeDResetBtn'), threeDInfo: $('#threeDInfo'), booklet3DControls: $('#booklet3DControls'), bookletSpreadControls: $('#bookletSpreadControls'), bookletSpreadLabel: $('#bookletSpreadLabel'), bookletFirstSpread: $('#bookletFirstSpread'), bookletPrevSpread: $('#bookletPrevSpread'), bookletNextSpread: $('#bookletNextSpread'), bookletLastSpread: $('#bookletLastSpread'), booklet3DFolded: $('#booklet3DFolded'), booklet3DFoldedFront: $('#booklet3DFoldedFront'), booklet3DFoldedBack: $('#booklet3DFoldedBack'), booklet3DFoldedStack: $('#booklet3DFoldedStack'), booklet3DBook: $('#booklet3DBook'), booklet3DLeftPage: $('#booklet3DLeftPage'), booklet3DRightPage: $('#booklet3DRightPage'), booklet3DLeftStack: $('#booklet3DLeftStack'), booklet3DRightStack: $('#booklet3DRightStack'), booklet3DSpine: $('#booklet3DSpine'), printViewer: $('#printViewer'), firstPrintSideBtn: $('#firstPrintSideBtn'), prevPrintSideBtn: $('#prevPrintSideBtn'), nextPrintSideBtn: $('#nextPrintSideBtn'), lastPrintSideBtn: $('#lastPrintSideBtn'), printSideInput: $('#printSideInput'), printSideTotal: $('#printSideTotal'), printSideTitle: $('#printSideTitle'), printSidePages: $('#printSidePages'), printSideType: $('#printSideType'), printSideOverride: $('#printSideOverride'), printCanvasStage: $('#printCanvasStage'), printCanvasLoader: $('#printCanvasLoader'), printPreviewCanvas: $('#printPreviewCanvas'), printHint: $('#printHint'), threeDSideNav: $('#threeDSideNav'), first3DSideBtn: $('#first3DSideBtn'), prev3DSideBtn: $('#prev3DSideBtn'), next3DSideBtn: $('#next3DSideBtn'), last3DSideBtn: $('#last3DSideBtn'), threeDSideInput: $('#threeDSideInput'), threeDSideTotal: $('#threeDSideTotal'),
    jobSheetCount: $('#jobSheetCount'), jobSideCount: $('#jobSideCount'), jobMediaLabel: $('#jobMediaLabel'), jobTierLabel: $('#jobTierLabel'), jobNupLabel: $('#jobNupLabel'), jobCopiesLabel: $('#jobCopiesLabel'), jobColorSummary: $('#jobColorSummary'), jobPriceBreakdown: $('#jobPriceBreakdown'), resultDetailSummary: $('#resultDetailSummary'), pagesGroupSummary: $('#pagesGroupSummary'), mediaGroupSummary: $('#mediaGroupSummary'), layoutGroupSummary: $('#layoutGroupSummary'), colorGroupSummary: $('#colorGroupSummary'),
    copyrightYears: $('#copyrightYears'),
};

const state = {
    file: null,
    sourceFiles: [],
    sourceKind: null,
    sourceDisplayName: '',
    pdfData: null,
    loadingTask: null,
    pdf: null,
    previewRenderTask: null,
    previewRenderToken: 0,
    previewPage: 1,
    previewZoom: 1,
    previewViewMode: 'fit-page',
    previewRotation: 0,
    previewEffectiveScale: 1,
    analysis: null,
    resultFilter: 'ALL',
    selectedResultPage: null,
    analyzing: false,
    previewMode: 'document', printSettings: { ...PRINT_JOB_DEFAULTS }, printJob: null, printSideOverrides: {},
    printSheet: 1, printSide: 'front', printSideIndex: 1, printPreviewToken: 0, threeDPrimeToken: 0, sourcePageAspect: 0.707,
    pricingConfig: null, pricingSelection: null,
    sourceTab: 'document',
    settingsTab: 'document',
    thumbnailToken: 0,
    thumbnailObserver: null,
};

const live3d = initLive3D({
    stage: elements.threeDStage,
    object: elements.threeDObject,
    front: elements.threeDFront,
    back: elements.threeDBack,
    stack: elements.threeDStack,
    info: elements.threeDInfo,
    sideNav: elements.threeDSideNav,
    flipBtn: elements.threeDFlipBtn,
    resetBtn: elements.threeDResetBtn,
    bookletControls: elements.booklet3DControls,
    modeButtons: [...document.querySelectorAll('[data-booklet3d-mode]')],
    spreadControls: elements.bookletSpreadControls,
    spreadLabel: elements.bookletSpreadLabel,
    firstSpreadBtn: elements.bookletFirstSpread,
    prevSpreadBtn: elements.bookletPrevSpread,
    nextSpreadBtn: elements.bookletNextSpread,
    lastSpreadBtn: elements.bookletLastSpread,
    folded: elements.booklet3DFolded,
    foldedFront: elements.booklet3DFoldedFront,
    foldedBack: elements.booklet3DFoldedBack,
    foldedStack: elements.booklet3DFoldedStack,
    book: elements.booklet3DBook,
    bookLeft: elements.booklet3DLeftPage,
    bookRight: elements.booklet3DRightPage,
    bookLeftStack: elements.booklet3DLeftStack,
    bookRightStack: elements.booklet3DRightStack,
    bookSpine: elements.booklet3DSpine,
    pageTextureLoader: renderBookletPageTexture,
});

async function renderBookletPageTexture(pageNumber) {
    const pdf = state.pdf;
    const n = Number(pageNumber);
    if (!pdf || !Number.isInteger(n) || n < 1 || n > pdf.numPages) return null;
    try {
        const page = await pdf.getPage(n);
        if (pdf !== state.pdf) return null;
        const base = page.getViewport({ scale: 1 });
        const targetWidth = 420;
        const scale = Math.max(.45, Math.min(1.5, targetWidth / Math.max(1, base.width)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (pdf !== state.pdf) return null;
        return canvas.toDataURL('image/jpeg', .86);
    } catch (error) {
        console.warn(`Texture booklet halaman ${n} gagal dirender:`, error);
        return null;
    }
}


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

function openAppDialog(dialog) {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    document.querySelectorAll('dialog.app-dialog[open]').forEach(item => { if (item !== dialog) item.close(); });
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
    if (dialog === elements.previewDialog && state.pdf) {
        window.setTimeout(() => {
            if (state.previewMode === 'print') renderPrintSidePreview();
            else if (state.previewMode === '3d') updateLive3D();
            else renderPreviewPage(state.previewPage);
        }, 40);
    }
}

function closeAppDialog(dialog) {
    if (dialog?.open) dialog.close();
    if (!document.querySelector('dialog.app-dialog[open]')) document.body.classList.remove('dialog-open');
}

function clearSourceThumbnails() {
    state.thumbnailToken += 1;
    try { state.thumbnailObserver?.disconnect?.(); } catch (_) { /* noop */ }
    state.thumbnailObserver = null;
    elements.sourceThumbnailList?.replaceChildren();
    if (elements.sourceThumbnailStatus) elements.sourceThumbnailStatus.textContent = state.pdf ? `${state.pdf.numPages} halaman` : 'Belum ada dokumen.';
}

async function renderSourceThumbnail(button, pageNumber, token = state.thumbnailToken) {
    if (!state.pdf || !button || button.dataset.rendered === '1' || button.dataset.rendering === '1') return;
    button.dataset.rendering = '1';
    button.classList.add('is-rendering');
    let page = null;
    try {
        page = await state.pdf.getPage(pageNumber);
        if (token !== state.thumbnailToken || !button.isConnected) return;
        const base = page.getViewport({ scale: 1 });
        const maxW = 124;
        const maxH = 154;
        const cssScale = Math.min(maxW / Math.max(1, base.width), maxH / Math.max(1, base.height));
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: Math.max(.08, cssScale * dpr) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        canvas.style.width = `${Math.max(1, viewport.width / dpr)}px`;
        canvas.style.height = `${Math.max(1, viewport.height / dpr)}px`;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, background: 'rgb(255,255,255)', intent: 'display' }).promise;
        if (token !== state.thumbnailToken || !button.isConnected) return;
        const preview = button.querySelector('.source-thumb-preview');
        preview?.replaceChildren(canvas);
        button.dataset.rendered = '1';
    } catch (error) {
        console.warn(`Thumbnail halaman ${pageNumber} gagal dirender:`, error);
    } finally {
        button.dataset.rendering = '0';
        button.classList.remove('is-rendering');
        try { page?.cleanup(); } catch (_) { /* noop */ }
    }
}

function buildSourceThumbnails() {
    clearSourceThumbnails();
    if (!state.pdf || !elements.sourceThumbnailList) return;
    const token = state.thumbnailToken;
    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'source-thumb';
        button.dataset.page = String(pageNumber);
        button.title = `Tampilkan halaman ${pageNumber}`;
        button.innerHTML = `<span class="source-thumb-preview">Hal. ${pageNumber}</span><span>Hal. ${pageNumber}</span>`;
        fragment.appendChild(button);
    }
    elements.sourceThumbnailList.appendChild(fragment);
    if (elements.sourceThumbnailStatus) elements.sourceThumbnailStatus.textContent = `${state.pdf.numPages} halaman`;

    const renderVisible = entry => {
        if (!entry.isIntersecting) return;
        const button = entry.target;
        state.thumbnailObserver?.unobserve?.(button);
        renderSourceThumbnail(button, Number(button.dataset.page), token);
    };
    if ('IntersectionObserver' in window) {
        state.thumbnailObserver = new IntersectionObserver(entries => entries.forEach(renderVisible), {
            root: elements.sourceThumbnailList,
            rootMargin: '160px 0px',
            threshold: 0.01,
        });
        elements.sourceThumbnailList.querySelectorAll('.source-thumb').forEach(button => state.thumbnailObserver.observe(button));
    } else {
        [...elements.sourceThumbnailList.querySelectorAll('.source-thumb')].slice(0, 40).forEach(button => renderSourceThumbnail(button, Number(button.dataset.page), token));
    }
    syncSourceThumbnailSelection();
}

function syncSourceThumbnailSelection({ scrollIntoView = false } = {}) {
    if (!elements.sourceThumbnailList) return;
    const page = Number(state.previewPage) || 1;
    elements.sourceThumbnailList.querySelectorAll('.source-thumb.is-selected').forEach(item => item.classList.remove('is-selected'));
    const selected = elements.sourceThumbnailList.querySelector(`.source-thumb[data-page="${page}"]`);
    if (!selected) return;
    selected.classList.add('is-selected');
    if (scrollIntoView && state.sourceTab === 'pages') selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setSourceTab(tab = 'document') {
    const next = tab === 'pages' && state.pdf ? 'pages' : 'document';
    state.sourceTab = next;
    elements.sourceDocumentTab?.classList.toggle('is-active', next === 'document');
    elements.sourcePagesTab?.classList.toggle('is-active', next === 'pages');
    elements.sourceDocumentTab?.setAttribute('aria-selected', String(next === 'document'));
    elements.sourcePagesTab?.setAttribute('aria-selected', String(next === 'pages'));
    if (elements.sourceDocumentView) elements.sourceDocumentView.hidden = next !== 'document';
    if (elements.sourcePagesView) elements.sourcePagesView.hidden = next !== 'pages';
    if (next === 'pages' && state.pdf) {
        if (!elements.sourceThumbnailList?.children.length) buildSourceThumbnails();
        syncSourceThumbnailSelection({ scrollIntoView: true });
    }
}

function syncWorkspaceActions() {
    const hasPdf = Boolean(state.pdf && state.file);
    const hasAnalysis = Boolean(state.analysis);
    if (elements.workbench) elements.workbench.hidden = !hasPdf;
    if (elements.workspaceActions) elements.workspaceActions.hidden = !hasPdf;
    if (elements.sourceTabs) elements.sourceTabs.hidden = !hasPdf;
    if (elements.settingsEmpty) elements.settingsEmpty.hidden = hasPdf;
    elements.uploadPanel?.classList.toggle('has-file', hasPdf);
    if (!hasPdf && state.sourceTab !== 'document') setSourceTab('document');
    if (elements.openSettingsBtn) elements.openSettingsBtn.disabled = !hasPdf || state.analyzing;
    if (elements.openPreviewBtn) elements.openPreviewBtn.disabled = !hasPdf || state.analyzing;
    if (elements.openResultsBtn) elements.openResultsBtn.disabled = !hasAnalysis || state.analyzing;
}

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
    const duplex = Boolean(job?.settings?.duplex);
    const slots = Math.max(1, Number(job?.settings?.pagesPerSide) || 1);
    for (const sheet of (job?.sheets || [])) {
        const front = sheet?.front || { pages: Array(slots).fill(null), virtualBlank: true };
        out.push({ sheet: sheet.sheet, sideName: 'front', side: front, blank: !front?.pages?.some(Boolean) });
        if (duplex) {
            const back = sheet?.back || { pages: Array(slots).fill(null), virtualBlank: true };
            out.push({ sheet: sheet.sheet, sideName: 'back', side: back, blank: !back?.pages?.some(Boolean) });
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

function updateLinearPreviewNavigation() {
    const sides = getPrintableSides();
    const total = sides.length;
    const index = total ? clamp(state.printSideIndex, 1, total) : 1;
    state.printSideIndex = index;
    if (elements.printSideTotal) elements.printSideTotal.textContent = String(total);
    if (elements.printSideInput) {
        elements.printSideInput.max = String(Math.max(1, total));
        elements.printSideInput.value = String(index);
    }
    if (elements.firstPrintSideBtn) elements.firstPrintSideBtn.disabled = total <= 1 || index <= 1;
    if (elements.prevPrintSideBtn) elements.prevPrintSideBtn.disabled = total <= 1 || index <= 1;
    if (elements.nextPrintSideBtn) elements.nextPrintSideBtn.disabled = total <= 1 || index >= total;
    if (elements.lastPrintSideBtn) elements.lastPrintSideBtn.disabled = total <= 1 || index >= total;
    if (elements.threeDSideTotal) elements.threeDSideTotal.textContent = String(total);
    if (elements.threeDSideInput) {
        elements.threeDSideInput.max = String(Math.max(1, total));
        elements.threeDSideInput.value = String(index);
    }
    if (elements.first3DSideBtn) elements.first3DSideBtn.disabled = total <= 1 || index <= 1;
    if (elements.prev3DSideBtn) elements.prev3DSideBtn.disabled = total <= 1 || index <= 1;
    if (elements.next3DSideBtn) elements.next3DSideBtn.disabled = total <= 1 || index >= total;
    if (elements.last3DSideBtn) elements.last3DSideBtn.disabled = total <= 1 || index >= total;
}

async function prime3DCurrentSheet() {
    if (!state.pdf || !state.printJob || state.analyzing) return;
    const primeToken = ++state.threeDPrimeToken;
    const sides = getPrintableSides();
    if (!sides.length) { updateLive3D(); return; }
    state.printSideIndex = clamp(state.printSideIndex, 1, sides.length);
    const current = sides[state.printSideIndex - 1];
    const targetSheet = current?.sheet || 1;
    const indexes = sides
        .map((item, idx) => ({ item, idx: idx + 1 }))
        .filter(entry => entry.item.sheet === targetSheet)
        .map(entry => entry.idx);
    const restoreIndex = state.printSideIndex;
    const restoreMode = state.previewMode;
    for (const idx of indexes) {
        state.printSideIndex = idx;
        syncInternalSideFromIndex();
        state.previewMode = 'print';
        await renderPrintSidePreview();
        if (primeToken !== state.threeDPrimeToken) return;
    }
    if (primeToken !== state.threeDPrimeToken) return;
    state.printSideIndex = restoreIndex;
    syncInternalSideFromIndex();
    state.previewMode = restoreMode;
    updateLinearPreviewNavigation();
    live3d.focusSide?.(state.printSide);
    updateLive3D();
}

async function navigate3DSide(targetIndex) {
    const total = getPrintableSides().length;
    if (!total) return;
    state.printSideIndex = clamp(Number(targetIndex) || 1, 1, total);
    syncInternalSideFromIndex();
    updateLinearPreviewNavigation();
    await prime3DCurrentSheet();
}

function currentPricing() {
    if (!state.pricingConfig) {
        const regularSimplex = {H:300,HW:500,W:1000,D:1500};
        const volumeSimplex = {H:250,HW:400,W:800,D:1500};
        const flatDuplex = {'H+H':400,'H+HW':600,'H+W':1000,'H+D':1800,'HW+HW':800,'HW+W':1200,'HW+D':2000,'W+W':1500,'W+D':2400,'D+D':2500};
        return {
            prices:{...regularSimplex,duplexCredit:0},
            regular:{simplex:regularSimplex,duplex_pairs:{...flatDuplex}},
            volume:{simplex:volumeSimplex,duplex_pairs:{...flatDuplex}},
            volumeThresholds:{H:250,HW:50,W:25,D:null},
            volumeMinSheets:250,
            volumeStrategy:'marginal_volume_by_color_class', mediaSource:'store', mediaSourceLabel:'Dari toko', material:null, size:null,
        };
    }
    return getPricingSelection(state.pricingConfig, elements.printMaterial?.value, elements.paperSize?.value, elements.mediaSource?.value || 'store');
}

function tariffsMatch(a, b) {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

const PRICE_CLASS_META = Object.freeze({
    H: {short:'BW', label:'Hitam-putih'},
    HW: {short:'Sebagian', label:'Sebagian warna'},
    W: {short:'Full', label:'Full warna'},
    D: {short:'Pekat', label:'Pekat'},
});

function classPricingText(selection, type, {compact = false} = {}) {
    const regular = Number(selection?.regular?.simplex?.[type]) || 0;
    const volume = Number(selection?.volume?.simplex?.[type]) || regular;
    const threshold = selection?.volumeThresholds?.[type];
    const label = PRICE_CLASS_META[type]?.short || type;
    if (!Number.isFinite(threshold) || threshold <= 0 || regular === volume) {
        return compact ? `${formatRupiah(regular)}/sisi` : `${label} ${formatRupiah(regular)}/sisi`;
    }
    return compact
        ? `${formatRupiah(regular)}/sisi · ${formatRupiah(volume)} mulai ${threshold}`
        : `${label} ${formatRupiah(regular)}/sisi · ${formatRupiah(volume)} mulai ${threshold} sisi`;
}

function activeVolumeClasses(job) {
    if (!job?.volumeEligibility) return [];
    return ['H','HW','W','D'].filter(type => job.volumeEligibility[type]);
}

function isDuplexUi() {
    return elements.layoutMode?.value === 'booklet' || elements.sideMode?.value !== 'simplex';
}

function duplexPairValue(selection, key) {
    return Math.max(0, Number(selection?.regular?.duplex_pairs?.[key]) || Number(selection?.volume?.duplex_pairs?.[key]) || 0);
}

function duplexPricingSummary(selection) {
    const pairs = [
        ['H+H', 'BW+BW'],
        ['H+HW', 'BW+Sebagian'],
        ['HW+HW', 'Sebagian+Sebagian'],
        ['H+W', 'BW+Full'],
        ['HW+W', 'Sebagian+Full'],
        ['W+W', 'Full+Full'],
    ];
    const visible = pairs
        .map(([key, label]) => [label, duplexPairValue(selection, key)])
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `${label} ${formatRupiah(value)}`);
    if (duplexPairValue(selection, 'D+D') > 0) visible.push(`Pekat+Pekat ${formatRupiah(duplexPairValue(selection, 'D+D'))}`);
    return visible.join(' · ');
}

function updatePricingLabels(selection = currentPricing()) {
    const duplex = isDuplexUi();
    if (duplex) {
        elements.pricingTierLabel.textContent = 'Harga 2 sisi · tarif tetap';
        elements.mediaPriceHint.textContent = duplexPricingSummary(selection) || 'Tarif 2 sisi tidak tersedia untuk media ini.';
        if (elements.hPrice) elements.hPrice.textContent = 'Tarif sesuai pasangan sisi';
        if (elements.hwPrice) elements.hwPrice.textContent = 'Tarif sesuai pasangan sisi';
        if (elements.wPrice) elements.wPrice.textContent = 'Tarif sesuai pasangan sisi';
        if (elements.dPrice) elements.dPrice.textContent = 'Tarif sesuai pasangan sisi';
        return;
    }

    elements.pricingTierLabel.textContent = 'Harga 1 sisi';
    elements.mediaPriceHint.textContent = ['H','HW','W','D'].map(type => classPricingText(selection, type)).join(' · ');
    if (elements.hPrice) elements.hPrice.textContent = classPricingText(selection, 'H', {compact:true});
    if (elements.hwPrice) elements.hwPrice.textContent = classPricingText(selection, 'HW', {compact:true});
    if (elements.wPrice) elements.wPrice.textContent = classPricingText(selection, 'W', {compact:true});
    if (elements.dPrice) elements.dPrice.textContent = classPricingText(selection, 'D', {compact:true});
}

function updateSettingsGroupSummaries() {
    if (elements.pagesGroupSummary) {
        const mode = elements.pageRangeMode?.value === 'custom' && elements.pageRange?.value.trim()
            ? elements.pageRange.value.trim()
            : 'Semua halaman';
        const subset = elements.pageSubset?.value === 'odd' ? 'ganjil' : elements.pageSubset?.value === 'even' ? 'genap' : '';
        const copies = Math.max(1, Number(elements.printCopies?.value) || 1);
        elements.pagesGroupSummary.textContent = `${mode}${subset ? ` · ${subset}` : ''} · ${copies} rangkap`;
    }
    if (elements.mediaGroupSummary) {
        const material = elements.printMaterial?.selectedOptions?.[0]?.textContent || 'Media';
        const size = elements.paperSize?.selectedOptions?.[0]?.textContent || '-';
        const source = elements.mediaSource?.value === 'customer' ? 'Bawa Sendiri' : 'Dari toko';
        elements.mediaGroupSummary.textContent = `${material} · ${size} · ${source}`;
    }
    if (elements.layoutGroupSummary) {
        const booklet = elements.layoutMode?.value === 'booklet';
        const duplex = booklet || elements.sideMode?.value !== 'simplex';
        const pps = booklet ? 2 : Math.max(1, Number(elements.pagesPerSide?.value) || 1);
        elements.layoutGroupSummary.textContent = booklet ? 'Booklet · 2 sisi' : `${pps} halaman/sisi · ${duplex ? '2 sisi' : '1 sisi'}`;
    }
    if (elements.colorGroupSummary) {
        const value = elements.printColorMode?.value || 'auto';
        const color = value === 'bw' ? 'Hitam-putih' : 'Otomatis';
        const booklet = elements.layoutMode?.value === 'booklet';
        const side = booklet || elements.sideMode?.value !== 'simplex' ? '2 sisi' : '1 sisi';
        elements.colorGroupSummary.textContent = `${side} · ${color}`;
    }
}

function setSettingsTab(tab = 'document', { focus = false } = {}) {
    const safeTab = ['document', 'media', 'layout', 'print'].includes(tab) ? tab : 'document';
    state.settingsTab = safeTab;
    const buttons = $$('#printSettings .settings-main-tab');
    const panels = $$('#printSettings .settings-tab-panel');
    buttons.forEach(button => {
        const active = button.dataset.settingsTab === safeTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        if (focus && active) button.focus({ preventScroll: true });
    });
    panels.forEach(panel => {
        const active = panel.dataset.settingsPanel === safeTab;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
    });
}

function setupSettingsTabs() {
    $$('#printSettings .settings-main-tab').forEach(button => {
        button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab || 'document'));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const buttons = $$('#printSettings .settings-main-tab');
            const index = buttons.indexOf(button);
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
            if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = buttons.length - 1;
            event.preventDefault();
            setSettingsTab(buttons[next]?.dataset.settingsTab || 'document', { focus: true });
        });
    });
    setSettingsTab(state.settingsTab || 'document');
}

function formatSizeCatalogLabel(item, available = true) {
    const dims = Array.isArray(item?.dimensions_mm) && item.dimensions_mm.length === 2
        ? ` · ${item.dimensions_mm[0]} × ${item.dimensions_mm[1]} mm`
        : '';
    return `${item?.label || item?.id || '-'}${dims}${available ? '' : ' · tidak tersedia'}`;
}

function populatePaperSizeOptions(material, previousSize = '') {
    if (!elements.paperSize) return;
    const available = new Map((material?.sizes || []).map(size => [size.id, size]));
    elements.paperSize.innerHTML = '';

    const catalog = Array.isArray(state.pricingConfig?.size_catalog) && state.pricingConfig.size_catalog.length
        ? state.pricingConfig.size_catalog
        : [{ group: 'Ukuran', items: state.pricingConfig?.sizes || [] }];
    const catalogIds = new Set();

    for (const section of catalog) {
        const group = document.createElement('optgroup');
        group.label = section.group || 'Ukuran';
        for (const item of (section.items || [])) {
            catalogIds.add(item.id);
            const isAvailable = available.has(item.id);
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = formatSizeCatalogLabel(item, isAvailable);
            opt.disabled = !isAvailable;
            group.appendChild(opt);
        }
        if (group.children.length) elements.paperSize.appendChild(group);
    }

    const extra = (material?.sizes || []).filter(size => !catalogIds.has(size.id));
    if (extra.length) {
        const group = document.createElement('optgroup');
        group.label = 'Ukuran lain';
        for (const size of extra) {
            const opt = document.createElement('option');
            opt.value = size.id;
            opt.textContent = size.label || size.id;
            group.appendChild(opt);
        }
        elements.paperSize.appendChild(group);
    }

    const validPrevious = [...elements.paperSize.options].some(o => o.value === previousSize && !o.disabled);
    if (validPrevious) elements.paperSize.value = previousSize;
    else if (material?.sizes?.[0]?.id) elements.paperSize.value = material.sizes[0].id;
}

function duplexSupported(selection = currentPricing()) {
    const pairs = { ...(selection?.volume?.duplex_pairs || {}), ...(selection?.regular?.duplex_pairs || {}) };
    return selection?.material?.duplex !== false && Object.values(pairs).some(value => Number(value) > 0);
}

function syncDuplexAvailability(selection = currentPricing()) {
    const allowed = duplexSupported(selection);
    if (elements.sideMode) {
        [...elements.sideMode.options].forEach(option => {
            if (option.value !== 'simplex') option.disabled = !allowed;
        });
        if (!allowed && elements.sideMode.value !== 'simplex') elements.sideMode.value = 'simplex';
    }

    const bookletButton = document.querySelector('.handling-tab[data-handling="booklet"]');
    if (bookletButton) {
        bookletButton.disabled = !allowed;
        bookletButton.setAttribute('aria-disabled', String(!allowed));
        bookletButton.title = allowed ? '' : 'Booklet memerlukan media yang mendukung cetak 2 sisi.';
    }

    if (!allowed && elements.layoutMode?.value === 'booklet') {
        elements.layoutMode.value = 'normal';
        if (elements.pagesPerSide) elements.pagesPerSide.value = '1';
        syncHandlingTabs('size');
    }

    const help = document.querySelector('#sideModeHelp');
    if (help) help.textContent = allowed
        ? '2 sisi tersedia untuk media dan ukuran ini.'
        : 'Media atau ukuran ini hanya mendukung cetak 1 sisi.';
    return allowed;
}

function refreshPricingUi({refreshJob = true} = {}) {
    if (!state.pricingConfig || !elements.printMaterial || !elements.paperSize) return;
    const material = getMaterial(state.pricingConfig, elements.printMaterial.value);
    const previousSize = elements.paperSize.value;
    populatePaperSizeOptions(material, previousSize);
    const selection = currentPricing();
    state.pricingSelection = selection;
    syncDuplexAvailability(selection);
    updatePricingLabels(selection);
    updateSettingsGroupSummaries();
    if (state.analysis) state.analysis.prices = {...selection.prices};
    if (refreshJob && state.pdf) refreshPrintJob({render: state.previewMode === 'print'});
    else updateLive3D();
}


function currentHandlingMode() {
    if (elements.layoutMode?.value === 'booklet') return 'booklet';
    return Number(elements.pagesPerSide?.value || 1) > 1 ? 'multiple' : 'size';
}

function syncHandlingTabs(mode = currentHandlingMode()) {
    const safeMode = ['size','multiple','booklet'].includes(mode) ? mode : 'size';
    $$('.handling-tab').forEach(button => {
        const active = button.dataset.handling === safeMode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
        button.setAttribute('aria-pressed', String(active));
    });

    // Satu elemen dapat dipakai pada lebih dari satu mode. Tampilkan bila kelasnya
    // memang mencakup mode aktif, bukan berdasarkan urutan loop kelas.
    $$('.handling-size, .handling-multiple, .handling-booklet').forEach(el => {
        el.hidden = !el.classList.contains(`handling-${safeMode}`);
    });

    if (elements.bookletSettings) elements.bookletSettings.hidden = safeMode !== 'booklet';
    if (elements.pagesPerSideField) elements.pagesPerSideField.hidden = safeMode !== 'multiple';
    if (elements.nupOrderField) elements.nupOrderField.hidden = safeMode !== 'multiple' || Number(elements.pagesPerSide?.value || 1) <= 1;
    if (elements.flipField) elements.flipField.hidden = safeMode === 'booklet' || elements.sideMode?.value === 'simplex';
    if (elements.customScaleField) elements.customScaleField.hidden = safeMode === 'booklet' || elements.scaleMode?.value !== 'custom';
}

function setHandlingMode(mode, { refresh = true } = {}) {
    const safeMode = ['size','multiple','booklet'].includes(mode) ? mode : 'size';
    if (safeMode === 'booklet' && state.pricingConfig && !duplexSupported(currentPricing())) {
        syncHandlingTabs(currentHandlingMode());
        const help = document.querySelector('#sideModeHelp');
        if (help) help.textContent = 'Booklet tidak tersedia karena media atau ukuran ini tidak mendukung cetak 2 sisi.';
        return;
    }
    if (safeMode === 'booklet') {
        elements.layoutMode.value = 'booklet';
        elements.pagesPerSide.value = '2';
        elements.sideMode.value = 'duplex-auto';
        elements.sheetOrientation.value = 'landscape';
        elements.duplexFlip.value = 'short';
        elements.scaleMode.value = 'fit';
    } else {
        elements.layoutMode.value = 'normal';
        if (safeMode === 'size') elements.pagesPerSide.value = '1';
        else if (Number(elements.pagesPerSide.value) <= 1) elements.pagesPerSide.value = '2';
    }
    syncHandlingTabs(safeMode);
    updatePrintSettingsVisibility();
    if (refresh) {
        state.printSideOverrides = {};
        state.printSheet = 1; state.printSide = 'front'; state.printSideIndex = 1;
        refreshPrintJob({ render: true });
    }
}

const PRESET_BASE_SETTINGS = Object.freeze({
    mediaSource: 'store',
    material: 'hvs-white-70-80',
    size: 'A4',
    pageRangeMode: 'all',
    pageRange: '',
    pageSubset: 'all',
    pageOrder: 'normal',
    copies: 1,
    collate: true,
    layoutMode: 'normal',
    pagesPerSide: 1,
    nupOrder: 'ltr',
    scaleMode: 'fit',
    customScale: 100,
    orientation: 'auto',
    bookletBinding: 'left',
    pageBorder: true,
    sideMode: 'simplex',
    flip: 'long',
    colorMode: 'auto',
    frontColor: 'auto',
    backColor: 'auto',
});

function applyPreset(presetId) {
    const preset = state.pricingConfig?.presets?.find(p => p.id === presetId);
    if (!preset) return;
    const x = { ...PRESET_BASE_SETTINGS, ...(preset.settings || {}) };

    if ([...elements.mediaSource.options].some(o => o.value === x.mediaSource)) elements.mediaSource.value = x.mediaSource;
    if ([...elements.printMaterial.options].some(o => o.value === x.material)) elements.printMaterial.value = x.material;
    refreshPricingUi({ refreshJob: false });
    if ([...elements.paperSize.options].some(o => o.value === x.size)) elements.paperSize.value = x.size;

    elements.pageRangeMode.value = x.pageRangeMode;
    elements.pageRange.value = x.pageRange;
    elements.pageSubset.value = x.pageSubset;
    elements.pageOrder.value = x.pageOrder;
    elements.printCopies.value = String(x.copies);
    elements.collateCopies.checked = Boolean(x.collate);

    elements.layoutMode.value = x.layoutMode;
    elements.pagesPerSide.value = String(x.pagesPerSide);
    elements.nupOrder.value = x.nupOrder;
    elements.scaleMode.value = x.scaleMode;
    elements.customScale.value = String(x.customScale);
    elements.sheetOrientation.value = x.orientation;
    elements.bookletBinding.value = x.bookletBinding;
    elements.pageBorder.checked = Boolean(x.pageBorder);

    elements.sideMode.value = x.sideMode;
    elements.duplexFlip.value = x.flip;
    elements.printColorMode.value = x.colorMode === 'bw' ? 'bw' : 'auto';
    if (elements.frontColorMode) elements.frontColorMode.value = 'auto';
    if (elements.backColorMode) elements.backColorMode.value = 'auto';

    updatePrintSettingsVisibility();
    const handlingMode = x.layoutMode === 'booklet' ? 'booklet' : (Number(x.pagesPerSide || 1) > 1 ? 'multiple' : 'size');
    syncHandlingTabs(handlingMode);
    if (handlingMode !== 'size') setSettingsTab('layout');
    state.printSideOverrides = {};
    state.printSheet = 1;
    state.printSide = 'front';
    state.printSideIndex = 1;
    refreshPricingUi({ refreshJob: false });
    updateSettingsGroupSummaries();
    if (state.pdf) refreshPrintJob({ render: true });
}

async function initializePricing() {
    state.pricingConfig = await loadEffectivePricing();
    elements.printMaterial.innerHTML = '';
    const groups = new Map();
    for (const material of (state.pricingConfig.materials || [])) {
        const category = material.category || 'Media';
        if (!groups.has(category)) {
            const group = document.createElement('optgroup');
            group.label = category;
            groups.set(category, group);
            elements.printMaterial.appendChild(group);
        }
        const opt = document.createElement('option');
        opt.value = material.id;
        opt.textContent = material.name;
        groups.get(category).appendChild(opt);
    }
    if (elements.presetSelect) {
        elements.presetSelect.innerHTML = '';
        const presetGroups = new Map();
        for (const preset of (state.pricingConfig.presets || [])) {
            const opt = document.createElement('option');
            opt.value = preset.id;
            opt.textContent = preset.name;
            if (!preset.group) {
                elements.presetSelect.appendChild(opt);
                continue;
            }
            if (!presetGroups.has(preset.group)) {
                const group = document.createElement('optgroup');
                group.label = preset.group;
                presetGroups.set(preset.group, group);
                elements.presetSelect.appendChild(group);
            }
            presetGroups.get(preset.group).appendChild(opt);
        }
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
        frontColor: 'auto',
        backColor: 'auto',
        copies: Number(elements.printCopies?.value) || 1,
        collate: Boolean(elements.collateCopies?.checked),
        pageBorder: Boolean(elements.pageBorder?.checked),
        scaleMode: elements.scaleMode?.value || 'fit',
        customScale: Math.round(clamp(Number(elements.customScale?.value) || 100, 10, 400)),
    };
}

function updatePrintSettingsVisibility() {
    if (!elements.sideMode) return;
    const booklet = elements.layoutMode?.value === 'booklet';

    const duplexAllowed = state.pricingConfig ? duplexSupported(currentPricing()) : true;
    if (booklet && !duplexAllowed) {
        elements.layoutMode.value = 'normal';
        if (elements.pagesPerSide) elements.pagesPerSide.value = '1';
    }
    const effectiveBooklet = elements.layoutMode?.value === 'booklet';

    if (effectiveBooklet) {
        elements.pagesPerSide.value = '2';
        if (elements.sideMode.value === 'simplex') elements.sideMode.value = 'duplex-auto';
        elements.sheetOrientation.value = 'landscape';
        elements.duplexFlip.value = 'short';
    }

    const duplex = elements.sideMode.value !== 'simplex' || effectiveBooklet;
    const nup = Number(elements.pagesPerSide.value) > 1;

    elements.pageRangeField.hidden = elements.pageRangeMode.value !== 'custom';
    if (elements.customScaleField) elements.customScaleField.hidden = elements.scaleMode?.value !== 'custom';
    elements.bookletSettings.hidden = !effectiveBooklet;
    elements.pagesPerSide.disabled = effectiveBooklet || state.analyzing;
    elements.sheetOrientation.disabled = effectiveBooklet || state.analyzing;
    elements.sideMode.disabled = effectiveBooklet || state.analyzing;
    elements.duplexFlip.disabled = effectiveBooklet || state.analyzing;
    elements.flipField.hidden = !duplex;
    elements.nupOrderField.hidden = effectiveBooklet || !nup;
    elements.nupOrder.disabled = effectiveBooklet || !nup || state.analyzing;
    if (elements.sideColorSettings) elements.sideColorSettings.hidden = true;
    if (elements.backColorField) elements.backColorField.hidden = !duplex;

    if (!duplex && state.printSide === 'back') state.printSide = 'front';
    syncHandlingTabs(effectiveBooklet ? 'booklet' : (Number(elements.pagesPerSide.value) > 1 ? 'multiple' : 'size'));
    updateSettingsGroupSummaries();
    if (state.pricingConfig) updatePricingLabels(currentPricing());
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
    elements.printColorMode.value = x.colorMode === 'bw' ? 'bw' : 'auto';
    if (elements.frontColorMode) elements.frontColorMode.value = x.frontColor || 'auto';
    if (elements.backColorMode) elements.backColorMode.value = x.backColor || 'auto';
    elements.printCopies.value = String(x.copies || 1);
    elements.collateCopies.checked = x.collate !== false;
    elements.pageBorder.checked = x.pageBorder !== false;
    if (elements.scaleMode) elements.scaleMode.value = x.scaleMode || 'fit';
    if (elements.customScale) elements.customScale.value = String(x.customScale || 100);
    updatePrintSettingsVisibility();
}

function formatPrintMode(x) {
    if (x.layoutMode === 'booklet') {
        return `Booklet · 2 halaman/sisi · 2 sisi ${x.duplexMethod === 'manual' ? 'manual' : 'otomatis'}`;
    }
    return `${x.pagesPerSide} halaman/sisi · ${x.duplex ? `2 sisi ${x.duplexMethod === 'manual' ? 'manual' : ''}`.trim() : '1 sisi'}`;
}

function sideOverrideKey(sheet = state.printSheet, side = state.printSide) {
    return `${Number(sheet) || 1}:${side === 'back' ? 'back' : 'front'}`;
}

function updateLive3D() {
    if (!state.printJob || !state.pricingSelection) return;
    live3d.update({ job: state.printJob, selection: state.pricingSelection, sheetIndex: state.printSheet || 1, documentId: state.file ? `${state.file.name}:${state.file.size}:${state.file.lastModified || 0}` : '' });
}

function pairDisplayLabel(basis) {
    if (!basis) return '-';
    if (!basis.includes('+')) return `${PRICE_CLASS_META[basis]?.short || basis} · 1 sisi`;
    return basis.split('+').map(type => PRICE_CLASS_META[type]?.short || type).join(' + ');
}

function renderJobPriceBreakdown(job, pricing) {
    const host = elements.jobPriceBreakdown;
    if (!host) return;
    host.replaceChildren();
    if (!job?.resolved) return;

    const rows = [];
    if (job.settings.duplex) {
        const grouped = new Map();
        for (const entry of job.sheetPricing || []) {
            if (!entry?.basis || !Number.isFinite(entry.cost) || entry.cost <= 0) continue;
            const key = `${entry.basis}|${entry.cost}`;
            const item = grouped.get(key) || { basis: entry.basis, unit: entry.cost, count: 0, subtotal: 0 };
            item.count += 1;
            item.subtotal += entry.cost;
            grouped.set(key, item);
        }
        for (const item of grouped.values()) {
            rows.push({ label: pairDisplayLabel(item.basis), detail: `${item.count} lembar × ${formatRupiah(item.unit)}`, subtotal: item.subtotal });
        }
    } else {
        for (const type of ['H','HW','W','D']) {
            const regularCount = Number(job.regularSidesByClass?.[type]) || 0;
            const volumeCount = Number(job.volumeSidesByClass?.[type]) || 0;
            const count = regularCount + volumeCount;
            if (!count) continue;
            const regular = Number(pricing?.regular?.simplex?.[type]) || 0;
            const volume = Number(pricing?.volume?.simplex?.[type]) || regular;
            const subtotal = (regularCount * regular) + (volumeCount * volume);
            const detailParts = [];
            if (regularCount) detailParts.push(`${regularCount} × ${formatRupiah(regular)}`);
            if (volumeCount) detailParts.push(`${volumeCount} × ${formatRupiah(volume)}`);
            rows.push({ label: PRICE_CLASS_META[type]?.label || type, detail: detailParts.join(' + '), subtotal });
        }
    }

    for (const item of rows) {
        const row = document.createElement('div');
        row.className = 'job-price-row';
        const copy = document.createElement('div');
        const label = document.createElement('strong');
        const detail = document.createElement('span');
        const subtotal = document.createElement('b');
        label.textContent = item.label;
        detail.textContent = item.detail;
        subtotal.textContent = formatRupiah(item.subtotal);
        copy.append(label, detail);
        row.append(copy, subtotal);
        host.appendChild(row);
    }
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
    if (job.invalidRangeTokens.length) notes.push(`rentang diabaikan: ${job.invalidRangeTokens.join(', ')}`);
    if (x.duplex) {
        notes.push('tarif 2 sisi tetap');
    } else {
        const active = activeVolumeClasses(job);
        if (active.length) notes.push(`harga volume: ${active.map(t => PRICE_CLASS_META[t]?.short || t).join(', ')}`);
        else notes.push('tarif reguler');
    }
    notes.push(job.resolved ? formatRupiah(job.totalCost) : 'biaya menunggu analisis');
    details.textContent = notes.join(' · ');
    elements.jobMiniSummary.append(title, details);

    const sides = getPrintableSides(job);
    state.printSideIndex = clamp(state.printSideIndex, 1, Math.max(1, sides.length));
    syncInternalSideFromIndex();
    updateLinearPreviewNavigation();

    if (state.analysis) {
        elements.jobSheetCount.textContent = String(job.totalPhysicalSheets);
        elements.jobSideCount.textContent = String(job.totalPrintedSides);
        elements.jobMediaLabel.textContent = `${pricing.mediaSource === 'customer' ? 'Bawa Sendiri' : 'Dari toko'} · ${pricing.material?.name || '-'} · ${pricing.size?.label || pricing.size?.id || '-'}`;
        const active = activeVolumeClasses(job);
        elements.jobTierLabel.textContent = x.duplex ? '2 sisi · tetap' : (active.length ? `Volume · ${active.map(t => PRICE_CLASS_META[t]?.short || t).join('/')}` : 'Reguler');
        elements.jobNupLabel.textContent = x.layoutMode === 'booklet' ? 'Booklet' : `${x.pagesPerSide} halaman/sisi`;
        elements.jobCopiesLabel.textContent = `${x.copies}×${x.collate ? ' · tersusun' : ''}`;
        if (elements.resultDetailSummary) elements.resultDetailSummary.textContent = `${job.totalPhysicalSheets} lembar · ${job.totalPrintedSides} sisi · ${x.layoutMode === 'booklet' ? 'Booklet' : `${x.pagesPerSide} hal./sisi`}`;
        const extra = job.addedBlankPages > 0 ? ` · ${job.addedBlankPages} halaman kosong` : '';
        elements.jobColorSummary.textContent = job.resolved
            ? `BW ${job.sideCounts.H} · Sebagian ${job.sideCounts.HW} · Full ${job.sideCounts.W} · Pekat ${job.sideCounts.D}${extra}`
            : `Klasifikasi warna sedang dihitung.${extra}`;
        if (job.resolved) elements.totalCost.textContent = formatRupiah(job.totalCost);
        renderJobPriceBreakdown(job, pricing);
        elements.resultFileMeta.textContent = `${state.analysis.filename} · ${state.analysis.file_size} · ${formatPrintMode(x)}`;
    }
    updateLive3D();
}

function refreshPrintJob({ render = true } = {}) {
    if (!state.pdf) {
        state.printJob = null;
        return;
    }
    updatePrintSettingsVisibility();
    state.printSettings = readPrintSettingsFromUi();
    state.pricingSelection = currentPricing();
    updatePricingLabels(state.pricingSelection);
    updateSettingsGroupSummaries();
    state.printJob = buildPrintJob(
        state.pdf.numPages,
        state.printSettings,
        state.analysis,
        state.pricingSelection,
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
    if (state.previewMode === '3d') {
        updateLive3D();
        prime3DCurrentSheet().catch(error => console.warn('Texture 3D gagal diperbarui:', error));
    }
}

function setPreviewMode(mode) {
    if (state.analyzing) return;
    const next = mode === 'print' ? 'print' : mode === '3d' ? '3d' : 'document';
    state.previewMode = next;
    const print = next === 'print';
    const live = next === '3d';
    elements.pdfViewer.hidden = print || live || !state.pdf;
    elements.printViewer.hidden = !print || !state.pdf;
    if (elements.threeDViewer) elements.threeDViewer.hidden = !live || !state.pdf;
    elements.documentPreviewTab.classList.toggle('is-active', next === 'document');
    elements.printPreviewTab.classList.toggle('is-active', print);
    elements.threeDPreviewTab?.classList.toggle('is-active', live);
    elements.documentPreviewTab.setAttribute('aria-selected', String(next === 'document'));
    elements.printPreviewTab.setAttribute('aria-selected', String(print));
    elements.threeDPreviewTab?.setAttribute('aria-selected', String(live));
    if (print) {
        refreshPrintJob({ render: false });
        renderPrintSidePreview();
    } else if (live) {
        refreshPrintJob({ render: false });
        updateLinearPreviewNavigation();
        updateLive3D();
    } else if (state.pdf) {
        renderPreviewPage(state.previewPage);
    }
}
async function renderPdfPageToSlot(pageNumber, ctx, slot, gray, token, drawBorder = true, renderOptions = {}) {
    if (!state.pdf || token !== state.printPreviewToken) return;
    const page = await state.pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const pad = Math.max(5, Math.round(Math.min(slot.width, slot.height) * 0.025));
    const availableWidth = Math.max(1, slot.width - pad * 2);
    const availableHeight = Math.max(1, slot.height - pad * 2);
    const fitScale = Math.min(availableWidth / base.width, availableHeight / base.height);

    const singlePageSizeMode = renderOptions.layoutMode !== 'booklet' && Number(renderOptions.pagesPerSide || 1) === 1;
    const requestedMode = singlePageSizeMode ? (renderOptions.scaleMode || 'fit') : 'fit';
    const media = getMediaDimensionsMm(renderOptions.sizeId || 'A4', renderOptions.orientation || 'portrait');
    const pxPerMmX = Math.max(0.01, Number(renderOptions.sheetWidthPx || slot.width) / media.width);
    const pxPerMmY = Math.max(0.01, Number(renderOptions.sheetHeightPx || slot.height) / media.height);
    const pointsToMm = 25.4 / 72;
    const actualScale = Math.min(pxPerMmX, pxPerMmY) * pointsToMm;
    const customScale = actualScale * Math.max(0.1, Math.min(4, Number(renderOptions.customScale || 100) / 100));
    const scale = requestedMode === 'actual'
        ? actualScale
        : requestedMode === 'shrink'
            ? Math.min(actualScale, fitScale)
            : requestedMode === 'custom'
                ? customScale
                : fitScale;
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
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
    ctx.clip();
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
    // Gunakan pricing selection yang sama dengan engine job.
    // v2.0.1 merujuk variabel `pricing` tanpa mendefinisikannya di scope ini,
    // sehingga 2D Technical dan texture 3D sama-sama gagal dirender.
    const pricing = state.pricingSelection || currentPricing();
    const sides = getPrintableSides(job);
    updateLinearPreviewNavigation();

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

    updateLinearPreviewNavigation();

    elements.printSideTitle.textContent = `Sisi Cetak ${state.printSideIndex} · Lembar ${state.printSheet} ${state.printSide === 'back' ? 'Belakang' : 'Depan'}`;
    elements.printSidePages.textContent = side?.pages?.length
        ? side.pages.map(n => n ? `Hal. ${n}` : 'Kosong').join(' · ')
        : 'Sisi kosong';
    const type = side?.type || null;
    const isBlankSide = !side?.pages?.some(Boolean);
    elements.printSideType.textContent = isBlankSide ? 'Kosong' : (type ? (PRICE_CLASS_META[type]?.short || type) : 'Otomatis');
    elements.printSideType.className = `type-badge ${type ? `type-${type.toLowerCase()}` : 'type-auto'}`;
    elements.printSideType.title = side?.reason || 'Klasifikasi otomatis tersedia setelah analisis.';
    elements.printSideOverride.value = state.printSideOverrides[sideOverrideKey()] || 'auto';

    try {
        const layout = chooseNupLayout(job.settings.pagesPerSide, job.settings.orientation, state.sourcePageAspect);
        const mediaDims = getMediaDimensionsMm(pricing.size?.id || 'A4', layout.orientation);
        const physicalSheetAspect = mediaDims.width / mediaDims.height;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const stageWidth = Math.max(360, elements.printCanvasStage.clientWidth - 44);
        const canvasWidth = Math.min(980, stageWidth);
        const canvasHeight = canvasWidth / physicalSheetAspect;
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
            if (pageNumber) await renderPdfPageToSlot(pageNumber, ctx, slot, gray, token, job.settings.pageBorder, {
                scaleMode: job.settings.scaleMode,
                customScale: job.settings.customScale,
                sizeId: pricing.size?.id || 'A4',
                orientation: layout.orientation,
                pagesPerSide: job.settings.pagesPerSide,
                layoutMode: job.settings.layoutMode,
                sheetWidthPx: canvasWidth,
                sheetHeightPx: canvasHeight,
            });
            else {
                ctx.save(); ctx.fillStyle='#fff'; ctx.fillRect(slot.x,slot.y,slot.width,slot.height);
                if (job.settings.pageBorder) { ctx.setLineDash([8,7]); ctx.strokeStyle='rgba(100,116,139,.34)'; ctx.strokeRect(slot.x+1,slot.y+1,slot.width-2,slot.height-2); }
                ctx.restore();
            }
        }

        const modeText = job.settings.layoutMode === 'booklet'
            ? `booklet · jilid ${job.settings.bookletBinding === 'right' ? 'kanan' : 'kiri'}`
            : `${job.settings.pagesPerSide} halaman/sisi · ${job.settings.nupOrder}`;
        const duplexText = job.settings.duplex
            ? `2 sisi ${job.settings.duplexMethod === 'manual' ? 'manual' : 'otomatis'} · ${job.settings.flip === 'short' ? 'balik sisi pendek' : 'balik sisi panjang'}`
            : '1 sisi';
        const blankText = job.addedBlankPages ? ` · ${job.addedBlankPages} halaman kosong otomatis` : '';
        const scaleText = job.settings.layoutMode === 'booklet' || job.settings.pagesPerSide > 1
            ? 'Sesuaikan tiap bidang'
            : job.settings.scaleMode === 'actual' ? 'Ukuran asli'
                : job.settings.scaleMode === 'shrink' ? 'Perkecil jika terlalu besar'
                    : job.settings.scaleMode === 'custom' ? `Skala ${job.settings.customScale}%` : 'Sesuaikan';
        const orientationText = layout.orientation === 'landscape' ? 'Lanskap' : 'Potret';
        elements.printHint.textContent = `Sisi ${state.printSideIndex}/${sides.length} · ${modeText} · ${orientationText} · ${scaleText} · ${duplexText}${blankText}.`;
        live3d.capture(elements.printPreviewCanvas, state.printSide, state.printSheet);
        updateLive3D();
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
    if (elements.changeFileBtn) elements.changeFileBtn.disabled = active;
    if (elements.sourceDocumentTab) elements.sourceDocumentTab.disabled = active;
    if (elements.sourcePagesTab) elements.sourcePagesTab.disabled = active;
    elements.uploadPanel?.classList.toggle('is-busy', active);
    if (elements.firstPageBtn) elements.firstPageBtn.disabled = active || state.previewPage <= 1;
    elements.prevPageBtn.disabled = active || state.previewPage <= 1;
    elements.nextPageBtn.disabled = active || !state.pdf || state.previewPage >= state.pdf.numPages;
    if (elements.lastPageBtn) elements.lastPageBtn.disabled = active || !state.pdf || state.previewPage >= state.pdf.numPages;
    elements.pageInput.disabled = active || !state.pdf;
    elements.zoomOutBtn.disabled = active || !state.pdf;
    elements.zoomInBtn.disabled = active || !state.pdf;
    [elements.fitPageBtn, elements.fitWidthBtn, elements.actualSizeBtn, elements.rotatePreviewBtn].forEach(c => { if (c) c.disabled = active || !state.pdf; });
    [elements.presetSelect,elements.scaleMode,elements.customScale,elements.mediaSource,elements.printMaterial,elements.paperSize,elements.layoutMode,elements.pageRangeMode,elements.pageRange,elements.pageSubset,elements.pageOrder,elements.pagesPerSide,elements.nupOrder,elements.sideMode,elements.duplexFlip,elements.sheetOrientation,elements.bookletBinding,elements.printColorMode,elements.frontColorMode,elements.backColorMode,elements.printCopies,elements.collateCopies,elements.pageBorder,elements.printSideOverride].forEach(c=>{if(c)c.disabled=active;});
    [elements.firstPrintSideBtn,elements.prevPrintSideBtn,elements.nextPrintSideBtn,elements.lastPrintSideBtn,elements.printSideInput,elements.first3DSideBtn,elements.prev3DSideBtn,elements.next3DSideBtn,elements.last3DSideBtn,elements.threeDSideInput].forEach(c=>{if(c)c.disabled=active || !state.pdf;});
    if (!active) updatePrintSettingsVisibility();

    elements.analyzeBtn.classList.toggle('is-loading', active);
    elements.analyzeBtnLabel.textContent = active ? 'Sedang menganalisis…' : 'Analisis Harga Cetak';
    syncWorkspaceActions();
}

function fileExtension(file) {
    const name = String(file?.name || '').toLowerCase();
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1) : '';
}

function isPdf(file) {
    return Boolean(file && (file.type === 'application/pdf' || fileExtension(file) === 'pdf'));
}

function isWord(file) {
    return Boolean(file && ['doc', 'docx'].includes(fileExtension(file)));
}

function isImageFile(file) {
    return Boolean(file && (String(file.type || '').startsWith('image/') || ['jpg','jpeg','png','webp','bmp'].includes(fileExtension(file))));
}

function naturalFileSort(a, b) {
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'id', { numeric: true, sensitivity: 'base' });
}

function sanitizeOfficeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('script,iframe,object,embed,form,link,meta').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
        [...node.attributes].forEach(attr => {
            const name = attr.name.toLowerCase();
            const value = String(attr.value || '').trim().toLowerCase();
            if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
                node.removeAttribute(attr.name);
            }
        });
    });
    return template.innerHTML;
}

async function waitForImages(container) {
    const images = [...container.querySelectorAll('img')];
    await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    }));
}


function readUint16LE(view, offset) { return view.getUint16(offset, true); }
function readUint32LE(view, offset) { return view.getUint32(offset, true); }

async function inflateRawZipBytes(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('Browser tidak mendukung pembacaan metadata DOCX.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipTextEntries(arrayBuffer, requestedNames = []) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const wanted = new Set(requestedNames);
    const result = new Map();
    const minOffset = Math.max(0, bytes.length - 65557);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
        if (readUint32LE(view, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Struktur DOCX/ZIP tidak valid.');
    const entryCount = readUint16LE(view, eocd + 10);
    let offset = readUint32LE(view, eocd + 16);
    const decoder = new TextDecoder('utf-8');
    for (let i = 0; i < entryCount && offset + 46 <= bytes.length; i += 1) {
        if (readUint32LE(view, offset) !== 0x02014b50) break;
        const method = readUint16LE(view, offset + 10);
        const compressedSize = readUint32LE(view, offset + 20);
        const fileNameLength = readUint16LE(view, offset + 28);
        const extraLength = readUint16LE(view, offset + 30);
        const commentLength = readUint16LE(view, offset + 32);
        const localHeaderOffset = readUint32LE(view, offset + 42);
        const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
        if (wanted.has(name)) {
            if (readUint32LE(view, localHeaderOffset) !== 0x04034b50) throw new Error(`Entri DOCX ${name} rusak.`);
            const localNameLength = readUint16LE(view, localHeaderOffset + 26);
            const localExtraLength = readUint16LE(view, localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
            const compressed = bytes.slice(dataStart, dataStart + compressedSize);
            let raw;
            if (method === 0) raw = compressed;
            else if (method === 8) raw = await inflateRawZipBytes(compressed);
            else throw new Error(`Metode kompresi DOCX ${method} belum didukung.`);
            result.set(name, decoder.decode(raw));
            if (result.size === wanted.size) break;
        }
        offset += 46 + fileNameLength + extraLength + commentLength;
    }
    return result;
}

function firstXmlText(doc, localName) {
    const node = doc?.getElementsByTagNameNS?.('*', localName)?.[0] || doc?.getElementsByTagName?.(localName)?.[0];
    return String(node?.textContent || '').trim();
}

function xmlAttrByLocalName(node, localName) {
    if (!node?.attributes) return null;
    for (const attr of node.attributes) if (attr.localName === localName) return attr.value;
    return null;
}

async function readDocxLayoutMetadata(file) {
    try {
        const entries = await readZipTextEntries(await file.arrayBuffer(), ['docProps/app.xml', 'word/document.xml']);
        const parser = new DOMParser();
        const appXml = parser.parseFromString(entries.get('docProps/app.xml') || '', 'application/xml');
        const documentXml = parser.parseFromString(entries.get('word/document.xml') || '', 'application/xml');
        const savedPageCount = Math.max(0, Number.parseInt(firstXmlText(appXml, 'Pages'), 10) || 0);
        const lastRenderedBreakCount = documentXml.getElementsByTagNameNS('*', 'lastRenderedPageBreak').length;
        const sectionNodes = [...documentXml.getElementsByTagNameNS('*', 'sectPr')];
        const sections = sectionNodes.map(section => {
            const pgSz = [...section.children].find(node => node.localName === 'pgSz');
            let widthTwips = Number.parseInt(xmlAttrByLocalName(pgSz, 'w'), 10) || 0;
            let heightTwips = Number.parseInt(xmlAttrByLocalName(pgSz, 'h'), 10) || 0;
            const orient = String(xmlAttrByLocalName(pgSz, 'orient') || '').toLowerCase();
            if (orient === 'landscape' && widthTwips < heightTwips) [widthTwips, heightTwips] = [heightTwips, widthTwips];
            return {
                widthMm: widthTwips ? widthTwips * 25.4 / 1440 : 0,
                heightMm: heightTwips ? heightTwips * 25.4 / 1440 : 0,
                orientation: widthTwips > heightTwips ? 'landscape' : 'portrait',
            };
        }).filter(item => item.widthMm > 0 && item.heightMm > 0);
        return { savedPageCount, lastRenderedBreakCount, sections };
    } catch (error) {
        console.warn('Metadata pagination Word tidak dapat dibaca; memakai hasil renderer.', error);
        return { savedPageCount: 0, lastRenderedBreakCount: 0, sections: [] };
    }
}

function cssLengthPx(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text || text === 'auto' || text === 'none') return 0;
    const number = Number.parseFloat(text);
    if (!Number.isFinite(number)) return 0;
    if (text.endsWith('px')) return number;
    if (text.endsWith('pt')) return number * 96 / 72;
    if (text.endsWith('mm')) return number * 96 / 25.4;
    if (text.endsWith('cm')) return number * 96 / 2.54;
    if (text.endsWith('in')) return number * 96;
    return number;
}

function getRenderedWordPageSpec(page, metadata, index) {
    const rect = page.getBoundingClientRect();
    const computed = getComputedStyle(page);
    const widthPx = Math.max(1, rect.width || page.offsetWidth || cssLengthPx(computed.width) || 794);
    const fullHeightPx = Math.max(1, page.scrollHeight || rect.height || page.offsetHeight || 1123);
    const declaredMinHeight = cssLengthPx(page.style.minHeight);
    const declaredHeight = cssLengthPx(page.style.height);
    let ratio = 0;
    let widthMm = 0;
    let heightMm = 0;

    const sections = metadata?.sections || [];
    const section = sections[Math.min(index, Math.max(0, sections.length - 1))] || sections[0];
    if (section?.widthMm > 0 && section?.heightMm > 0) {
        widthMm = section.widthMm;
        heightMm = section.heightMm;
        ratio = heightMm / widthMm;
    }

    // Bila renderer memberi ukuran halaman eksplisit, gunakan rasionya. Min-height
    // lebih penting daripada tinggi aktual karena tinggi aktual dapat membesar ketika
    // lastRenderedPageBreak Word tidak lengkap.
    const declaredWidth = cssLengthPx(page.style.width);
    const declaredPhysicalHeight = declaredMinHeight || declaredHeight;
    if (declaredWidth > 50 && declaredPhysicalHeight > 50) {
        const cssRatio = declaredPhysicalHeight / declaredWidth;
        if (cssRatio > 0.45 && cssRatio < 2.4) ratio = cssRatio;
    }
    if (!(ratio > 0)) ratio = 1.4142;

    const physicalHeightPx = Math.max(1, widthPx * ratio);
    if (!(widthMm > 0 && heightMm > 0)) {
        widthMm = widthPx * 25.4 / 96;
        heightMm = widthMm * ratio;
    }
    return { page, widthPx, physicalHeightPx, fullHeightPx, widthMm, heightMm };
}

function computeWordSlicePlan(pageSpecs, savedPageCount = 0) {
    const EPSILON = 0.045; // toleransi 4,5% untuk rounding font/CSS browser
    let plan = pageSpecs.map(info => ({
        ...info,
        sliceCount: Math.max(1, Math.ceil((info.fullHeightPx / info.physicalHeightPx) - EPSILON)),
    }));
    let total = plan.reduce((sum, item) => sum + item.sliceCount, 0);

    // Page count yang disimpan Microsoft Word adalah pemeriksaan silang penting.
    // Jika selisih hanya berasal dari pembulatan batas halaman, sesuaikan halaman
    // yang rasio overflow-nya paling dekat ke batas berikutnya/turun tanpa mengubah
    // ukuran fisik PDF. Konten tetap diiris menurut tinggi halaman sebenarnya.
    if (savedPageCount > 0 && total !== savedPageCount) {
        const delta = savedPageCount - total;
        const candidates = plan.map((item, idx) => {
            const ratio = item.fullHeightPx / item.physicalHeightPx;
            const fractional = ratio - Math.floor(ratio);
            return { idx, ratio, fractional, slices: item.sliceCount };
        });
        if (delta > 0 && delta <= Math.max(2, Math.ceil(plan.length * 0.25))) {
            // Naikkan hanya section yang benar-benar memiliki konten melewati batas
            // halaman berikutnya. Jangan menambah halaman kosong sekadar mengejar metadata.
            const expandable = candidates
                .filter(x => x.ratio > x.slices + 0.005)
                .sort((a,b) => ((b.ratio - b.slices) - (a.ratio - a.slices)) || (b.ratio - a.ratio));
            for (let i = 0; i < delta && i < expandable.length; i += 1) plan[expandable[i].idx].sliceCount += 1;
        } else if (delta < 0 && -delta <= Math.max(2, Math.ceil(plan.length * 0.25))) {
            const reducible = candidates
                .filter(x => x.slices > 1 && x.ratio < x.slices - 0.005)
                .sort((a,b) => (a.fractional - b.fractional) || (a.ratio - b.ratio));
            let remaining = -delta;
            for (const candidate of reducible) {
                if (!remaining) break;
                if (plan[candidate.idx].sliceCount > 1) { plan[candidate.idx].sliceCount -= 1; remaining -= 1; }
            }
        }
        total = plan.reduce((sum, item) => sum + item.sliceCount, 0);
    }
    return { plan, total };
}

async function loadHighFidelityDocxRenderer() {
    try {
        const module = await import('https://esm.sh/docx-renderer@0.1.2?bundle');
        const render = module.render || module.default?.render;
        if (typeof render === 'function') return { render, engine: 'docx-renderer 0.1.2' };
    } catch (error) {
        console.warn('Renderer DOCX presisi tidak tersedia, mencoba mode kompatibilitas.', error);
    }

    const fallback = await import('https://esm.sh/docx-preview@0.4.0?bundle');
    const renderAsync = fallback.renderAsync || fallback.default?.renderAsync;
    if (typeof renderAsync !== 'function') throw new Error('Mesin tata letak DOCX gagal dimuat.');
    return {
        engine: 'docx-preview 0.4.0 (kompatibilitas)',
        render: async (file, bodyHost, styleHost, options) => {
            await renderAsync(file, bodyHost, styleHost, options);
            let pages = [...bodyHost.querySelectorAll('.docx-wrapper > section.docx')];
            if (!pages.length) pages = [...bodyHost.querySelectorAll('.docx-wrapper > section')];
            return { pages: pages.map((element, index) => ({ index, element })), dispose(){} };
        },
    };
}

async function convertDocxToPdf(file) {
    const JsPdf = window.jspdf?.jsPDF;
    if (!JsPdf || typeof window.html2canvas !== 'function') {
        throw new Error('Modul konversi DOCX ke PDF belum tersedia. Periksa koneksi internet lalu coba lagi.');
    }

    const metadata = await readDocxLayoutMetadata(file);
    const renderer = await loadHighFidelityDocxRenderer();
    const host = document.createElement('div');
    host.className = 'word-conversion-surface docx-render';
    const styleHost = document.createElement('div');
    const bodyHost = document.createElement('div');
    host.append(styleHost, bodyHost);
    document.body.appendChild(host);

    let renderResult = null;
    try {
        elements.uploadText.textContent = metadata.savedPageCount
            ? `Menyusun DOCX · target ${metadata.savedPageCount} halaman Word…`
            : 'Menyusun halaman DOCX…';
        renderResult = await renderer.render(file, bodyHost, styleHost, {
            inWrapper: true,
            hideWrapperOnPrint: false,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            // Word tidak selalu menyimpan lastRenderedPageBreak untuk setiap halaman.
            // Petunjuk tersebut tetap dipakai sebagai anchor, kemudian overflow setiap
            // halaman dipecah lagi berdasarkan ukuran fisik halaman sumber.
            ignoreLastRenderedPageBreak: false,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
            renderChanges: false,
            useBase64URL: true,
            debug: false,
        });

        await waitForImages(host);
        try { await document.fonts?.ready; } catch (_) { /* best-effort */ }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        let pages = Array.isArray(renderResult?.pages)
            ? renderResult.pages.map(item => item?.element).filter(Boolean)
            : [];
        if (!pages.length) pages = [...bodyHost.querySelectorAll('.docx-wrapper > section.docx')];
        if (!pages.length) pages = [...bodyHost.querySelectorAll('.docx-wrapper > section')];
        if (!pages.length) throw new Error('Halaman DOCX tidak dapat dibentuk dari tata letak dokumen.');

        // Penting: tinggi DOM aktual tidak boleh dianggap tinggi fisik halaman. Pada
        // DOCX tertentu Word hanya menyimpan sebagian lastRenderedPageBreak; renderer
        // akan membuat section yang memanjang. Tinggi fisik dihitung dari lebar
        // halaman + rasio ukuran Word, lalu section panjang diiris menjadi halaman.
        const pageSpecs = pages.map((page, index) => getRenderedWordPageSpec(page, metadata, index));
        const { plan, total: totalOutputPages } = computeWordSlicePlan(pageSpecs, metadata.savedPageCount);

        let pdf = null;
        let outIndex = 0;
        for (const info of plan) {
            const { page, widthPx, physicalHeightPx, fullHeightPx, widthMm, heightMm, sliceCount } = info;
            const orientation = widthMm > heightMm ? 'landscape' : 'portrait';
            const captureScale = 1.6;
            const fullCanvas = await window.html2canvas(page, {
                scale: captureScale,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0,
                width: Math.ceil(widthPx),
                height: Math.ceil(fullHeightPx),
                windowWidth: Math.max(document.documentElement.clientWidth, Math.ceil(widthPx + 80)),
                windowHeight: Math.max(document.documentElement.clientHeight, Math.ceil(fullHeightPx + 80)),
            });

            for (let slice = 0; slice < sliceCount; slice += 1) {
                outIndex += 1;
                elements.uploadText.textContent = `Membentuk PDF halaman ${outIndex} dari ${totalOutputPages}…`;
                const sourceY = Math.round(slice * physicalHeightPx * captureScale);
                const requestedHeight = Math.round(physicalHeightPx * captureScale);
                const sourceHeight = Math.min(requestedHeight, Math.max(0, fullCanvas.height - sourceY));
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = fullCanvas.width;
                pageCanvas.height = requestedHeight;
                const ctx = pageCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                if (sourceHeight > 0) ctx.drawImage(fullCanvas, 0, sourceY, fullCanvas.width, sourceHeight, 0, 0, pageCanvas.width, sourceHeight);
                const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.96);

                if (!pdf) pdf = new JsPdf({ unit: 'mm', format: [widthMm, heightMm], orientation, compress: true });
                else pdf.addPage([widthMm, heightMm], orientation);
                pdf.addImage(dataUrl, 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST');
            }
        }

        const arrayBuffer = pdf.output('arraybuffer');
        const output = new File([arrayBuffer], file.name.replace(/\.docx$/i, '.pdf'), { type: 'application/pdf', lastModified: Date.now() });
        output.__conversionEngine = renderer.engine;
        output.__sourcePageCount = pages.length;
        output.__outputPageCount = totalOutputPages;
        output.__expectedPageCount = metadata.savedPageCount || 0;
        output.__wordBreakCount = metadata.lastRenderedBreakCount || 0;
        return output;
    } finally {
        try { renderResult?.dispose?.(); } catch (_) { /* noop */ }
        host.remove();
    }
}

async function convertLegacyDocToPdf(file) {
    if (!window.html2pdf) throw new Error('Modul konversi DOC ke PDF belum tersedia. Periksa koneksi internet lalu coba lagi.');
    const module = await import('https://esm.sh/office-oxide-wasm@0.1.8/web');
    const init = module.default;
    const WasmDocument = module.WasmDocument;
    if (typeof init !== 'function' || typeof WasmDocument !== 'function') throw new Error('Modul pembaca DOC gagal dimuat.');
    await init();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let doc;
    let html = '';
    try {
        doc = new WasmDocument(bytes, 'doc');
        html = doc.toHtml();
    } finally {
        try { doc?.free?.(); } catch (_) { /* noop */ }
    }
    if (!String(html || '').trim()) throw new Error('Isi dokumen DOC tidak dapat dikonversi.');

    const host = document.createElement('div');
    host.className = 'word-conversion-surface legacy-render';
    host.innerHTML = `<article class="word-conversion-page">${sanitizeOfficeHtml(html)}</article>`;
    document.body.appendChild(host);
    try {
        await waitForImages(host);
        const worker = window.html2pdf().set({
            margin: [15, 15, 15, 15],
            filename: `${file.name.replace(/\.doc$/i, '')}.pdf`,
            image: { type: 'jpeg', quality: 0.96 },
            html2canvas: { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
            pagebreak: { mode: ['css', 'legacy'] },
        }).from(host.querySelector('.word-conversion-page')).toPdf();
        const arrayBuffer = await worker.outputPdf('arraybuffer');
        return new File([arrayBuffer], file.name.replace(/\.doc$/i, '.pdf'), { type: 'application/pdf', lastModified: Date.now() });
    } finally {
        host.remove();
    }
}

async function convertWordToPdf(file) {
    return fileExtension(file) === 'docx' ? convertDocxToPdf(file) : convertLegacyDocToPdf(file);
}

async function imageFileToJpegData(file) {
    const bitmap = await createImageBitmap(file);
    try {
        const maxSide = 3000;
        const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * ratio));
        const height = Math.max(1, Math.round(bitmap.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        return { dataUrl: canvas.toDataURL('image/jpeg', 0.94), width, height };
    } finally {
        bitmap.close?.();
    }
}

async function convertImagesToPdf(files) {
    const JsPdf = window.jspdf?.jsPDF;
    if (!JsPdf) throw new Error('Modul konversi gambar ke PDF belum tersedia. Periksa koneksi internet lalu coba lagi.');
    const ordered = [...files].sort(naturalFileSort);
    let pdf = null;
    for (let i = 0; i < ordered.length; i += 1) {
        elements.uploadText.textContent = `Mengonversi gambar ${i + 1} dari ${ordered.length}…`;
        const img = await imageFileToJpegData(ordered[i]);
        const aspect = img.width / Math.max(1, img.height);
        let pageW; let pageH;
        if (aspect >= 1) {
            pageW = 842; pageH = pageW / aspect;
            if (pageH > 595) { pageH = 595; pageW = pageH * aspect; }
        } else {
            pageH = 842; pageW = pageH * aspect;
            if (pageW > 595) { pageW = 595; pageH = pageW / aspect; }
        }
        if (!pdf) pdf = new JsPdf({ unit: 'pt', format: [pageW, pageH], orientation: pageW >= pageH ? 'landscape' : 'portrait', compress: true });
        else pdf.addPage([pageW, pageH], pageW >= pageH ? 'landscape' : 'portrait');
        pdf.addImage(img.dataUrl, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
    }
    const buffer = pdf.output('arraybuffer');
    const name = ordered.length === 1
        ? ordered[0].name.replace(/\.[^.]+$/, '.pdf')
        : `Gabungan-${ordered.length}-gambar.pdf`;
    return new File([buffer], name, { type: 'application/pdf', lastModified: Date.now() });
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
    if (elements.threeDViewer) elements.threeDViewer.hidden = true;
    elements.previewTabs.hidden = true;
    elements.printSettings.hidden = true;
    elements.previewSubtitle.textContent = 'Belum ada file yang dipilih.';
    elements.previewCanvas.width = 1;
    elements.previewCanvas.height = 1;
    elements.pageInput.value = '1';
    elements.pageTotal.textContent = '0';
    if (elements.printSideTotal) elements.printSideTotal.textContent = '0';
    if (elements.threeDSideTotal) elements.threeDSideTotal.textContent = '0';
    if (elements.printSideInput) elements.printSideInput.value = '1';
    if (elements.threeDSideInput) elements.threeDSideInput.value = '1';
    elements.zoomLabel.textContent = 'Sesuaikan halaman';
    live3d.clear?.();
    state.previewPage = 1; state.previewZoom = 1; state.previewViewMode='fit-page'; state.previewRotation=0; state.previewEffectiveScale=1; state.previewMode='document'; state.printSheet=1; state.printSide='front'; state.printSideIndex=1; state.printJob=null; state.printSideOverrides={}; state.printPreviewToken++; state.threeDPrimeToken++; state.sourcePageAspect=.707; state.printSettings={...PRINT_JOB_DEFAULTS}; writePrintSettingsToUi(state.printSettings);
}

function resetResultUi() {
    state.analysis = null;
    state.resultFilter = 'ALL';
    state.selectedResultPage = null;
    elements.resultContent.hidden = true;
    elements.resultEmpty.hidden = false;
    elements.resultSubtitle.textContent = 'Rincian harga dan klasifikasi dokumen.';
    elements.pageResults.replaceChildren();
    if (elements.allCount) elements.allCount.textContent = '0';
    elements.newAnalysisBtn.hidden = true;
    if(elements.jobSheetCount)elements.jobSheetCount.textContent='0';if(elements.jobSideCount)elements.jobSideCount.textContent='0';if(elements.jobNupLabel)elements.jobNupLabel.textContent='1 halaman/sisi';if(elements.jobCopiesLabel)elements.jobCopiesLabel.textContent='1×';if(elements.jobColorSummary)elements.jobColorSummary.textContent='Klasifikasi warna akan muncul setelah analisis.';if(elements.jobPriceBreakdown)elements.jobPriceBreakdown.replaceChildren();if(elements.resultDetailSummary)elements.resultDetailSummary.textContent='Lembar, media, layout, dan tarif';
    $$('.stat-card').forEach(button => button.classList.toggle('is-active', button.dataset.filter === 'ALL'));
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
    state.sourceFiles = [];
    state.sourceKind = null;
    state.sourceDisplayName = '';
    state.analysis = null;
    clearSourceThumbnails();
    state.sourceTab = 'document';
    elements.fileInput.value = '';
    elements.selectedFile.hidden = true;
    if (elements.fileBadge) elements.fileBadge.textContent = 'FILE';
    elements.uploadText.textContent = 'Klik atau seret berkas ke sini';
    resetProgress();
    resetPreviewUi();
    resetResultUi();
    setAnalyzing(false);
    [elements.settingsDialog, elements.previewDialog, elements.resultDialog].forEach(closeAppDialog);
    syncWorkspaceActions();
}

async function loadPdfFile(file, { sourceFiles = [file], sourceKind = 'pdf', sourceDisplayName = file.name, sourceMeta = 'PDF' } = {}) {
    await destroyPdf();
    resetResultUi();
    resetProgress();

    state.file = file;
    state.sourceFiles = [...sourceFiles];
    state.sourceKind = sourceKind;
    state.sourceDisplayName = sourceDisplayName;
    state.previewPage = 1;
    state.previewZoom = 1;
    state.previewViewMode = 'fit-page';
    state.previewRotation = 0;

    elements.selectedFile.hidden = false;
    elements.selectedFileName.textContent = sourceDisplayName;
    elements.selectedFileMeta.textContent = sourceMeta;
    if (elements.fileBadge) elements.fileBadge.textContent = sourceKind === 'images' ? 'IMG' : sourceKind === 'word' ? 'WORD' : 'PDF';
    elements.uploadText.textContent = 'Berkas siap ditinjau';
    elements.previewEmpty.hidden = true;
    elements.pdfViewer.hidden = false;
    elements.previewSubtitle.textContent = 'Membuka dokumen…';
    elements.canvasLoader.hidden = false;
    elements.analyzeBtn.disabled = true;

    try {
        state.pdfData = new Uint8Array(await file.arrayBuffer());
        state.loadingTask = pdfjsLib.getDocument({ data: state.pdfData, isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
        state.pdf = await state.loadingTask.promise;
        if (!state.pdf.numPages) throw new Error('Dokumen tidak memiliki halaman yang dapat ditampilkan.');

        elements.pageTotal.textContent = String(state.pdf.numPages);
        elements.pageInput.max = String(state.pdf.numPages);
        clearSourceThumbnails();
        if (elements.sourceThumbnailStatus) elements.sourceThumbnailStatus.textContent = `${state.pdf.numPages} halaman`;
        const sourceSuffix = sourceKind === 'pdf' ? formatBytes(file.size) : sourceMeta;
        elements.previewSubtitle.textContent = `${state.pdf.numPages} halaman · ${sourceSuffix}`;
        elements.selectedFileMeta.textContent = `${state.pdf.numPages} halaman · ${sourceMeta}`;
        elements.previewTabs.hidden = false;
        elements.printSettings.hidden = false;
        state.previewMode = 'document'; state.printSheet = 1; state.printSide = 'front'; state.printSideIndex = 1;
        writePrintSettingsToUi(state.printSettings);
        syncWorkspaceActions();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        try { const fp = await state.pdf.getPage(1); const fv = fp.getViewport({scale:1}); state.sourcePageAspect = fv.width / Math.max(1, fv.height); fp.cleanup(); } catch (_) { state.sourcePageAspect = .707; }
        refreshPrintJob({render:false});
        await renderPreviewPage(1);
        setAnalyzing(false);
        syncWorkspaceActions();
    } catch (error) {
        console.error(error);
        await destroyPdf();
        elements.canvasLoader.hidden = true;
        elements.pdfViewer.hidden = true; elements.printViewer.hidden = true; elements.previewTabs.hidden = true; elements.printSettings.hidden = true;
        elements.previewEmpty.hidden = false;
        elements.previewSubtitle.textContent = 'Pratinjau gagal dimuat.';
        elements.analyzeBtn.disabled = true;
        syncWorkspaceActions();
        let message = error?.message || 'Dokumen gagal dibuka.';
        if (/password/i.test(message)) message = 'PDF dilindungi password dan belum dapat dianalisis.';
        await sweetAlert({ icon:'error', title:'Dokumen tidak dapat dibuka', text:message, confirmButtonText:'Tutup' });
    }
}

async function validateAndLoadFiles(fileList) {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;
    const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
    if (totalBytes > MAX_SIZE) {
        await sweetAlert({ icon:'warning', title:'Berkas terlalu besar', text:`Jumlah ukuran maksimum adalah ${formatBytes(MAX_SIZE)}. Pilihan ini berukuran ${formatBytes(totalBytes)}.`, confirmButtonText:'Mengerti' });
        return;
    }

    const allImages = files.every(isImageFile);
    if (files.length > 1 && !allImages) {
        await sweetAlert({ icon:'warning', title:'Pilih satu dokumen atau beberapa gambar', text:'PDF dan Word diproses satu per satu. Untuk gambar, Anda dapat memilih beberapa JPG/PNG/WebP/BMP sekaligus.', confirmButtonText:'Mengerti' });
        return;
    }
    if (files.length > 100) {
        await sweetAlert({ icon:'warning', title:'Terlalu banyak gambar', text:'Maksimal 100 gambar dalam satu kali analisis.', confirmButtonText:'Mengerti' });
        return;
    }

    const first = files[0];
    if (!isPdf(first) && !isWord(first) && !isImageFile(first)) {
        await sweetAlert({ icon:'warning', title:'Format tidak didukung', text:'Gunakan PDF, DOC, DOCX, JPG/JPEG, PNG, WebP, atau BMP.', confirmButtonText:'Mengerti' });
        return;
    }

    elements.fileInput.disabled = true;
    try {
        if (isPdf(first)) {
            await loadPdfFile(first, { sourceFiles:[first], sourceKind:'pdf', sourceDisplayName:first.name, sourceMeta:`${formatBytes(first.size)} · PDF` });
            return;
        }
        if (isWord(first)) {
            const ext = fileExtension(first);
            elements.uploadText.textContent = ext === 'docx' ? 'Membaca tata letak DOCX…' : 'Mengonversi DOC ke PDF…';
            const pdfFile = await convertWordToPdf(first);
            const expectedPages = Number(pdfFile.__expectedPageCount || 0);
            const outputPages = Number(pdfFile.__outputPageCount || 0);
            const pageInfo = ext === 'docx' && expectedPages ? ` · Word menyimpan ${expectedPages} halaman` : '';
            const meta = ext === 'docx'
                ? `${formatBytes(first.size)} · DOCX → PDF${pageInfo} · ukuran/orientasi mengikuti dokumen`
                : `${formatBytes(first.size)} · DOC → PDF · mode kompatibilitas`;
            await loadPdfFile(pdfFile, { sourceFiles:[first], sourceKind:'word', sourceDisplayName:first.name, sourceMeta:meta });
            if (ext === 'docx' && expectedPages && outputPages !== expectedPages) {
                await sweetAlert({
                    icon: 'warning',
                    title: 'Pagination Word perlu diperiksa',
                    text: `Microsoft Word menyimpan ${expectedPages} halaman, sedangkan konversi browser membentuk ${outputPages}. Gunakan pratinjau sebelum menghitung harga; untuk hasil identik 100%, PDF hasil ekspor Word tetap menjadi acuan terbaik.`,
                    confirmButtonText: 'Mengerti',
                });
            } else if (ext === 'docx') showToast('success', expectedPages ? `DOCX sesuai metadata Word · ${expectedPages} halaman` : 'DOCX dikonversi ke PDF');
            else showToast('warning', 'DOC lama memakai mode kompatibilitas; DOCX/PDF lebih akurat untuk tata letak');
            return;
        }
        if (allImages) {
            const ordered = [...files].sort(naturalFileSort);
            elements.uploadText.textContent = `Menggabungkan ${ordered.length} gambar…`;
            const pdfFile = await convertImagesToPdf(ordered);
            const totalSourceSize = ordered.reduce((sum, f) => sum + f.size, 0);
            await loadPdfFile(pdfFile, { sourceFiles:ordered, sourceKind:'images', sourceDisplayName:ordered.length === 1 ? ordered[0].name : `${ordered.length} gambar`, sourceMeta:`${formatBytes(totalSourceSize)} · ${ordered.length} gambar → PDF · urutan nama file` });
            showToast('success', ordered.length > 1 ? `${ordered.length} gambar digabung menjadi PDF` : 'Gambar dikonversi menjadi PDF');
        }
    } catch (error) {
        console.error(error);
        elements.uploadText.textContent = 'Klik atau seret berkas ke sini';
        await sweetAlert({ icon:'error', title:'Konversi gagal', text:error?.message || 'Berkas tidak dapat dikonversi untuk analisis.', confirmButtonText:'Tutup' });
    } finally {
        elements.fileInput.disabled = state.analyzing;
        elements.fileInput.value = '';
    }
}

async function renderPreviewPage(pageNumber) {
    if (!state.pdf || state.analyzing) return;

    const nextPage = clamp(Number(pageNumber) || 1, 1, state.pdf.numPages);
    const renderToken = ++state.previewRenderToken;
    state.previewPage = nextPage;
    syncSourceThumbnailSelection();

    if (state.analysis) {
        state.selectedResultPage = nextPage;
        syncSelectedResultRow({ scrollIntoView: true });
    }

    elements.pageInput.value = String(nextPage);
    elements.canvasLoader.hidden = false;

    if (state.previewRenderTask) {
        const previousTask = state.previewRenderTask;
        try { previousTask.cancel(); } catch (_) { /* noop */ }
        try { await previousTask.promise; } catch (error) {
            if (error?.name !== 'RenderingCancelledException') {
                console.warn('Render pratinjau sebelumnya berhenti dengan error:', error);
            }
        }
        if (state.previewRenderTask === previousTask) state.previewRenderTask = null;
    }

    if (renderToken !== state.previewRenderToken || !state.pdf || state.analyzing) return;

    let page = null;
    let renderTask = null;

    try {
        page = await state.pdf.getPage(nextPage);
        if (renderToken !== state.previewRenderToken) return;

        const rotation = (((Number(page.rotate) || 0) + state.previewRotation) % 360 + 360) % 360;
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const stageWidth = Math.max(320, elements.canvasStage.clientWidth - 48);
        const stageHeight = Math.max(360, elements.canvasStage.clientHeight - 48);

        const fitPageScale = Math.min(
            stageWidth / Math.max(1, baseViewport.width),
            stageHeight / Math.max(1, baseViewport.height),
        );
        const fitWidthScale = stageWidth / Math.max(1, baseViewport.width);
        const actualScale = PDF_CSS_UNITS;

        let displayScale;
        if (state.previewViewMode === 'fit-width') displayScale = fitWidthScale;
        else if (state.previewViewMode === 'actual') displayScale = actualScale;
        else if (state.previewViewMode === 'custom') displayScale = actualScale * state.previewZoom;
        else displayScale = fitPageScale;

        displayScale = clamp(displayScale, 0.2, 5);
        state.previewEffectiveScale = displayScale / actualScale;

        const dpr = Math.min(PREVIEW_MAX_DPR, window.devicePixelRatio || 1);
        const cssViewport = page.getViewport({ scale: displayScale, rotation });
        const requestedWidth = Math.max(1, cssViewport.width * dpr);
        const requestedHeight = Math.max(1, cssViewport.height * dpr);
        const canvasSafetyScale = Math.min(
            1,
            PREVIEW_MAX_CANVAS_DIMENSION / requestedWidth,
            PREVIEW_MAX_CANVAS_DIMENSION / requestedHeight,
            Math.sqrt(PREVIEW_MAX_CANVAS_PIXELS / Math.max(1, requestedWidth * requestedHeight)),
        );
        const renderScale = Math.max(0.05, displayScale * dpr * canvasSafetyScale);
        const viewport = page.getViewport({ scale: renderScale, rotation });

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
            console.error('Render pratinjau gagal:', error);
            showToast('error', `Pratinjau halaman gagal dirender${error?.message ? `: ${error.message}` : ''}`);
        }
    } finally {
        if (state.previewRenderTask === renderTask) state.previewRenderTask = null;
        try { page?.cleanup(); } catch (_) { /* noop */ }
        if (renderToken === state.previewRenderToken) elements.canvasLoader.hidden = true;
    }
}

function updatePreviewControls() {
    if (!state.pdf) return;
    if (elements.firstPageBtn) elements.firstPageBtn.disabled = state.analyzing || state.previewPage <= 1;
    elements.prevPageBtn.disabled = state.analyzing || state.previewPage <= 1;
    elements.nextPageBtn.disabled = state.analyzing || state.previewPage >= state.pdf.numPages;
    if (elements.lastPageBtn) elements.lastPageBtn.disabled = state.analyzing || state.previewPage >= state.pdf.numPages;
    elements.pageInput.value = String(state.previewPage);

    const labels = {
        'fit-page': 'Sesuaikan halaman',
        'fit-width': 'Sesuaikan lebar',
        actual: '100%',
    };
    elements.zoomLabel.textContent = state.previewViewMode === 'custom'
        ? `${Math.round(state.previewZoom * 100)}%`
        : (labels[state.previewViewMode] || 'Sesuaikan halaman');

    elements.fitPageBtn?.classList.toggle('is-active', state.previewViewMode === 'fit-page');
    elements.fitWidthBtn?.classList.toggle('is-active', state.previewViewMode === 'fit-width');
    elements.actualSizeBtn?.classList.toggle('is-active', state.previewViewMode === 'actual');
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
        throw new Error('Pilih berkas cetak terlebih dahulu.');
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
        filename: state.sourceDisplayName || state.file.name,
        file_type: state.sourceKind === 'word' ? 'WORD→PDF' : state.sourceKind === 'images' ? 'GAMBAR→PDF' : 'PDF',
        file_size_bytes: (state.sourceFiles || []).reduce((sum, f) => sum + (Number(f.size) || 0), 0) || state.file.size,
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
    const counts = {H:0, HW:0, W:0, D:0};
    for (const page of pages) {
        let type = ['H','HW','W','D'].includes(page.type) ? page.type : 'H';
        if (type === 'W') {
            const cc = Number(page.color_coverage) || 0;
            const sc = Number(page.strong_color_coverage) || 0;
            const ink = Number(page.ink_coverage) || 0;
            const raster = Number(page.raster_image_area) || 0;
            if (cc >= 38 || (sc >= 9 && ink >= 48) || (raster >= 45 && cc >= 24 && ink >= 55)) type = 'D';
        }
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
        d_count: counts.D,
        total_cost: counts.H*pricing.prices.H + counts.HW*pricing.prices.HW + counts.W*pricing.prices.W + counts.D*pricing.prices.D,
        prices: {...pricing.prices},
        engine: payload.engine,
        ui_version: CONFIG.version || '2.11.0',
        document_profile: {
            ...payload.document_profile,
            document_mode: payload.document_profile?.documentMode || payload.document_profile?.document_mode || 'Native/Mixed PDF'
        },
        analysis_basis: 'Analisis 100% client-side; pricing publik v6, empat kelas warna, pasangan duplex, dan physical booklet 3D.'
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
    if (elements.allCount) elements.allCount.textContent = analysis.total_pages;
    elements.hCount.textContent = analysis.h_count;
    elements.hwCount.textContent = analysis.hw_count;
    elements.wCount.textContent = analysis.w_count;
    if (elements.dCount) elements.dCount.textContent = analysis.d_count || 0;
    updatePricingLabels(currentPricing());

    $$('.stat-card').forEach(button => button.classList.toggle('is-active', button.dataset.filter === 'ALL'));
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
        row.title = `Tampilkan halaman ${page.page} di pratinjau`;
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
        type.textContent = PRICE_CLASS_META[page.type]?.short || page.type;

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
        source.title = page.analysis_source ? `Sumber analisis: ${page.analysis_source}` : '';

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
    syncSourceThumbnailSelection({ scrollIntoView: true });
    await renderPreviewPage(pageNumber);
    elements.canvasStage.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
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
        syncWorkspaceActions();
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
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    await validateAndLoadFiles(files);
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
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    await validateAndLoadFiles(files);
});

elements.dropZone.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !state.analyzing) {
        event.preventDefault();
        elements.fileInput.click();
    }
});

elements.sourceDocumentTab?.addEventListener('click', () => setSourceTab('document'));
elements.sourcePagesTab?.addEventListener('click', () => setSourceTab('pages'));
elements.sourceThumbnailList?.addEventListener('click', event => {
    const button = event.target.closest('.source-thumb');
    if (!button || !state.pdf || state.analyzing) return;
    const page = Number(button.dataset.page) || 1;
    setPreviewMode('document');
    renderPreviewPage(page);
});
elements.changeFileBtn?.addEventListener('click', () => {
    if (!state.analyzing) elements.fileInput.click();
});

elements.clearBtn.addEventListener('click', () => resetApplication({ confirm: true }));
elements.newAnalysisBtn.addEventListener('click', () => resetApplication({ confirm: true }));
elements.analyzeBtn.addEventListener('click', runAnalysis);
elements.openSettingsBtn?.addEventListener('click', () => openAppDialog(elements.settingsDialog));
elements.openPreviewBtn?.addEventListener('click', () => openAppDialog(elements.previewDialog));
elements.openResultsBtn?.addEventListener('click', () => openAppDialog(elements.resultDialog));
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeAppDialog(document.getElementById(button.dataset.closeDialog))));
[elements.settingsDialog, elements.previewDialog, elements.resultDialog].forEach(dialog => {
    dialog?.addEventListener('close', () => { if (!document.querySelector('dialog.app-dialog[open]')) document.body.classList.remove('dialog-open'); });
    dialog?.addEventListener('click', event => { if (event.target === dialog) closeAppDialog(dialog); });
});

// Preview navigation.
elements.firstPageBtn?.addEventListener('click', () => renderPreviewPage(1));
elements.prevPageBtn.addEventListener('click', () => renderPreviewPage(state.previewPage - 1));
elements.nextPageBtn.addEventListener('click', () => renderPreviewPage(state.previewPage + 1));
elements.lastPageBtn?.addEventListener('click', () => state.pdf && renderPreviewPage(state.pdf.numPages));
elements.pageInput.addEventListener('change', () => renderPreviewPage(elements.pageInput.value));
elements.pageInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        elements.pageInput.blur();
        renderPreviewPage(elements.pageInput.value);
    }
});

function setCustomPreviewZoom(nextZoom) {
    state.previewZoom = clamp(Number(nextZoom) || 1, 0.25, 4);
    state.previewViewMode = 'custom';
    updatePreviewControls();
    renderPreviewPage(state.previewPage);
}

elements.zoomOutBtn.addEventListener('click', () => {
    const current = state.previewViewMode === 'custom' ? state.previewZoom : state.previewEffectiveScale;
    setCustomPreviewZoom(current - 0.10);
});

elements.zoomInBtn.addEventListener('click', () => {
    const current = state.previewViewMode === 'custom' ? state.previewZoom : state.previewEffectiveScale;
    setCustomPreviewZoom(current + 0.10);
});

elements.fitPageBtn?.addEventListener('click', () => {
    state.previewViewMode = 'fit-page';
    updatePreviewControls();
    renderPreviewPage(state.previewPage);
});

elements.fitWidthBtn?.addEventListener('click', () => {
    state.previewViewMode = 'fit-width';
    updatePreviewControls();
    renderPreviewPage(state.previewPage);
});

elements.actualSizeBtn?.addEventListener('click', () => {
    state.previewViewMode = 'actual';
    state.previewZoom = 1;
    updatePreviewControls();
    renderPreviewPage(state.previewPage);
});

elements.rotatePreviewBtn?.addEventListener('click', () => {
    state.previewRotation = (state.previewRotation + 90) % 360;
    renderPreviewPage(state.previewPage);
});

// Hasil dan filter. Satu baris kartu ringkasan sekaligus menjadi filter.
$$('.stat-card').forEach(button => {
    button.addEventListener('click', () => {
        const filter = button.dataset.filter || 'ALL';
        state.resultFilter = filter;
        $$('.stat-card').forEach(item => item.classList.toggle('is-active', item === button));
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
elements.threeDPreviewTab?.addEventListener('click', () => setPreviewMode('3d'));
elements.presetSelect?.addEventListener('change', () => applyPreset(elements.presetSelect.value));
elements.scaleMode?.addEventListener('change', () => {
    updatePrintSettingsVisibility();
    if (state.previewMode === 'print') renderPrintSidePreview();
    else if (state.previewMode === '3d') prime3DCurrentSheet().catch(error => console.warn('Texture 3D gagal diperbarui:', error));
});
elements.customScale?.addEventListener('change', () => {
    elements.customScale.value = String(Math.round(clamp(Number(elements.customScale.value) || 100, 10, 400)));
    if (state.previewMode === 'print') renderPrintSidePreview();
    else if (state.previewMode === '3d') prime3DCurrentSheet().catch(error => console.warn('Texture 3D gagal diperbarui:', error));
});
$$('.handling-tab').forEach(button => button.addEventListener('click', () => {
    setHandlingMode(button.dataset.handling || 'size');
}));

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
    if (['H', 'HW', 'W', 'D'].includes(value)) state.printSideOverrides[key] = value;
    else delete state.printSideOverrides[key];
    updatePrintSettingsVisibility();
    refreshPrintJob({ render: true });
});

elements.firstPrintSideBtn?.addEventListener('click', () => {
    state.printSideIndex = 1;
    syncInternalSideFromIndex();
    renderPrintSidePreview();
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
elements.lastPrintSideBtn?.addEventListener('click', () => {
    state.printSideIndex = Math.max(1, getPrintableSides().length);
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


elements.first3DSideBtn?.addEventListener('click', () => navigate3DSide(1));
elements.prev3DSideBtn?.addEventListener('click', () => navigate3DSide(state.printSideIndex - 1));
elements.next3DSideBtn?.addEventListener('click', () => navigate3DSide(state.printSideIndex + 1));
elements.last3DSideBtn?.addEventListener('click', () => navigate3DSide(getPrintableSides().length));
elements.threeDSideInput?.addEventListener('change', () => navigate3DSide(elements.threeDSideInput.value));
elements.threeDSideInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        elements.threeDSideInput.blur();
        navigate3DSide(elements.threeDSideInput.value);
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
    refreshPricingUi({refreshJob:true});
});

let resizeTimer = null;
window.addEventListener('resize', () => {
    if (!state.pdf || state.analyzing) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if(state.previewMode==='print')renderPrintSidePreview(); else if(state.previewMode==='3d')updateLive3D(); else renderPreviewPage(state.previewPage); }, 180);
});

window.addEventListener('beforeunload', () => {
    if (state.loadingTask && typeof state.loadingTask.destroy === 'function' && !state.loadingTask.destroyed) {
        state.loadingTask.destroy().catch(() => {});
    }
});

setupSettingsTabs();
updateSettingsGroupSummaries();
resetPreviewUi();
resetResultUi();
setAnalyzing(false);
syncWorkspaceActions();
initializePricing().catch(error => { console.error(error); showToast('error', 'Konfigurasi tarif gagal dimuat'); });
