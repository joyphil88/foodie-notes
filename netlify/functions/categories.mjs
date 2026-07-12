import { openStore, mutate } from './_store.mjs';

const emptyCategories = () => ({ custom: [], labels: {}, deletedKeys: [] });
const emptyState = () => ({ custom: [], triedIds: [], pinnedIds: [], deletedIds: [], edits: {}, categories: emptyCategories() });
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: HEADERS });

function cats(data) {
  data.categories = data.categories || emptyCategories();
  data.categories.custom = data.categories.custom || [];
  data.categories.labels = data.categories.labels || {};
  data.categories.deletedKeys = data.categories.deletedKeys || [];
  return data.categories;
}

export default async (req) => {
  const store = openStore();
  const url = new URL(req.url);
  const method = req.method;

  const requiredPasscode = process.env.FOODIE_PASSCODE;
  if (requiredPasscode && req.headers.get('x-foodie-passcode') !== requiredPasscode) {
    return json(401, { error: 'invalid passcode' });
  }

  try {
    if (method === 'POST') {
      const { city, key, label, color } = await req.json();
      if (!city || !key || !label) {
        return json(400, { error: 'city, key, and label required' });
      }
      try {
        const saved = await mutate(store, city, emptyState, (data) => {
          const c = cats(data);
          if (c.custom.some((x) => x.key === key)) { const e = new Error('exists'); e.code = 'exists'; throw e; }
          const s = { key, label, color: color || '#7f8c8d' };
          c.custom.push(s);
          return s;
        });
        return json(200, saved);
      } catch (e) {
        if (e.code === 'exists') return json(409, { error: 'category already exists' });
        throw e;
      }
    }

    if (method === 'PATCH') {
      const { city, key, label } = await req.json();
      if (!city || !key || !label) {
        return json(400, { error: 'city, key, and label required' });
      }
      await mutate(store, city, emptyState, (data) => {
        const c = cats(data);
        c.labels[key] = label;
        const custom = c.custom.find((x) => x.key === key);
        if (custom) custom.label = label;
      });
      return json(200, { ok: true });
    }

    if (method === 'DELETE') {
      const city = url.searchParams.get('city');
      const key = url.searchParams.get('key');
      if (!city || !key) return json(400, { error: 'city and key required' });
      await mutate(store, city, emptyState, (data) => {
        const c = cats(data);
        const idx = c.custom.findIndex((x) => x.key === key);
        if (idx !== -1) {
          c.custom.splice(idx, 1);
        } else if (!c.deletedKeys.includes(key)) {
          c.deletedKeys.push(key);
        }
        delete c.labels[key];
      });
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
