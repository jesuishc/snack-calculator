import { dbFetch } from './db.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

export async function listHistory({ householdId, productId = '', storeId = '', limit = 200 }) {
  const filters = [`household_id=eq.${encodeURIComponent(householdId)}`];
  if (productId) filters.push(`product_id=eq.${encodeURIComponent(productId)}`);
  if (storeId) filters.push(`store_id=eq.${encodeURIComponent(storeId)}`);
  return dbFetch(`price_history?${filters.join('&')}&select=*&order=checked_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}`);
}

export async function appendHistory(entry) {
  return dbFetch('price_history', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      household_id: entry.householdId,
      product_id: entry.productId,
      product_name: entry.productName || '',
      store_id: entry.storeId,
      store_name: entry.storeName || '',
      price: Number(entry.price) || 0,
      promotion: entry.promotion || 'none',
      matched_name: entry.matchedName || '',
      source_url: entry.sourceUrl || '',
      actor: entry.actor || '',
      checked_at: entry.checkedAt || new Date().toISOString()
    })
  });
}

export default async function handler(req, res) {
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === 'OPTIONS') return res.status(204).end();
  const householdId = String(req.query.householdId || req.body?.householdId || '').trim();
  if (householdId.length < 4) return res.status(400).json({ error: 'householdId required' });
  try {
    if (req.method === 'GET') {
      const rows = await listHistory({
        householdId,
        productId: String(req.query.productId || ''),
        storeId: String(req.query.storeId || ''),
        limit: req.query.limit
      });
      return res.status(200).json({ history: rows });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.productId || !body.storeId || !(Number(body.price) > 0)) return res.status(400).json({ error: 'productId, storeId and positive price required' });
      const rows = await appendHistory({ ...body, householdId });
      return res.status(201).json({ history: rows?.[0] || null });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'history failed' });
  }
}
