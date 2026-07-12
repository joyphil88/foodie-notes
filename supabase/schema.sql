-- ===== Foodie Notes: Supabase schema =====
create extension if not exists pgcrypto;

create table if not exists trips (
  slug text primary key,
  name text not null,
  subtitle text default '',
  lat double precision not null,
  lng double precision not null,
  zoom int default 12,
  created_at timestamptz default now()
);

create table if not exists categories (
  id bigint generated always as identity primary key,
  trip_slug text not null references trips(slug) on delete cascade,
  key text not null,
  label text not null,
  color text default '#7f8c8d',
  unique (trip_slug, key)
);

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  trip_slug text not null references trips(slug) on delete cascade,
  name text not null,
  cat text,
  addr text default '',
  note text default '',
  url text default '',
  lat double precision not null,
  lng double precision not null,
  tried boolean default false,
  pinned boolean default false,
  created_at timestamptz default now()
);
create index if not exists places_trip_idx on places(trip_slug);
create index if not exists categories_trip_idx on categories(trip_slug);

-- ===== Row Level Security: public read, writes only via service key =====
alter table trips enable row level security;
alter table categories enable row level security;
alter table places enable row level security;

create policy "public read trips" on trips for select using (true);
create policy "public read categories" on categories for select using (true);
create policy "public read places" on places for select using (true);
-- (No insert/update/delete policies for anon -> writes are blocked. The write
--  Netlify function uses the service_role key, which bypasses RLS.)

-- ===== Realtime (live updates across devices) =====
alter publication supabase_realtime add table trips;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table places;

-- ===== Seed data (from the hardcoded lists) =====

insert into trips (slug, name, subtitle, lat, lng, zoom) values ('hawaii', 'Hawaii 2026', 'Oahu', 21.63, -158.02, 12) on conflict (slug) do nothing;
insert into categories (trip_slug, key, label, color) values
  ('hawaii', 'Seafood', 'Seafood', '#16a085'),
  ('hawaii', 'Poke', 'Poke', '#e67e22'),
  ('hawaii', 'Bakery', 'Bakery', '#8e5e3d'),
  ('hawaii', 'Local', 'Local', '#2980b9'),
  ('hawaii', 'Dessert', 'Dessert', '#c0696e'),
  ('hawaii', 'Korean', 'Korean', '#c0392b'),
  ('hawaii', 'Activity', 'Activity', '#27ae60'),
  ('hawaii', 'Hotel', 'Hotel', '#1a1917')
on conflict (trip_slug, key) do nothing;
insert into places (trip_slug, name, cat, addr, note, lat, lng) values
  ('hawaii', 'Aulani', 'Hotel', '92-1185 Aliʻinui Dr, Ko Olina', 'Where you''re staying.', 21.3366, -158.1237),
  ('hawaii', 'Ritz-Carlton Turtle Bay', 'Hotel', '57-091 Kamehameha Hwy, Kahuku', 'Where you''re staying.', 21.6972, -157.997),
  ('hawaii', 'Da Seafood Cartel', 'Seafood', 'Honolulu, HI', 'Fresh poke bowls and seafood plates — a local favorite for quality fish.', 21.3135, -157.8557),
  ('hawaii', 'Asahi Grill', 'Local', '633 Dillingham Blvd, Honolulu', 'No-frills island diner — loco moco and plate lunches done right, open late.', 21.3244, -157.8706),
  ('hawaii', 'Haleiwa No. 7', 'Seafood', 'Haleiwa, HI', 'North Shore seafood spot with fresh catches and a laid-back beach-town vibe.', 21.5926, -158.1053),
  ('hawaii', 'Morning Catch', 'Seafood', 'Haleiwa, HI', 'Casual breakfast and lunch with fresh-caught fish — arrive early, it goes fast.', 21.5935, -158.1062),
  ('hawaii', 'Kono''s', 'Local', '66-250 Kamehameha Hwy, Haleiwa', 'Legendary breakfast burritos stuffed with kalua pork or shrimp — the North Shore staple.', 21.5953, -158.1095),
  ('hawaii', 'Down to Earth', 'Local', '66-197 Kamehameha Hwy, Haleiwa', 'Organic market and hot bar — great pit stop for healthy bites and local produce.', 21.5941, -158.1082),
  ('hawaii', 'Makua Banana Bread', 'Bakery', 'Farrington Hwy, North Shore', 'Roadside banana bread stand — warm loaves fresh out of the oven, cash only.', 21.637, -158.062),
  ('hawaii', 'Paalaa Kai Bakery', 'Bakery', '67-106 Kealohanui St, Waialua', 'Old-school bakery famous for puffies — pillowy fried malasada-style donuts.', 21.5728, -158.1311),
  ('hawaii', 'Poke for the People', 'Poke', 'Haleiwa, HI', 'No-frills poke counter with fresh fish and creative toppings — big portions.', 21.5922, -158.1045),
  ('hawaii', 'Haleiwa Joe''s', 'Seafood', '66-011 Kamehameha Hwy, Haleiwa', 'Waterfront seafood and steak spot right on the harbor — go for sunset and the fresh catch.', 21.5943, -158.1057),
  ('hawaii', 'Kahuku Superette', 'Poke', '56-505 Kamehameha Hwy, Kahuku', 'Unassuming local market with some of the best poke on the island — get the shoyu ahi.', 21.6791, -157.9514),
  ('hawaii', 'Ted''s Bakery', 'Bakery', '59-024 Kamehameha Hwy, Sunset Beach', 'North Shore institution — chocolate haupia cream pie and plate lunches.', 21.6647, -158.0486),
  ('hawaii', 'Da Bald Guy', 'Seafood', 'Kahuku, HI', 'Food truck serving Kahuku shrimp in garlic butter or spicy — a North Shore rite.', 21.6783, -157.956),
  ('hawaii', 'Famous Kahuku Shrimp Truck', 'Seafood', '56-580 Kamehameha Hwy, Kahuku', 'The original Kahuku shrimp truck — classic garlic butter shrimp plate, always a line.', 21.6772, -157.9491),
  ('hawaii', 'Romy''s Kahuku Prawns & Shrimp', 'Seafood', '56-781 Kamehameha Hwy, Kahuku', 'Shrimp hut with prawns raised on-site — try the lemon butter or hot & spicy.', 21.6798, -157.95),
  ('hawaii', 'Ry''s Poke Shack', 'Poke', 'Kahuku, HI', 'Small-batch poke shack with a rotating menu of fresh, inventive flavors.', 21.6788, -157.9518),
  ('hawaii', 'Seven Brothers', 'Local', '56-565 Kamehameha Hwy, Kahuku', 'Local burger joint in an old sugar mill building — known for their smash burgers.', 21.6768, -157.9483),
  ('hawaii', 'Kahuku Farms', 'Local', '56-800 Kamehameha Hwy, Kahuku', 'Working farm with a café — try the açaí bowl topped with their own tropical fruits.', 21.6803, -157.9536),
  ('hawaii', 'Badabingsu', 'Dessert', 'Kahuku, HI', 'Korean bingsu shaved ice in creative flavors — the perfect North Shore cool-down.', 21.681, -157.9527),
  ('hawaii', 'Kalbi on Fire', 'Korean', 'Kahuku, HI', 'Food truck with Korean BBQ kalbi and loco moco mashups — bold flavors, big plates.', 21.6795, -157.9545),
  ('hawaii', 'Gunstock Ranch', 'Activity', '56-250 Kamehameha Hwy, Laie', 'Working cattle ranch in the Ko''olau foothills — horseback rides and mountain views.', 21.6484, -157.9118),
  ('hawaii', 'Three Tables Beach', 'Activity', '59-337 Kamehameha Hwy, Haleiwa', 'Calm-water snorkeling spot named for its flat reef tables — great for beginners in summer months.', 21.6388, -158.0578);

insert into trips (slug, name, subtitle, lat, lng, zoom) values ('austin', 'Austin', 'Texas · 2026', 30.267, -97.743, 13) on conflict (slug) do nothing;
insert into categories (trip_slug, key, label, color) values
  ('austin', 'BBQ', 'BBQ', '#c0392b'),
  ('austin', 'Japanese', 'Japanese', '#2980b9'),
  ('austin', 'Seafood', 'Seafood', '#16a085'),
  ('austin', 'Brunch', 'Brunch', '#c0960c'),
  ('austin', 'Burgers', 'Burgers', '#8e44ad'),
  ('austin', 'Caribbean', 'Caribbean', '#27ae60'),
  ('austin', 'TexMex', 'Tex-Mex', '#e67e22'),
  ('austin', 'Bakery', 'Bakery / Coffee', '#7f8c8d'),
  ('austin', 'Bars', 'Bars', '#2c3e50'),
  ('austin', 'Hotel', 'Hotel', '#1a1917')
on conflict (trip_slug, key) do nothing;
insert into places (trip_slug, name, cat, addr, note, lat, lng) values
  ('austin', 'Thompson Austin', 'Hotel', '506 San Jacinto Blvd', 'Where you''re staying.', 30.2659, -97.7404),
  ('austin', 'Parish BBQ', 'BBQ', '3220 Manor Rd', 'East Austin stalwart — brisket sandwich and the smoked jalapeño sausage.', 30.271, -97.7043),
  ('austin', 'Mum Foods', 'BBQ', '5811 Manor Rd', 'Nigerian-spiced BBQ — suya-rubbed ribs are unlike anywhere else in Austin.', 30.2917, -97.6826),
  ('austin', 'Fiasco BBQ', 'BBQ', '641 Allen St', 'No-frills neighborhood smoke spot — brisket by the pound, cash only.', 30.2608, -97.7317),
  ('austin', 'Space Kat BBQ', 'BBQ', '2431 Webberville Rd', 'Funky East Side newcomer — creative cuts and links with big smoke flavor.', 30.2629, -97.7033),
  ('austin', 'Konbini', 'Japanese', '908 E 5th St', 'Japanese convenience store vibes — onigiri, katsu sando, and natural wine.', 30.259, -97.7338),
  ('austin', 'Kome', 'Japanese', '4917 Airport Blvd', 'Beloved neighborhood sushi and izakaya — order the omakase nigiri.', 30.3052, -97.7147),
  ('austin', 'Clark''s Oyster Bar', 'Seafood', '1200 W 6th St', 'Austin''s classic raw bar — Gulf oysters and the lobster roll.', 30.2735, -97.7573),
  ('austin', 'Paperboy', 'Brunch', '1203 E 11th St', 'East Austin breakfast institution — grain bowls and the egg sandwich.', 30.2702, -97.7269),
  ('austin', 'Joann''s Fine Foods', 'Brunch', '1224 S Congress Ave', 'Retro-cool all-day diner on SoCo — short rib hash is the order.', 30.2486, -97.7508),
  ('austin', 'Bird Bird Biscuit', 'Brunch', '2701 Manor Rd', 'Massive fried chicken biscuits — get the Dolly Parton, no question.', 30.2729, -97.7071),
  ('austin', 'Birdie''s', 'Brunch', '2944 E 12th St', 'One of Austin''s hottest tables — natural wine and Italian-leaning bites.', 30.2683, -97.7007),
  ('austin', 'NADC Burger', 'Burgers', '1007 E 6th St', 'No-frills smash burgers on East 6th — double with American cheese.', 30.2612, -97.7311),
  ('austin', 'Canje', 'Caribbean', '1914 E 6th St', 'Caribbean cooking by ATX''s Brunch Queen — jerk chicken and doubles.', 30.259, -97.7197),
  ('austin', 'Taco Joint', 'TexMex', '134 E Riverside Dr', 'South Austin Tex-Mex staple — breakfast tacos all day long.', 30.2501, -97.7462),
  ('austin', 'Rockman Coffee + Bakeshop', 'Bakery', '2400 E Cesar Chavez St', 'East Side gem — sourdough croissants and serious single origin espresso.', 30.259, -97.7111),
  ('austin', 'Equipment Room', 'Bars', '1101 Music Ln', 'Sleek hotel bar on Music Lane — strong cocktails and a great outdoor patio.', 30.2487, -97.7577),
  ('austin', 'Small Victory', 'Bars', '108 E 7th St', 'Intimate craft cocktail bar downtown — one of Austin''s best kept secrets.', 30.2676, -97.7404);
