import { searchCoupang } from '../src/server/retailers/coupang.js';
import { searchDaiso } from '../src/server/retailers/daiso.js';
import { searchGs25 } from '../src/server/retailers/gs25.js';
import { searchEmart24 } from '../src/server/retailers/emart24.js';
import { searchCu } from '../src/server/retailers/cu.js';
import { searchSeven } from '../src/server/retailers/seven.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

const adapters = {
  coupang: searchCoupang,
  daiso: searchDaiso,
  gs25: searchGs25,
  emart24: searchEmart24,
  cu: searchCu,
  seven: searchSeven
};

export async function searchRetailer({ q, retailer, storeId = '', productId = '', lat, lng }) {
  const adapter = adapters[retailer];
  if (!adapter) throw new Error(`unsupported retailer: ${retailer}`);
  return adapter({ q, storeId, productId, lat, lng });
}

export default async function handler(req, res) {
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const q = String(req.query.q || '').trim();
  const retailer = String(req.query.retailer || '').trim();
  const storeId = String(req.query.storeId || '').trim();
  const productId = String(req.query.productId || '').trim();
  const lat = req.query.lat === undefined ? undefined : Number(req.query.lat);
  const lng = req.query.lng === undefined ? undefined : Number(req.query.lng);
  if (q.length < 2) return res.status(400).json({ error: 'query too short' });
  if (!adapters[retailer]) return res.status(400).json({ error: 'unsupported retailer' });

  try {
    const result = await searchRetailer({ q, retailer, storeId, productId, lat, lng });
    return res.status(200).json({
      retailer,
      storeId,
      checkedAt: new Date().toISOString(),
      sourceUrl: result.sourceUrl,
      products: result.products,
      notice: retailer === 'gs25'
        ? (productId
          ? '선택한 GS25 상품의 인근 매장 재고 응답에서 가격을 확인했습니다.'
          : 'GS25 상품 후보입니다. 상품을 선택하면 현재 위치 기준 재고 조회로 가격을 확인합니다.')
        : '가격과 재고 정보는 조회 시점 기준 참고값이며 점포, 행사, 옵션에 따라 실제 조건이 달라질 수 있습니다.'
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'search failed', retailer, storeId });
  }
}
