import { searchCoupang } from './retailers/coupang.js';
import { searchGs25 } from './retailers/gs25.js';
import { searchEmart24 } from './retailers/emart24.js';
import { searchCu } from './retailers/cu.js';
import { searchSeven } from './retailers/seven.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

const adapters = {
  coupang: searchCoupang,
  gs25: searchGs25,
  emart24: searchEmart24,
  cu: searchCu,
  seven: searchSeven
};

export async function searchRetailer({ q, retailer, storeId = '' }) {
  const adapter = adapters[retailer];
  if (!adapter) throw new Error(`unsupported retailer: ${retailer}`);
  return adapter({ q, storeId });
}

export default async function handler(req, res) {
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const q = String(req.query.q || '').trim();
  const retailer = String(req.query.retailer || '').trim();
  const storeId = String(req.query.storeId || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'query too short' });
  if (!adapters[retailer]) return res.status(400).json({ error: 'unsupported retailer' });

  try {
    const result = await searchRetailer({ q, retailer, storeId });
    return res.status(200).json({
      retailer,
      storeId,
      checkedAt: new Date().toISOString(),
      sourceUrl: result.sourceUrl,
      products: result.products,
      notice: retailer === 'seven'
        ? '세븐일레븐은 공개 행사상품 데이터 기준 참고값입니다. 점포별 재고와 실제 판매가는 다를 수 있습니다.'
        : '가격과 행사 정보는 조회 시점 기준 참고값이며 점포, 회원, 쿠폰, 옵션에 따라 실제 결제 조건이 달라질 수 있습니다.'
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'search failed', retailer, storeId });
  }
}
