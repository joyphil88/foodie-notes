const { openStore, mutate, readJson } = require('./_store');

const emptyState = () => ({ custom: [], triedIds: [], pinnedIds: [], deletedIds: [], edits: {}, categories: { custom: [], labels: {}, deletedKeys: [] } });
const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  const store = openStore(event);
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const city = event.queryStringParameters?.city;
      if (!city) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city required' }) };
      const data = (await readJson(store, city)) || emptyState();
      data.categories = data.categories || { custom: [], labels: {}, deletedKeys: [] };
      data.edits = data.edits || {};
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(data) };
    }

    const requiredPasscode = process.env.FOODIE_PASSCODE;
    if (requiredPasscode && event.headers['x-foodie-passcode'] !== requiredPasscode) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'invalid passcode' }) };
    }

    if (method === 'POST') {
      const { city, place } = JSON.parse(event.body || '{}');
      if (!city || !place?.name || typeof place.lat !== 'number' || typeof place.lng !== 'number') {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city and place (with lat/lng) required' }) };
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
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(saved) };
    }

    if (method === 'DELETE') {
      const city = event.queryStringParameters?.city;
      const id = event.queryStringParameters?.id;
      if (!city || !id) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city and id required' }) };
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
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    if (method === 'PATCH') {
      const { city, id, tried, pinned, edits } = JSON.parse(event.body || '{}');
      if (!city || !id) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city and id required' }) };
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
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
