// Vercel Serverless Function: /api/search
// Retailer adapters should return normalized products:
// { name, price, url, productId, weight, count, barcode, promotion, stock, storeId }
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

async function publicPageFallback({ q, retailer }) {
  const urls = {
    coupang: `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`,
    gs25: `https://gs25.gsretail.com/gscvs/ko/products/event-goods?searchWord=${encodeURIComponent(q)}`,
    emart24: `https://m.emart24.co.kr/goods/event?search=${encodeURIComponent(q)}`
  };
  const target = urls[retailer];
  if (!target) return [];
  // This endpoint intentionally does not pretend that retailer private APIs are public.
  // Replace this function with a permitted official/partner API or retailer-specific parser.
  return [{
    name: `${q} - 공식 검색에서 확인 필요`,
    price: 0,
    url: target,
    productId: '',
    weight: 0,
    count: 0,
    barcode: '',
    promotion: '',
    stock: null
  }];
}

export default async function handler(req, res) {
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const q = String(req.query.q || '').trim();
  const retailer = String(req.query.retailer || '').trim();
  const storeId = String(req.query.storeId || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'query too short' });
  try {
    const products = await publicPageFallback({ q, retailer, storeId });
    return res.status(200).json({ retailer, storeId, checkedAt: new Date().toISOString(), products });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'search failed' });
  }
}
