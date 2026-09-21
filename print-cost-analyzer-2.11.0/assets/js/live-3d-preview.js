const MM = {
  A7:[74,105], A6:[105,148], A5:[148,210], B5:[176,250], A4:[210,297], A4s:[215,330],
  F4:[215,330], Folio:[215,330], B4:[250,353], A3:[297,420], 'A3+':[329,483]
};

function materialClass(material = {}) {
  const id = String(material.id || '');
  const family = String(material.family || '');
  if (id.includes('transparent')) return 'material-transparent';
  if (family.includes('photo') || id.includes('glossy')) return 'material-glossy';
  if (id.includes('silky')) return 'material-silky';
  if (family.includes('sticker')) return 'material-sticker';
  if (id.includes('linen')) return 'material-linen';
  return 'material-paper';
}

function setTexture(el, data, fallback = '') {
  if (!el) return;
  el.style.backgroundImage = data ? `url(${data})` : '';
  if (el.dataset) el.dataset.fallback = fallback;
}

export function getBookletLogicalSequence(job) {
  const seq = [...(job?.selectedPages || [])];
  for (let i = 0; i < Number(job?.addedBlankPages || 0); i++) seq.push(null);
  return seq;
}

export function getBookletOuterPages(job) {
  const sheet = job?.sheets?.[0];
  const pages = sheet?.front?.pages || [];
  const rightBinding = job?.settings?.bookletBinding === 'right';
  return rightBinding
    ? { front: pages[0] ?? null, back: pages[1] ?? null }
    : { front: pages[1] ?? null, back: pages[0] ?? null };
}

export function getBookletSpreads(job) {
  const seq = getBookletLogicalSequence(job);
  if (!seq.length) return [];

  const pairs = [];
  const rightBinding = job?.settings?.bookletBinding === 'right';

  // Tampilan buku terbuka dimulai dari sampul/halaman 1, seperti buku fisik:
  // jilid kiri => halaman 1 di kanan; jilid kanan => halaman 1 di kiri.
  pairs.push(rightBinding ? [seq[0] ?? null, null] : [null, seq[0] ?? null]);

  for (let i = 1; i < seq.length; i += 2) {
    const a = seq[i] ?? null;
    const b = seq[i + 1] ?? null;
    pairs.push(rightBinding ? [b, a] : [a, b]);
  }
  return pairs;
}

function estimatePaperThicknessMm(gsm) {
  // Practical office-paper approximation. 80 gsm ≈ 0.10 mm.
  return Math.max(0.06, (Number(gsm) || 80) * 0.00125);
}

export function initLive3D(elements = {}) {
  const stage = elements.stage;
  const object = elements.object;
  const front = elements.front;
  const back = elements.back;
  const stack = elements.stack;
  const info = elements.info;
  const sideNav = elements.sideNav;
  const folded = elements.folded;
  const foldedFront = elements.foldedFront;
  const foldedBack = elements.foldedBack;
  const foldedStack = elements.foldedStack;
  const book = elements.book;
  const bookLeft = elements.bookLeft;
  const bookRight = elements.bookRight;
  const bookLeftStack = elements.bookLeftStack;
  const bookRightStack = elements.bookRightStack;
  const bookSpine = elements.bookSpine;
  const bookletControls = elements.bookletControls;
  const spreadControls = elements.spreadControls;
  const spreadLabel = elements.spreadLabel;
  const firstSpreadBtn = elements.firstSpreadBtn;
  const lastSpreadBtn = elements.lastSpreadBtn;
  const loadPageTexture = typeof elements.pageTextureLoader === 'function' ? elements.pageTextureLoader : null;

  if (!stage || !object || !front || !back) {
    return { update(){}, capture(){}, reset(){}, clear(){}, focusSide(){}, getVisibleBookletPages(){ return []; } };
  }

  let rx = -16, ry = 26, zoom = 1, dragging = false, px = 0, py = 0;
  let currentKey = '1';
  let currentJob = null;
  let currentSelection = null;
  let bookletMode = 'sheet';
  let bookletSpreadIndex = 0;
  let documentKey = '';
  let wasBooklet = false;
  const snapshots = new Map();
  const pageTextures = new Map();
  const loadingPages = new Map();

  function activeObjects() {
    return [object, folded, book].filter(Boolean);
  }

  function apply() {
    const transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(${zoom})`;
    for (const el of activeObjects()) el.style.transform = transform;
  }

  function reset() {
    rx = -16; ry = 26; zoom = 1; apply();
  }

  function focusSide(side = 'front') {
    rx = -16;
    ry = side === 'back' ? 206 : 26;
    apply();
  }

  function clear() {
    snapshots.clear();
    pageTextures.clear();
    loadingPages.clear();
    currentJob = null;
    currentSelection = null;
    currentKey = '1';
    bookletMode = 'sheet';
    bookletSpreadIndex = 0;
    documentKey = '';
    wasBooklet = false;
    setTexture(front, ''); setTexture(back, '');
    setTexture(foldedFront, ''); setTexture(foldedBack, '');
    setTexture(bookLeft, ''); setTexture(bookRight, '');
  }

  stage.addEventListener('pointerdown', e => {
    dragging = true; px = e.clientX; py = e.clientY; stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY;
    ry += dx * .38;
    rx = Math.max(-75, Math.min(75, rx - dy * .28));
    apply();
  });
  const stop = () => { dragging = false; };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    zoom = Math.max(.55, Math.min(1.75, zoom + (e.deltaY < 0 ? .08 : -.08)));
    apply();
  }, { passive:false });

  elements.flipBtn?.addEventListener('click', () => { ry += 180; apply(); });
  elements.resetBtn?.addEventListener('click', reset);

  async function ensurePageTexture(pageNumber) {
    if (!pageNumber || !loadPageTexture) return null;
    const key = String(pageNumber);
    if (pageTextures.has(key)) return pageTextures.get(key);
    if (loadingPages.has(key)) return loadingPages.get(key);
    const pending = Promise.resolve(loadPageTexture(pageNumber))
      .then(data => {
        if (data) pageTextures.set(key, data);
        loadingPages.delete(key);
        renderBookletMode();
        return data || null;
      })
      .catch(() => { loadingPages.delete(key); return null; });
    loadingPages.set(key, pending);
    return pending;
  }

  function pageTexture(pageNumber) {
    return pageNumber ? pageTextures.get(String(pageNumber)) || '' : '';
  }


  function getVisibleBookletPages() {
    if (!currentJob || currentJob.settings?.layoutMode !== 'booklet') return [];
    if (bookletMode === 'fold') {
      const cover = getBookletOuterPages(currentJob);
      return [cover.front, cover.back].filter(Boolean);
    }
    if (bookletMode === 'book') {
      const pairs = getBookletSpreads(currentJob);
      return (pairs[bookletSpreadIndex] || []).filter(Boolean);
    }
    return [];
  }

  function loadVisibleTextures() {
    for (const p of getVisibleBookletPages()) ensurePageTexture(p);
  }

  function setModeVisibility(isBooklet) {
    if (bookletControls) bookletControls.hidden = !isBooklet;
    if (!isBooklet) bookletMode = 'sheet';
    const sheetVisible = !isBooklet || bookletMode === 'sheet';
    object.hidden = !sheetVisible;
    if (folded) folded.hidden = !(isBooklet && bookletMode === 'fold');
    if (book) book.hidden = !(isBooklet && bookletMode === 'book');
    if (spreadControls) spreadControls.hidden = !(isBooklet && bookletMode === 'book');
    if (sideNav) sideNav.hidden = isBooklet && bookletMode !== 'sheet';
    elements.modeButtons?.forEach?.(button => {
      button.classList.toggle('is-active', button.dataset.booklet3dMode === bookletMode);
      button.setAttribute('aria-pressed', String(button.dataset.booklet3dMode === bookletMode));
    });
  }

  function applyMaterialClass(el, selection) {
    if (!el) return;
    el.className = el.className.replace(/\bmaterial-[\w-]+\b/g, '').trim();
    el.classList.add(materialClass(selection?.material));
  }

  function renderSheet() {
    if (!currentJob || !currentSelection) return;
    const size = currentSelection?.size?.id || 'A4';
    let [wmm,hmm] = MM[size] || MM.A4;
    const landscape = currentJob?.settings?.orientation === 'landscape' || currentJob?.settings?.layoutMode === 'booklet';
    if (landscape && hmm > wmm) [wmm,hmm] = [hmm,wmm];
    if (!landscape && wmm > hmm) [wmm,hmm] = [hmm,wmm];

    const max = 310;
    let h = max, w = max * (wmm / hmm);
    if (w > 360) { const k = 360 / w; w *= k; h *= k; }
    object.style.setProperty('--paper-w', `${w}px`);
    object.style.setProperty('--paper-h', `${h}px`);
    const layers = Math.min(18, Math.max(1, Math.ceil((currentJob?.totalPhysicalSheets || 1) / 15)));
    const gsm = Number(currentSelection?.material?.gsm) || 80;
    const thickness = Math.min(26, Math.max(2, layers * (gsm / 80) * 1.1));
    object.style.setProperty('--stack-depth', `${thickness}px`);
    applyMaterialClass(object, currentSelection);
    object.classList.toggle('is-booklet-sheet', currentJob?.settings?.layoutMode === 'booklet');
    if (stack) stack.dataset.layers = String(layers);
    const snap = snapshots.get(currentKey) || {};
    setTexture(front, snap.front || '');
    setTexture(back, snap.back || '');
  }

  function renderFoldedBooklet() {
    if (!currentJob || !currentSelection || !folded) return;
    const size = currentSelection?.size?.id || 'A4';
    let [wmm,hmm] = MM[size] || MM.A4;
    // Booklet sheet is landscape and folds at the center: finished page is half the long edge.
    if (hmm > wmm) [wmm,hmm] = [hmm,wmm];
    const pageWmm = wmm / 2;
    const pageHmm = hmm;
    const maxH = 300;
    const h = maxH;
    const w = h * (pageWmm / pageHmm);
    const gsm = Number(currentSelection?.material?.gsm) || 80;
    const physical = Math.max(1, Number(currentJob?.physicalSheets || 1));
    const realMm = physical * 2 * estimatePaperThicknessMm(gsm);
    const visualDepth = Math.min(30, Math.max(4, realMm * 6));
    folded.style.setProperty('--book-page-w', `${w}px`);
    folded.style.setProperty('--book-page-h', `${h}px`);
    folded.style.setProperty('--book-depth', `${visualDepth}px`);
    applyMaterialClass(folded, currentSelection);
    if (foldedStack) foldedStack.dataset.layers = String(Math.min(24, physical * 2));

    const cover = getBookletOuterPages(currentJob);
    setTexture(foldedFront, pageTexture(cover.front), cover.front ? `Hal. ${cover.front}` : 'Kosong');
    setTexture(foldedBack, pageTexture(cover.back), cover.back ? `Hal. ${cover.back}` : 'Kosong');
    if (foldedFront) foldedFront.dataset.page = cover.front || '';
    if (foldedBack) foldedBack.dataset.page = cover.back || '';
    loadVisibleTextures();
  }

  function animateTurn(direction) {
    if (!book) return;
    const cls = direction > 0 ? 'turn-next' : 'turn-prev';
    book.classList.remove('turn-next','turn-prev');
    void book.offsetWidth;
    book.classList.add(cls);
    setTimeout(() => book.classList.remove(cls), 380);
  }

  function renderOpenBooklet() {
    if (!currentJob || !currentSelection || !book) return;
    const size = currentSelection?.size?.id || 'A4';
    let [wmm,hmm] = MM[size] || MM.A4;
    if (hmm > wmm) [wmm,hmm] = [hmm,wmm];
    const pageWmm = wmm / 2;
    const pageHmm = hmm;
    const pageH = 270;
    const pageW = pageH * (pageWmm / pageHmm);
    const gsm = Number(currentSelection?.material?.gsm) || 80;
    const physical = Math.max(1, Number(currentJob?.physicalSheets || 1));
    const realMm = physical * 2 * estimatePaperThicknessMm(gsm);
    const visualDepth = Math.min(26, Math.max(3, realMm * 5.5));
    book.style.setProperty('--book-page-w', `${pageW}px`);
    book.style.setProperty('--book-page-h', `${pageH}px`);
    book.style.setProperty('--book-depth', `${visualDepth}px`);
    applyMaterialClass(book, currentSelection);
    if (bookLeftStack) bookLeftStack.dataset.layers = String(Math.min(20, physical));
    if (bookRightStack) bookRightStack.dataset.layers = String(Math.min(20, physical));
    if (bookSpine) bookSpine.style.height = `${pageH * .98}px`;

    const pairs = getBookletSpreads(currentJob);
    bookletSpreadIndex = Math.max(0, Math.min(bookletSpreadIndex, Math.max(0, pairs.length - 1)));
    const [leftPage, rightPage] = pairs[bookletSpreadIndex] || [null, null];
    setTexture(bookLeft, pageTexture(leftPage), leftPage ? `Hal. ${leftPage}` : 'Kosong');
    setTexture(bookRight, pageTexture(rightPage), rightPage ? `Hal. ${rightPage}` : 'Kosong');
    if (bookLeft) bookLeft.dataset.page = leftPage || '';
    if (bookRight) bookRight.dataset.page = rightPage || '';
    if (spreadLabel) spreadLabel.textContent = pairs.length
      ? `${leftPage || '–'} – ${rightPage || '–'} · ${bookletSpreadIndex + 1}/${pairs.length}`
      : 'Tidak ada pasangan halaman';
    if (firstSpreadBtn) firstSpreadBtn.disabled = bookletSpreadIndex <= 0;
    if (elements.prevSpreadBtn) elements.prevSpreadBtn.disabled = bookletSpreadIndex <= 0;
    if (elements.nextSpreadBtn) elements.nextSpreadBtn.disabled = bookletSpreadIndex >= pairs.length - 1;
    if (lastSpreadBtn) lastSpreadBtn.disabled = bookletSpreadIndex >= pairs.length - 1;
    loadVisibleTextures();
  }

  function renderBookletMode() {
    const isBooklet = currentJob?.settings?.layoutMode === 'booklet';
    setModeVisibility(isBooklet);
    renderSheet();
    if (isBooklet && bookletMode === 'fold') renderFoldedBooklet();
    if (isBooklet && bookletMode === 'book') renderOpenBooklet();
    apply();
  }

  elements.modeButtons?.forEach?.(button => button.addEventListener('click', () => {
    const mode = button.dataset.booklet3dMode;
    if (!['sheet','fold','book'].includes(mode)) return;
    bookletMode = mode;
    renderBookletMode();
  }));
  firstSpreadBtn?.addEventListener('click', () => {
    const old = bookletSpreadIndex;
    bookletSpreadIndex = 0;
    if (bookletSpreadIndex !== old) animateTurn(-1);
    renderOpenBooklet();
  });
  elements.prevSpreadBtn?.addEventListener('click', () => {
    const old = bookletSpreadIndex;
    bookletSpreadIndex = Math.max(0, bookletSpreadIndex - 1);
    if (bookletSpreadIndex !== old) animateTurn(-1);
    renderOpenBooklet();
  });
  elements.nextSpreadBtn?.addEventListener('click', () => {
    const pairs = getBookletSpreads(currentJob);
    const old = bookletSpreadIndex;
    bookletSpreadIndex = Math.min(Math.max(0, pairs.length - 1), bookletSpreadIndex + 1);
    if (bookletSpreadIndex !== old) animateTurn(1);
    renderOpenBooklet();
  });

  lastSpreadBtn?.addEventListener('click', () => {
    const pairs = getBookletSpreads(currentJob);
    const old = bookletSpreadIndex;
    bookletSpreadIndex = Math.max(0, pairs.length - 1);
    if (bookletSpreadIndex !== old) animateTurn(1);
    renderOpenBooklet();
  });

  function update({ job, selection, sheetIndex = 1, documentId = '' } = {}) {
    if (documentId && documentKey && documentId !== documentKey) clear();
    if (documentId) documentKey = documentId;
    const nextIsBooklet = job?.settings?.layoutMode === 'booklet';
    currentJob = job || null;
    currentSelection = selection || null;
    currentKey = String(sheetIndex || 1);
    if (!currentJob || !currentSelection) return;

    if (nextIsBooklet && !wasBooklet) {
      bookletMode = 'book';
      bookletSpreadIndex = 0;
    } else if (!nextIsBooklet) {
      bookletMode = 'sheet';
      bookletSpreadIndex = 0;
    }
    wasBooklet = nextIsBooklet;
    renderBookletMode();

    if (info) {
      const size = currentSelection?.size?.id || 'A4';
      const gsm = Number(currentSelection?.material?.gsm) || 80;
      if (currentJob.settings?.layoutMode === 'booklet') {
        const physical = Number(currentJob.physicalSheets || 0);
        const finishedPages = Number(currentJob.selectedPageCount || 0) + Number(currentJob.addedBlankPages || 0);
        const thickness = physical * 2 * estimatePaperThicknessMm(gsm);
        const creep = Math.max(0, (physical - 1) * estimatePaperThicknessMm(gsm) / 2);
        const modeLabel = bookletMode === 'sheet' ? 'Lembar induk' : bookletMode === 'fold' ? 'Booklet tertutup' : 'Booklet terbuka';
        info.textContent = `${modeLabel} · ${currentSelection?.material?.name || '-'} ${size} · ${physical} lembar induk → ${finishedPages} halaman booklet · tebal ≈ ${thickness.toFixed(1)} mm · pergeseran lipatan ≈ ${creep.toFixed(1)} mm`;
      } else {
        const mode = currentJob?.settings?.duplex ? '2 sisi' : '1 sisi';
        info.textContent = `${currentSelection?.material?.name || '-'} · ${size} · ${gsm || '-'} gsm · ${mode} · ${currentJob?.totalPhysicalSheets || 0} lembar`;
      }
    }
  }

  function capture(canvas, side = 'front', sheetIndex = 1) {
    if (!canvas?.width || !canvas?.height) return;
    try {
      const data = canvas.toDataURL('image/jpeg', .84);
      const key = String(sheetIndex || currentKey || 1);
      const item = snapshots.get(key) || {};
      item[side === 'back' ? 'back' : 'front'] = data;
      snapshots.set(key, item);
      if (key === currentKey) renderBookletMode();
    } catch (_) {}
  }

  reset();
  return { update, capture, reset, clear, focusSide, getVisibleBookletPages };
}
