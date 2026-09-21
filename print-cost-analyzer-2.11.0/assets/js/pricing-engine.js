const STORAGE_KEY = 'printCostAnalyzerPricingConfigV2';

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function loadPublishedPricing() {
  const res = await fetch('data/pricing-config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal memuat pricing-config.json (${res.status})`);
  const data = await res.json();
  if (Number(data?.schema_version) < 6) throw new Error('pricing-config.json masih memakai skema lama (< v6).');
  return data;
}

export function loadLocalPricing() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function saveLocalPricing(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearLocalPricing() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function loadEffectivePricing() {
  return await loadPublishedPricing();
}

export function getMaterial(config, materialId) {
  return config?.materials?.find(x => x.id === materialId) || config?.materials?.[0] || null;
}

export function getSize(material, sizeId) {
  return material?.sizes?.find(x => x.id === sizeId) || material?.sizes?.[0] || null;
}

export function getSizeDefinition(config, sizeId) {
  return config?.sizes?.find(x => x.id === sizeId) || null;
}


export function canonicalPair(a, b) {
  const rank = { H: 0, HW: 1, W: 2, D: 3 };
  const aa = rank[a] === undefined ? 'H' : a;
  const bb = rank[b] === undefined ? 'H' : b;
  return rank[aa] <= rank[bb] ? `${aa}+${bb}` : `${bb}+${aa}`;
}

function roundUp(value, step = 100) {
  const n = Number(value) || 0;
  const s = Math.max(1, Number(step) || 100);
  return Math.ceil(n / s) * s;
}

function copyTariff(t) {
  return {
    simplex: { ...(t?.simplex || {}) },
    duplex_pairs: { ...(t?.duplex_pairs || {}) },
  };
}

function normalizeVolumeThresholds(size) {
  const raw = size?.volume_thresholds || {};
  const legacy = Math.max(1, Number(size?.volume_min_sheets) || 50);
  const normalize = (value, fallback = legacy) => {
    if (value === null || value === false || value === 'never') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : fallback;
  };
  return {
    H: normalize(raw.H),
    HW: normalize(raw.HW),
    W: normalize(raw.W),
    D: normalize(raw.D, null),
  };
}

export function getPricingSelection(config, materialId, sizeId, mediaSource = 'store') {
  const material = getMaterial(config, materialId);
  const size = getSize(material, sizeId);
  const source = mediaSource === 'customer' ? 'customer' : 'store';
  const regular = copyTariff(source === 'customer' ? (size?.customer_regular || size?.regular) : size?.regular);
  const volume = copyTariff(source === 'customer' ? (size?.customer_volume || size?.volume) : size?.volume);
  const volumeThresholds = normalizeVolumeThresholds(size);

  return {
    material,
    size,
    mediaSource: source,
    mediaSourceLabel: config?.media_source_labels?.[source] || (source === 'customer' ? 'Bawa Sendiri' : 'Dari toko'),
    volumeThresholds,
    // Legacy alias for older UI/tests. New pricing decisions use volumeThresholds.
    volumeMinSheets: volumeThresholds.H || Math.max(1, Number(size?.volume_min_sheets) || 50),
    volumeStrategy: config?.pricing_model?.strategy || 'marginal_volume_by_color_class',
    regular,
    volume,
    prices: {
      H: Number(regular?.simplex?.H) || Number(volume?.simplex?.H) || 0,
      HW: Number(regular?.simplex?.HW) || Number(volume?.simplex?.HW) || 0,
      W: Number(regular?.simplex?.W) || Number(volume?.simplex?.W) || 0,
      D: Number(regular?.simplex?.D) || Number(volume?.simplex?.D) || 0,
      duplexCredit: 0,
    },
    note: size?.note || '',
  };
}

export function getSimplexPrice(selection, type = 'H', mode = 'volume') {
  const table = mode === 'regular' ? selection?.regular : selection?.volume;
  return Math.max(0, Number(table?.simplex?.[type]) || 0);
}

export function getDuplexPairPrice(selection, a = 'H', b = 'H', mode = 'volume') {
  const table = mode === 'regular' ? selection?.regular : selection?.volume;
  const key = canonicalPair(a, b);
  const direct = Number(table?.duplex_pairs?.[key]);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return getSimplexPrice(selection, a, mode) + getSimplexPrice(selection, b, mode);
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { STORAGE_KEY };
