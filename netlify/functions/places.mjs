import { openStore, mutate, readJson } from './_store.mjs';

const emptyState = () => ({ custom: [], triedIds: [], pinnedIds: [], deletedIds: [], edits: {}, categories: { custom: [], labels: {}, deletedKeys: [] } });
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: HEADERS });

export default async (req) => {
  const store = openStore();
  const url = new URL(req.url);
  const method = req.method;

  try {
    if (method === 'GET') {
      const city = url.searchParams.get('city');
      if (!city) return json(400, { error: 'city required' });
      const data = (await readJson(store, city)) || emptyState();
      data.categories = data.categories || { custom: [], labels: {}, deletedKeys: [] };
      data.edits = data.edits || {};
      return json(200, data);
    }

    const requiredPasscode = process.env.FOODIE_PASSCODE;
    if (requiredPasscode && req.headers.get('x-foodie-passcode') !== requiredPasscode) {
      return json(401, { error: 'invalid passcode' });
    }

    if (method === 'POST') {
      const { city, place } = await req.json();
      if (!city || !place?.name || typeof place.lat !== 'number' || typeof place.lng !== 'number') {
        return json(400, { error: 'city and place (with lat/lng) required' });
      }
      const saved = await mutate(store, city, emptyState, (data) => {
        data.custom = data.custom || [];
        const s = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: place.name,
          cat: place.cat,
          addr: place.addr || '',
          note: place.note || '',
          url: place.url || '',
          lat: place.lat,
          lng: place.lng,
        };
        data.custom.push(s);
        return s;
      });
      return json(200, saved);
    }

    if (method === 'DELETE') {
      const city = url.searchParams.get('city');
      const id = url.searchParams.get('id');
      if (!city || !id) return json(400, { error: 'city and id required' });
      await mutate(store, city, emptyState, (data) => {
        data.custom = data.custom || [];
        data.deletedIds = data.deletedIds || [];
        const idx = data.custom.findIndex((p) => p.id === id);
        if (idx !== -1) {
          data.custom.splice(idx, 1);
        } else if (!data.deletedIds.includes(id)) {
          data.deletedIds.push(id);
        }
        data.triedIds = (data.triedIds || []).filter((t) => t !== id);
        data.pinnedIds = (data.pinnedIds || []).filter((t) => t !== id);
        if (data.edits) delete data.edits[id];
      });
      return json(200, { ok: true });
    }

    if (method === 'PATCH') {
      const { city, id, tried, pinned, edits } = await req.json();
      if (!city || !id) return json(400, { error: 'city and id required' });
      await mutate(store, city, emptyState, (data) => {
        if (typeof tried === 'boolean') {
          const set = new Set(data.triedIds || []);
          if (tried) set.add(id); else set.delete(id);
          data.triedIds = [...set];
        }
        if (typeof pinned === 'boolean') {
          const set = new Set(data.pinnedIds || []);
          if (pinned) set.add(id); else set.delete(id);
          data.pinnedIds = [...set];
        }
        if (edits && typeof edits === 'object') {
          data.edits = data.edits || {};
          data.edits[id] = { ...(data.edits[id] || {}), ...edits };
          const custom = (data.custom || []).find((p) => p.id === id);
          if (custom) Object.assign(custom, edits);
        }
      });
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
