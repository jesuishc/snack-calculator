const MCP_BASE = 'https://mcp.aka.page';

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

export async function searchGs25Direct(q) {
  const path = `/api/gs25/products?keyword=${encodeURIComponent(q)}&limit=12`;
  const data = envelope(await get(path));
  const rows = data.products || [];
  return rows.filter(x => matches(x.itemName || x.shortItemName, q)).map(x => product('gs25', {
    name: x.itemName || x.shortItemName,
    price: 0,
    productId: x.itemCode,
    image: x.imageUrl,
    stock: x.stockCheckEnabled,
    url: `${MCP_BASE}${path}`
  }));
}

export async function resolveGs25Price(q, itemCode) {
  const path = `/api/gs25/inventory?keyword=${encodeURIComponent(q)}&itemCode=${encodeURIComponent(itemCode)}&storeLimit=10`;
  const data = envelope(await get(path, 25000));
  return product('gs25', {
    name: data?.product?.name || q,
    price: data?.product?.sellPrice,
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
