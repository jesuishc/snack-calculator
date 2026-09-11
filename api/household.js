import { dbFetch, supabaseConfig } from './db.js';
import { getLocalHousehold, putLocalHousehold } from './local-store.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

export async function getHousehold(householdId) {
  if (!supabaseConfig()) return getLocalHousehold(householdId);
  const id = encodeURIComponent(householdId);
  const rows = await dbFetch(`household_snapshots?household_id=eq.${id}&select=payload,updated_at&limit=1`);
  return rows?.[0] || null;
}

export async function putHousehold(householdId, payload) {
  if (!supabaseConfig()) return putLocalHousehold(householdId, payload);
  await dbFetch('household_snapshots?on_conflict=household_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ household_id: householdId, payload, updated_at: new Date().toISOString() })
  });
}

export default async function handler(req, res) {
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === 'OPTIONS') return res.status(204).end();
  const householdId = String(req.query.householdId || '').trim();
  if (householdId.length < 4) return res.status(400).json({ error: 'householdId required' });
  try {
    if (req.method === 'GET') {
      const row = await getHousehold(householdId);
      if (!row) return res.status(404).json({ error: 'household not found' });
      return res.status(200).json({ ...row.payload, serverUpdatedAt: row.updated_at });
    }
    if (req.method === 'PUT') {
      await putHousehold(householdId, req.body || {});
      return res.status(204).end();
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'household sync failed' });
  }
}
