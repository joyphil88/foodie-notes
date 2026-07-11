const { getStore, connectLambda } = require('@netlify/blobs');

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const TRIPS_KEY = '_trips';

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore('foodie-notes');
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const trips = (await store.get(TRIPS_KEY, { type: 'json' })) || [];
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(trips) };
    }

    const requiredPasscode = process.env.FOODIE_PASSCODE;
    if (requiredPasscode && event.headers['x-foodie-passcode'] !== requiredPasscode) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'invalid passcode' }) };
    }

    if (method === 'POST') {
      const { name, subtitle, lat, lng, zoom } = JSON.parse(event.body || '{}');
      if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'name and lat/lng required' }) };
      }
      const trips = (await store.get(TRIPS_KEY, { type: 'json' })) || [];
      let slug = slugify(name);
      let n = 2;
      while (trips.some((t) => t.slug === slug)) { slug = `${slugify(name)}-${n++}`; }
      const trip = { slug, name, subtitle: subtitle || '', lat, lng, zoom: zoom || 12, createdAt: Date.now() };
      trips.push(trip);
      await store.setJSON(TRIPS_KEY, trips);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(trip) };
    }

    if (method === 'PATCH') {
      const { slug, name, subtitle } = JSON.parse(event.body || '{}');
      if (!slug) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'slug required' }) };
      const trips = (await store.get(TRIPS_KEY, { type: 'json' })) || [];
      const trip = trips.find((t) => t.slug === slug);
      if (!trip) return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'trip not found' }) };
      if (typeof name === 'string' && name.trim()) trip.name = name.trim();
      if (typeof subtitle === 'string') trip.subtitle = subtitle.trim();
      await store.setJSON(TRIPS_KEY, trips);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(trip) };
    }

    if (method === 'DELETE') {
      const slug = event.queryStringParameters?.slug;
      if (!slug) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'slug required' }) };
      const trips = (await store.get(TRIPS_KEY, { type: 'json' })) || [];
      const idx = trips.findIndex((t) => t.slug === slug);
      if (idx !== -1) trips.splice(idx, 1);
      await store.setJSON(TRIPS_KEY, trips);
      await store.delete(slug);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
