const MCP_BASE = 'https://mcp.aka.page';
const GS25_TOTAL_SEARCH_URL = 'https://b2c-apigw.woodongs.com/search/v3/totalSearch';

function num(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function spec(name = '') {
  const text = String(name).toLowerCase();
  const weight = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|그램)/i);
  const count = text.match(/(\d+)\s*(?:개입|개|입|ea|팩|pack|p)/i);
  return {
    weight: weight ? num(weight[1]) * (/kg/i.test(weight[2]) ? 1000 : 1) : 0,
    count: count ? num(count[1]) : 0
  };
}

function matches(name = '', q = '') {
  const compact = String(name).toLowerCase().replace(/\s+/g, '');
  const tokens = String(q).toLowerCase().split(/\s+/).map(v => v.replace(/[^0-9a-z가-힣]/g, '')).filter(v => v.length > 1);
  return !tokens.length || tokens.some(token => compact.includes(token));
}

async function get(path, timeout = 20000) {
  const response = await fetch(`${MCP_BASE}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  return response.json();
}

async function postJson(url, body, timeout = 20000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'content-type': 'application/json',
      origin: 'https://woodongs.com',
      referer: 'https://woodongs.com/',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`GS25 direct HTTP ${response.status}`);
  return response.json();
}

function envelope(payload) { return payload?.data || payload || {}; }
function product(retailer, item) {
  return {
    retailer,
    name: String(item.name || '').trim(),
    price: num(item.price),
    productId: String(item.productId || '').trim(),
    image: String(item.image || '').trim(),
    promotion: String(item.promotion || '').trim(),
    stock: item.stock ?? null,
    url: String(item.url || '').trim(),
    ...spec(item.name || '')
  };
}

export async function searchDaisoDirect(q) {
  const path = `/api/daiso/products?q=${encodeURIComponent(q)}&pageSize=12`;
  const data = envelope(await get(path));
  const rows = data.products || [];
  return rows.filter(x => matches(x.name, q)).map(x => product('daiso', {
    name: x.name, price: x.price, productId: x.id, image: x.imageUrl, url: `${MCP_BASE}${path}`
  }));
}

async function searchGs25Official(q) {
  const body = await postJson(GS25_TOTAL_SEARCH_URL, { query: q });
  const collections = body?.SearchQueryResult?.Collection || [];
  const rows = [];
  for (const collection of collections) {
    const docs = collection?.Documentset?.Document || [];
    for (const doc of docs) {
      const field = doc?.field || {};
      const name = field.itemName || field.shortItemName || '';
      if (!field.itemCode || !matches(name, q)) continue;
      rows.push(product('gs25', {
        name,
        price: 0,
        productId: field.itemCode,
        image: field.itemImageUrl,
        stock: field.stockCheckYn === 'Y',
        url: GS25_TOTAL_SEARCH_URL
      }));
      if (rows.length >= 12) return rows;
    }
  }
  return rows;
}

export async function searchGs25Direct(q) {
  const path = `/api/gs25/products?keyword=${encodeURIComponent(q)}&limit=12`;
  try {
    const data = envelope(await get(path));
    const rows = data.products || [];
    const products = rows.filter(x => matches(x.itemName || x.shortItemName, q)).map(x => product('gs25', {
      name: x.itemName || x.shortItemName,
      price: 0,
      productId: x.itemCode,
      image: x.imageUrl,
      stock: x.stockCheckEnabled,
      url: `${MCP_BASE}${path}`
    }));
    if (products.length) return products;
  } catch {}
  return searchGs25Official(q);
}

export async function resolveGs25Price(q, itemCode, latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('GS25 가격 조회에는 위치 정보가 필요합니다.');
  }
  const path = `/api/gs25/inventory?keyword=${encodeURIComponent(q)}&itemCode=${encodeURIComponent(itemCode)}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&storeLimit=10`;
  const data = envelope(await get(path, 25000));
  const stores = data?.inventory?.stores || [];
  const storeWithPrice = stores.find(store => Number(store?.searchItemSellPrice) > 0);
  const price = data?.product?.sellPrice ?? storeWithPrice?.searchItemSellPrice ?? null;
  return product('gs25', {
    name: data?.product?.name || storeWithPrice?.searchItemName || q,
    price,
    productId: data?.itemCode || itemCode,
    image: data?.product?.imageUrl,
    stock: data?.inventory?.totalStockQuantity ?? null,
    url: `${MCP_BASE}${path}`
  });
}

export async function searchCuDirect(q) {
  const path = `/api/cu/inventory?keyword=${encodeURIComponent(q)}&size=20&storeCheck=false`;
  const data = envelope(await get(path));
  const rows = data?.inventory?.items || [];
  return rows.filter(x => matches(x.itemName, q)).map(x => product('cu', {
    name: x.itemName,
    price: x.price,
    productId: x.itemCode,
    stock: null,
    url: `${MCP_BASE}${path}`
  })).slice(0, 12);
}

export async function searchSevenDirect(q) {
  const path = `/api/seveneleven/products?query=${encodeURIComponent(q)}&size=12`;
  const data = envelope(await get(path));
  const rows = data.products || [];
  return rows.filter(x => matches(x.itemName || x.name, q)).map(x => product('seven', {
    name: x.itemName || x.name,
    price: x.salePrice || x.onlinePrice || x.price || x.originalPrice,
    productId: x.itemCode || x.productNo,
    image: x.imageUrl || x.repImgUrl,
    url: `${MCP_BASE}${path}`
  }));
}

export async function searchEmart24Direct(q) {
  const path = `/api/emart24/products?keyword=${encodeURIComponent(q)}&pageSize=12`;
  const data = envelope(await get(path));
  const rows = data.products || data.productList || [];
  return rows.filter(x => matches(x.goodsName || x.goodsNm || x.name, q)).map(x => product('emart24', {
    name: x.goodsName || x.goodsNm || x.name,
    price: x.viewPrice || x.salePrice || x.originPrice,
    productId: x.pluCd || x.productId,
    image: x.imageUrl,
    url: `${MCP_BASE}${path}`
  }));
}
