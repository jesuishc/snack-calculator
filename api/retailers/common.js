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
  const text = String(name).toLowerCase();
  const weightFirst = text.match(/(\d+(?:\.\d+)?)\s*(g|kg|그램)\s*[x×*]\s*(\d+)\s*(?:개입|개|입|ea|p|팩|pack)?/i);
  const countFirst = text.match(/(\d+)\s*(?:개입|개|입|ea|p|팩|pack)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(g|kg|그램)/i);
  if (weightFirst) {
    const count = toNumber(weightFirst[3]);
    const each = toNumber(weightFirst[1]) * (/kg/i.test(weightFirst[2]) ? 1000 : 1);
    return { weight: each * count, count };
  }
  if (countFirst) {
    const count = toNumber(countFirst[1]);
    const each = toNumber(countFirst[2]) * (/kg/i.test(countFirst[3]) ? 1000 : 1);
    return { weight: each * count, count };
  }
  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|그램)/i);
  const countMatch = text.match(/(\d+)\s*(?:개입|개|입|ea|팩|pack|p)/i);
  return {
    weight: weightMatch ? toNumber(weightMatch[1]) * (/kg/i.test(weightMatch[2]) ? 1000 : 1) : 0,
    count: countMatch ? toNumber(countMatch[1]) : 0
  };
}

export function queryMatches(name = '', query = '') {
  const compactName = String(name).toLowerCase().replace(/\s+/g, '');
  const tokens = String(query).toLowerCase().split(/\s+/).map(token => token.replace(/[^0-9a-z가-힣]/g, '')).filter(token => token.length > 1);
  if (!tokens.length) return true;
  const hits = tokens.filter(token => compactName.includes(token)).length;
  return hits >= Math.max(1, Math.ceil(tokens.length * 0.6));
}
