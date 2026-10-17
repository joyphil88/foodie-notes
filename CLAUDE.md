# Foodie Notes

Phil's travel food wishlist: one list ("trip") per city, each with places on a map.
Live at https://foodie-notes.netlify.app. Mostly used on an iPhone in Safari.

## Rules

- **Ask Phil before every `git push`.** Pushing to `main` is the deploy — Netlify
  builds on push, and Phil watches build minutes, so batch changes into one push.
- **Never run `netlify deploy`** (it has created duplicate sites before).
- Database writes (fixing a row, backfills) need the app passcode, which is not in
  the repo. Don't ask for it in chat — tell Phil what to change in the app instead
  (e.g. delete a place and re-add it to re-run pin lookup).
- Schema changes (new columns) must be run by Phil in the Supabase SQL editor
  **before** deploying code that writes them, or every insert fails.

## Layout

No build step — plain HTML/JS, libraries from CDNs.

- `index.html` — home page, the list of trips. Reads Supabase over plain REST
  (`sbGet`), caches the list in localStorage, sorts by latest activity
  (trip created or place added).
- `trip.html` — one trip: list + Leaflet map, filter pills, add/edit place.
  Reads via supabase-js, live updates via Supabase realtime.
- `netlify/functions/db.mjs` — the only write path. Passcode-gated proxy
  (`x-foodie-passcode` header) holding the Supabase service key.
  Body: `{ table, op: insert|update|delete, values?, match? }`.
- `netlify/functions/enrich.js` — "add by name": asks Claude (Haiku 4.5, web search
  fallback) for address, area, category, note, coords.
- `supabase/schema.sql` — tables `trips`, `categories`, `places`. Public read RLS.
- `austin2026.html`, `hawaii2026.html` — legacy redirects; leave them.

Env vars (Netlify UI only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`FOODIE_PASSCODE`, `ANTHROPIC_API_KEY`. Changing one does nothing until the next
deploy.

## Gotchas

- **Map tiles:** OpenFreeMap Positron via `maplibre-gl` + `maplibre-gl-leaflet`.
  Keep `maplibre-gl` on **5.x** — 6.x has no UMD build and the CDN script 404s.
- **AI coordinates are unreliable** (flipped longitude signs, a whole degree off).
  `refineCoordsByName` in trip.html geocodes the address with Nominatim first and
  only trusts the AI estimate when nothing better exists; `plausibleCoords` rejects
  anything over 500 km from the trip centre. Keep that order when changing it.
- **Hotel** is a special category: check with `isHotelCat()` (case-insensitive),
  never `=== 'Hotel'`. Hotels sort first, stay on the map under every filter, and
  are hidden from filter pills.
- **Any new `:hover` rule must sit inside `@media (hover: hover)`** — iOS keeps hover
  on the last-tapped element otherwise.
- Mobile inputs must be 16px or iOS zooms on focus.
- Filter pills collapse to 2 rows (mobile) / 3 (desktop) behind a `+N` pill
  (`applyFilterOverflow`); the selected pill is moved up front so it never hides.

## Checking changes

There are no tests. After editing, syntax-check the inline scripts:

```bash
python3 -c "import re;s=open('trip.html').read();print('\n'.join(re.findall(r'<script>(.*?)</script>',s,re.S)))" > /tmp/chk.js && node --check /tmp/chk.js
```

Locally, `netlify dev` serves the site with functions on port 8888. After a push,
check the live site — the deploy is usually live within a minute.
