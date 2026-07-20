// Vercel Serverless Function: /api/snapshot
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

export default async function handler(req, res) {
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(204).end();
  const userId = String(req.query.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return res.status(503).json({ error: 'Supabase not configured' });
  const url = `${base}/rest/v1/user_snapshots?user_id=eq.${encodeURIComponent(userId)}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (req.method === 'GET') {
    const r = await fetch(`${url}&select=payload&limit=1`, { headers });
    const rows = await r.json();
    if (!r.ok) return res.status(r.status).json(rows);
    if (!rows.length) return res.status(404).json({ error: 'snapshot not found' });
    return res.status(200).json(rows[0].payload);
  }
  if (req.method === 'PUT') {
    const r = await fetch(`${base}/rest/v1/user_snapshots?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId, payload: req.body, updated_at: new Date().toISOString() })
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    return res.status(204).end();
  }
  return res.status(405).json({ error: 'method not allowed' });
}
