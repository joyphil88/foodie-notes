// Passcode-gated write proxy for Supabase.
// Reads happen browser-direct (public RLS); only writes go through here so the
// service_role key stays server-side. Body: { table, op, values?, match? }.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSCODE = process.env.FOODIE_PASSCODE;

const TABLES = new Set(['places', 'categories', 'trips']);
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: HEADERS });

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function buildMatch(match) {
  const parts = Object.entries(match || {}).map(
    ([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`
  );
  return parts.join('&');
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'server not configured' });
  if (PASSCODE && req.headers.get('x-foodie-passcode') !== PASSCODE) {
    return json(401, { error: 'invalid passcode' });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'bad json' }); }
  const { table, op, values, match } = body || {};
  if (!TABLES.has(table)) return json(400, { error: 'bad table' });

  try {
    if (op === 'insert') {
      const r = await sb(table, { method: 'POST', body: JSON.stringify(values) });
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      return json(r.ok ? 200 : r.status, r.ok ? row : (r.data || { error: 'insert failed' }));
    }
    if (op === 'update') {
      if (!match || !Object.keys(match).length) return json(400, { error: 'match required' });
      const r = await sb(`${table}?${buildMatch(match)}`, { method: 'PATCH', body: JSON.stringify(values) });
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      return json(r.ok ? 200 : r.status, r.ok ? row : (r.data || { error: 'update failed' }));
    }
    if (op === 'delete') {
      if (!match || !Object.keys(match).length) return json(400, { error: 'match required' });
      const r = await sb(`${table}?${buildMatch(match)}`, { method: 'DELETE' });
      return json(r.ok ? 200 : r.status, r.ok ? { ok: true } : (r.data || { error: 'delete failed' }));
    }
    return json(400, { error: 'bad op' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
