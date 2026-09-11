import { extractSpec, normalizeProduct, queryMatches } from './common.js';

const MCP_BASE = 'https://mcp.aka.page';

async function getJson(path, timeout = 15000) {
  const response = await fetch(`${MCP_BASE}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  return response.json();
}

function normalizeCompareItem(retailer, item, q, storeId = '') {
  if (!item || !queryMatches(item.name || '', q)) return null;
  return normalizeProduct(retailer, {
    name: item.name,
    price: item.price || item.originalPrice || 0,
    productId: item.code || '',
    image: item.imageUrl || '',
    storeId,
    url: `${MCP_BASE}/api/compare/products?keyword=${encodeURIComponent(q)}`,
    ...extractSpec(item.name || '')
  });
}

export async function searchCompareService({ q, retailer, service, storeId = '' }) {
  const path = `/api/compare/products?keyword=${encodeURIComponent(q)}&limit=12&services=${encodeURIComponent(service)}`;
  const payload = await getJson(path);
  const data = payload?.data || payload;
  const results = Array.isArray(data?.results) ? data.results : [];
  const products = results
    .filter(item => item?.service === service)
    .map(item => normalizeCompareItem(retailer, item, q, storeId))
    .filter(Boolean)
    .filter(item => item.price > 0)
    .slice(0, 12);
  return { retailer, sourceUrl: `${MCP_BASE}${path}`, products, meta: { errors: data?.errors || [] } };
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

export async function searchCuViaMcp({ q, storeId = '' }) {
  const path = `/api/cu/inventory?keyword=${encodeURIComponent(q)}&size=20&storeCheck=false`;
  const payload = await getJson(path);
  const candidates = findArrays(payload)
    .flat()
    .filter(item => item && typeof item === 'object');
  const seen = new Set();
  const products = [];
  for (const item of candidates) {
    const name = String(pick(item, ['name','itemName','goodsName','productName','prodName','itemOnm']));
    if (!name || !queryMatches(name, q)) continue;
    const price = pick(item, ['price','salePrice','onlinePrice','viewPrice','originPrice','goodsPrice']);
    const normalized = normalizeProduct('cu', {
      name,
      price,
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
