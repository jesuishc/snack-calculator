export function supabaseConfig() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return base && key ? { base: base.replace(/\/$/, ''), key } : null;
}

export async function dbFetch(path, options = {}) {
  const config = supabaseConfig();
  if (!config) throw Object.assign(new Error('Supabase not configured'), { status: 503 });
  const response = await fetch(`${config.base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw Object.assign(new Error(typeof body === 'string' ? body : JSON.stringify(body)), { status: response.status, body });
  return body;
}
