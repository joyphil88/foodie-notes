const { openStore, mutate, readJson } = require('./_store');

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const TRIPS_KEY = '_trips';
const emptyTrips = () => [];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

exports.handler = async (event) => {
  const store = openStore(event);
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const trips = (await readJson(store, TRIPS_KEY)) || [];
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
      const trip = await mutate(store, TRIPS_KEY, emptyTrips, (trips) => {
        let slug = slugify(name);
        let n = 2;
        while (trips.some((t) => t.slug === slug)) { slug = `${slugify(name)}-${n++}`; }
        const t = { slug, name, subtitle: subtitle || '', lat, lng, zoom: zoom || 12, createdAt: Date.now() };
        trips.push(t);
        return t;
      });
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(trip) };
    }

    if (method === 'PATCH') {
      const { slug, name, subtitle } = JSON.parse(event.body || '{}');
      if (!slug) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'slug required' }) };
      try {
        const trip = await mutate(store, TRIPS_KEY, emptyTrips, (trips) => {
          const t = trips.find((x) => x.slug === slug);
          if (!t) { const e = new Error('notfound'); e.code = 'notfound'; throw e; }
          if (typeof name === 'string' && name.trim()) t.name = name.trim();
          if (typeof subtitle === 'string') t.subtitle = subtitle.trim();
          return t;
        });
        return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(trip) };
      } catch (e) {
        if (e.code === 'notfound') return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'trip not found' }) };
        throw e;
      }
    }

    if (method === 'DELETE') {
      const slug = event.queryStringParameters?.slug;
      if (!slug) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'slug required' }) };
      await mutate(store, TRIPS_KEY, emptyTrips, (trips) => {
        const idx = trips.findIndex((t) => t.slug === slug);
        if (idx !== -1) trips.splice(idx, 1);
      });
      await store.delete(slug);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
