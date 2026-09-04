const STORAGE_KEY = 'printCostAnalyzerLegacyPricingConfigV4';

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function loadPublishedPricing() {
  const res = await fetch('data/pricing-config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal memuat pricing-config.json (${res.status})`);
  return await res.json();
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
  // Aplikasi publik selalu memakai konfigurasi yang dipublikasikan di repository.
  // Override pemilik disimpan terpisah dan terenkripsi oleh halaman Owner Access.
  return await loadPublishedPricing();
}

export function getMaterial(config, materialId) {
  return config?.materials?.find(x => x.id === materialId) || config?.materials?.[0] || null;
}

export function getSize(material, sizeId) {
  return material?.sizes?.find(x => x.id === sizeId) || material?.sizes?.[0] || null;
}

export function getTier(config) {
  const tier = config?.active_tier || 'normal';
  return ['floor', 'competitive', 'normal'].includes(tier) ? tier : 'normal';
}

export function getCustomerSizeGroup(sizeId) {
  const id = String(sizeId || '').toUpperCase();
  return id.startsWith('A3') ? 'A3' : 'A4_F4';
}

export function getPricingSelection(config, materialId, sizeId, mediaSource = 'store') {
  const material = getMaterial(config, materialId);
  const size = getSize(material, sizeId);
  const tier = getTier(config);
  const source = mediaSource === 'customer' ? 'customer' : 'store';
  let tariff = null;
  let customerProfile = null;
  let customerSizeGroup = null;

  if (source === 'customer') {
    const profileId = material?.customer_profile || 'premium_document';
    customerProfile = config?.customer_supplied_tariffs?.[profileId] || null;
    customerSizeGroup = getCustomerSizeGroup(size?.id || sizeId);
    const group = customerProfile?.sizes?.[customerSizeGroup] || customerProfile?.sizes?.A4_F4;
    tariff = group?.[tier] || group?.normal || null;
  }

  if (!tariff) {
    tariff = size?.tariffs?.[tier] || size?.tariffs?.normal || { H: 300, HW: 500, W: 1000, duplex_credit: 0 };
  }

  return {
    material,
    size,
    tier,
    tierLabel: config?.tier_labels?.[tier] || tier,
    mediaSource: source,
    mediaSourceLabel: config?.media_source_labels?.[source] || (source === 'customer' ? 'Dibawa Pelanggan' : 'Dari Toko'),
    customerProfile,
    customerSizeGroup,
    prices: {
      H: Number(tariff.H) || 0,
      HW: Number(tariff.HW) || 0,
      W: Number(tariff.W) || 0,
      duplexCredit: source === 'customer' ? 0 : (Number(tariff.duplex_credit) || 0),
    },
  };
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
