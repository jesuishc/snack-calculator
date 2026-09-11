const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
  'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
};

const MCP_BASE = 'https://mcp.aka.page';

export function decodeHtml(value = '') {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function stripTags(value = '') { return decodeHtml(String(value).replace(/<[^>]*>/g, ' ')); }
export function toNumber(value = '') { const parsed = Number(String(value).replace(/[^0-9.]/g, '')); return Number.isFinite(parsed) ? parsed : 0; }

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

async function fetchMcpJson(path, timeout = 20000) {
  const response = await fetch(`${MCP_BASE}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  return response.json();
}

export async function searchMcpCompare({ q, retailer, service, storeId = '' }) {
  const path = `/api/compare/products?keyword=${encodeURIComponent(q)}&limit=12&services=${encodeURIComponent(service)}`;
  const payload = await fetchMcpJson(path);
  const data = payload?.data || payload;
  const results = Array.isArray(data?.results) ? data.results : [];
  const products = results
    .filter(item => item?.service === service && queryMatches(item.name || '', q))
    .map(item => normalizeProduct(retailer, {
      name: item.name,
      price: item.price || item.originalPrice || 0,
      productId: item.code || '',
      image: item.imageUrl || '',
      stock: item.stockCheckEnabled ?? null,
      storeId,
      url: `${MCP_BASE}${path}`,
      ...extractSpec(item.name || '')
    }))
    .filter(item => item.price > 0)
    .slice(0, 12);
  return { retailer, sourceUrl: `${MCP_BASE}${path}`, products };
}

export async function searchMcpGs25Inventory({ q, storeId = '' }) {
  const path = `/api/gs25/inventory?keyword=${encodeURIComponent(q)}&storeLimit=20`;
  const payload = await fetchMcpJson(path, 25000);
  const data = payload?.data || payload;
  const product = data?.product || {};
  const price = toNumber(product.sellPrice);
  const name = String(product.name || q).trim();
  if (!price || !queryMatches(name, q)) return { retailer: 'gs25', sourceUrl: `${MCP_BASE}${path}`, products: [] };
  return {
    retailer: 'gs25',
    sourceUrl: `${MCP_BASE}${path}`,
    products: [normalizeProduct('gs25', {
      name,
      price,
      image: product.imageUrl || '',
      productId: data?.itemCode || '',
      stock: data?.inventory?.totalStockQuantity ?? null,
      storeId,
      url: `${MCP_BASE}${path}`,
      ...extractSpec(name)
    })]
  };
}

function findArrays(value, arrays = []) {
  if (!value || typeof value !== 'object') return arrays;
  if (Array.isArray(value)) {
    arrays.push(value);
    value.forEach(item => findArrays(item, arrays));
  } else {
    Object.values(value).forEach(item => findArrays(item, arrays));
  }
  return arrays;
}

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

export async function searchMcpCu({ q, storeId = '' }) {
  const path = `/api/cu/inventory?keyword=${encodeURIComponent(q)}&size=20&storeCheck=false`;
  const payload = await fetchMcpJson(path);
  const candidates = findArrays(payload).flat().filter(item => item && typeof item === 'object');
  const seen = new Set();
  const products = [];
  for (const item of candidates) {
    const name = String(pick(item, ['name','itemName','goodsName','productName','prodName','itemOnm']));
    if (!name || !queryMatches(name, q)) continue;
    const normalized = normalizeProduct('cu', {
      name,
      price: pick(item, ['price','salePrice','onlinePrice','viewPrice','originPrice','goodsPrice']),
      productId: pick(item, ['productId','itemCode','goodsCode','code','itemCd']),
      image: pick(item, ['imageUrl','repImgUrl','image','imgUrl']),
      stock: pick(item, ['stockStatus','inStock','stockQty','remainQuantity']) || null,
      storeId,
      url: `${MCP_BASE}${path}`,
      ...extractSpec(name)
    });
    const key = normalized.productId || `${normalized.name}|${normalized.price}`;
    if (!seen.has(key) && normalized.price > 0) {
      seen.add(key);
      products.push(normalized);
    }
    if (products.length >= 12) break;
  }
  return { retailer: 'cu', sourceUrl: `${MCP_BASE}${path}`, products };
}
