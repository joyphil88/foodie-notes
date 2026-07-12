const { getStore, connectLambda } = require('@netlify/blobs');

const emptyState = () => ({ custom: [], triedIds: [], pinnedIds: [], deletedIds: [], edits: {} });
const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore('foodie-notes');
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const city = event.queryStringParameters?.city;
      if (!city) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city required' }) };
      const data = (await store.get(city, { type: 'json' })) || emptyState();
      data.categories = data.categories || { custom: [], labels: {}, deletedKeys: [] };
      data.edits = data.edits || {};
      data.pinnedIds = data.pinnedIds || [];
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
      const data = (await store.get(city, { type: 'json' })) || emptyState();
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const saved = {
        id,
        name: place.name,
        cat: place.cat,
        addr: place.addr || '',
        note: place.note || '',
        url: place.url || '',
        lat: place.lat,
        lng: place.lng,
      };
      data.custom.push(saved);
      await store.setJSON(city, data);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(saved) };
    }

    if (method === 'DELETE') {
      const city = event.queryStringParameters?.city;
      const id = event.queryStringParameters?.id;
      if (!city || !id) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city and id required' }) };
      const data = (await store.get(city, { type: 'json' })) || emptyState();
      const idx = data.custom.findIndex((p) => p.id === id);
      if (idx !== -1) {
        data.custom.splice(idx, 1);
      } else if (!data.deletedIds.includes(id)) {
        data.deletedIds.push(id);
      }
      data.triedIds = data.triedIds.filter((t) => t !== id);
      data.pinnedIds = (data.pinnedIds || []).filter((t) => t !== id);
      if (data.edits) delete data.edits[id];
      await store.setJSON(city, data);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    if (method === 'PATCH') {
      const { city, id, tried, pinned, edits } = JSON.parse(event.body || '{}');
      if (!city || !id) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city and id required' }) };
      const data = (await store.get(city, { type: 'json' })) || emptyState();
      if (typeof tried === 'boolean') {
        const set = new Set(data.triedIds);
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
        const custom = data.custom.find((p) => p.id === id);
        if (custom) Object.assign(custom, edits);
      }
      await store.setJSON(city, data);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
