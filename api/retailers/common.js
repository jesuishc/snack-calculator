const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
  'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
};

export function decodeHtml(value = '') {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' '));
}

export function toNumber(value = '') {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeout || 12000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export function normalizeProduct(retailer, product = {}) {
  return {
    retailer,
    name: String(product.name || '').trim(),
    price: toNumber(product.price),
    url: String(product.url || '').trim(),
    image: String(product.image || '').trim(),
    productId: String(product.productId || '').trim(),
    weight: toNumber(product.weight),
    count: toNumber(product.count),
    barcode: String(product.barcode || '').trim(),
    promotion: String(product.promotion || '').trim(),
    stock: product.stock ?? null,
    storeId: String(product.storeId || '').trim()
  };
}

export function dedupeProducts(products = []) {
  const seen = new Set();
  return products.filter(product => {
    const key = product.productId || `${product.name}|${product.price}`;
    if (!product.name || !product.price || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractSpec(name = '') {
  const weight = (name.match(/(\d+(?:\.\d+)?)\s*(?:g|그램)\b/i) || [])[1] || 0;
  const count = (name.match(/(\d+)\s*(?:개|입|ea|p|pack)\b/i) || [])[1] || 0;
  return { weight: toNumber(weight), count: toNumber(count) };
}

export function queryMatches(name = '', query = '') {
  const compactName = name.toLowerCase().replace(/\s+/g, '');
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(token => compactName.includes(token));
}
