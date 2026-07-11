const { getStore, connectLambda } = require('@netlify/blobs');

const emptyState = () => ({ custom: [], triedIds: [], deletedIds: [], categories: emptyCategories() });
const emptyCategories = () => ({ custom: [], labels: {}, deletedKeys: [] });
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function normalize(data) {
  data.categories = data.categories || emptyCategories();
  data.categories.custom = data.categories.custom || [];
  data.categories.labels = data.categories.labels || {};
  data.categories.deletedKeys = data.categories.deletedKeys || [];
  return data;
}

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore('foodie-notes');
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
      const data = normalize((await store.get(city, { type: 'json' })) || emptyState());
      if (data.categories.custom.some((c) => c.key === key)) {
        return { statusCode: 409, headers: JSON_HEADERS, body: JSON.stringify({ error: 'category already exists' }) };
      }
      const saved = { key, label, color: color || '#7f8c8d' };
      data.categories.custom.push(saved);
      await store.setJSON(city, data);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(saved) };
    }

    if (method === 'PATCH') {
      const { city, key, label } = JSON.parse(event.body || '{}');
      if (!city || !key || !label) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city, key, and label required' }) };
      }
      const data = normalize((await store.get(city, { type: 'json' })) || emptyState());
      data.categories.labels[key] = label;
      const custom = data.categories.custom.find((c) => c.key === key);
      if (custom) custom.label = label;
      await store.setJSON(city, data);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    if (method === 'DELETE') {
      const city = event.queryStringParameters?.city;
      const key = event.queryStringParameters?.key;
      if (!city || !key) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'city and key required' }) };
      const data = normalize((await store.get(city, { type: 'json' })) || emptyState());
      const idx = data.categories.custom.findIndex((c) => c.key === key);
      if (idx !== -1) {
        data.categories.custom.splice(idx, 1);
      } else if (!data.categories.deletedKeys.includes(key)) {
        data.categories.deletedKeys.push(key);
      }
      delete data.categories.labels[key];
      await store.setJSON(city, data);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
