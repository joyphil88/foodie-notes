import { openStore, mutate, readJson } from './_store.mjs';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: HEADERS });
const TRIPS_KEY = '_trips';
const emptyTrips = () => [];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default async (req) => {
  const store = openStore();
  const url = new URL(req.url);
  const method = req.method;

  try {
    if (method === 'GET') {
      const trips = (await readJson(store, TRIPS_KEY)) || [];
      return json(200, trips);
    }

    const requiredPasscode = process.env.FOODIE_PASSCODE;
    if (requiredPasscode && req.headers.get('x-foodie-passcode') !== requiredPasscode) {
      return json(401, { error: 'invalid passcode' });
    }

    if (method === 'POST') {
      const { name, subtitle, lat, lng, zoom } = await req.json();
      if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
        return json(400, { error: 'name and lat/lng required' });
      }
      const trip = await mutate(store, TRIPS_KEY, emptyTrips, (trips) => {
        let slug = slugify(name);
        let n = 2;
        while (trips.some((t) => t.slug === slug)) { slug = `${slugify(name)}-${n++}`; }
        const t = { slug, name, subtitle: subtitle || '', lat, lng, zoom: zoom || 12, createdAt: Date.now() };
        trips.push(t);
        return t;
      });
      return json(200, trip);
    }

    if (method === 'PATCH') {
      const { slug, name, subtitle } = await req.json();
      if (!slug) return json(400, { error: 'slug required' });
      try {
        const trip = await mutate(store, TRIPS_KEY, emptyTrips, (trips) => {
          const t = trips.find((x) => x.slug === slug);
          if (!t) { const e = new Error('notfound'); e.code = 'notfound'; throw e; }
          if (typeof name === 'string' && name.trim()) t.name = name.trim();
          if (typeof subtitle === 'string') t.subtitle = subtitle.trim();
          return t;
        });
        return json(200, trip);
      } catch (e) {
        if (e.code === 'notfound') return json(404, { error: 'trip not found' });
        throw e;
      }
    }

    if (method === 'DELETE') {
      const slug = url.searchParams.get('slug');
      if (!slug) return json(400, { error: 'slug required' });
      await mutate(store, TRIPS_KEY, emptyTrips, (trips) => {
        const idx = trips.findIndex((t) => t.slug === slug);
        if (idx !== -1) trips.splice(idx, 1);
      });
      await store.delete(slug);
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
