const { openStore, mutate } = require('./_store');

const emptyCategories = () => ({ custom: [], labels: {}, deletedKeys: [] });
const emptyState = () => ({ custom: [], triedIds: [], pinnedIds: [], deletedIds: [], edits: {}, categories: emptyCategories() });
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function cats(data) {
  data.categories = data.categories || emptyCategories();
  data.categories.custom = data.categories.custom || [];
  data.categories.labels = data.categories.labels || {};
  data.categories.deletedKeys = data.categories.deletedKeys || [];
  return data.categories;
}

exports.handler = async (event) => {
  const store = openStore(event);
  const method = event.httpMethod;

  const requiredPasscode = process.env.FOODIE_PASSCODE;
  if (requiredPasscode && event.headers['x-foodie-passcode'] !== requiredPasscode) {
    return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'invalid passcode' }) };
  }

  try {
    if (method === 'POST') {
      const { city, key, label, color } = JSON.parse(event.body || '{}');
      if (!city || !key || !label) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city, key, and label required' }) };
      }
      try {
        const saved = await mutate(store, city, emptyState, (data) => {
          const c = cats(data);
          if (c.custom.some((x) => x.key === key)) { const e = new Error('exists'); e.code = 'exists'; throw e; }
          const s = { key, label, color: color || '#7f8c8d' };
          c.custom.push(s);
          return s;
        });
        return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(saved) };
      } catch (e) {
        if (e.code === 'exists') return { statusCode: 409, headers: JSON_HEADERS, body: JSON.stringify({ error: 'category already exists' }) };
        throw e;
      }
    }

    if (method === 'PATCH') {
      const { city, key, label } = JSON.parse(event.body || '{}');
      if (!city || !key || !label) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city, key, and label required' }) };
      }
      await mutate(store, city, emptyState, (data) => {
        const c = cats(data);
        c.labels[key] = label;
        const custom = c.custom.find((x) => x.key === key);
        if (custom) custom.label = label;
      });
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    if (method === 'DELETE') {
      const city = event.queryStringParameters?.city;
      const key = event.queryStringParameters?.key;
      if (!city || !key) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city and key required' }) };
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
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
