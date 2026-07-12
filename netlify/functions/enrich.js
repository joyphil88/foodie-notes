const Anthropic = require('@anthropic-ai/sdk');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const requiredPasscode = process.env.FOODIE_PASSCODE;
  if (requiredPasscode && event.headers['x-foodie-passcode'] !== requiredPasscode) {
    return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'invalid passcode' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'invalid JSON body' }) };
  }

  const { name, cityLabel, categories, exampleNotes } = body;
  if (!name || !cityLabel) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'name and cityLabel are required' }) };
  }
  const cats = Array.isArray(categories) ? categories.filter(Boolean) : [];

  const styleExamples = (exampleNotes || []).slice(0, 3).map((n) => `- "${n}"`).join('\n')
    || '- "No-frills neighborhood spot — known for its brisket sandwich."';

  const system = `You help fill in details for a personal food-travel wishlist app. Work FAST and cheap: FIRST try to answer from your OWN knowledge. You have a web_search tool, but ONLY use it if you don't recognize the place or aren't reasonably sure of its street address — for well-known places, answer directly WITHOUT searching. Respond with ONLY a single JSON object — no markdown fences, no other text — in this exact shape:
{"name": "<corrected/canonical name>", "address": "<street address>", "category": "<one of the provided categories>", "note": "<one-line note>", "lat": <decimal latitude>, "lng": <decimal longitude>}

Rules:
- "category": a short, specific type for this place. ${cats.length ? `Prefer one of these existing categories if it genuinely fits: ${cats.join(', ')}. If none fit well, propose` : 'Propose'} a specific category of your own (e.g. "Seafood", "BBQ", "Ramen", "Coffee", "Tacos", "Bakery", "Wine Bar", "Pizza"). NEVER use a vague catch-all like "Food", "Restaurant", or "Dining" — always pick something specific. Use "Hotel" only for actual lodging.
- "address": the best street address for this place. If you only know the neighborhood, give "<neighborhood>, <city>".
- "note" must be VERY short — a single tight phrase that fits on one line (aim for 4–8 words, hard max ~10). No full sentences, no fluff. Name the one thing worth ordering or the one reason to go. Examples of the right length: "Brisket sandwich, smoked jalapeño sausage.", "Order the omakase nigiri.", "Chocolate haupia cream pie."
- "lat" and "lng" are the place's decimal coordinates as plain numbers (e.g. 21.3069, -157.8583). Give your best estimate from the address; do NOT search just to refine coordinates.
- If you still can't identify the place with reasonable confidence (even after a search), respond with {"error": "not found"} instead of guessing an address.`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 1, allowed_callers: ['direct'] }],
      messages: [
        { role: 'user', content: `Place name: "${name}"\nDestination: ${cityLabel}` },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) throw new Error('no text response from model');

    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON found in model response');
    const parsed = JSON.parse(match[0]);

    if (parsed.error) {
      return { statusCode: 422, headers: JSON_HEADERS, body: JSON.stringify({ error: parsed.error }) };
    }
    if (!parsed.name || !parsed.address || !parsed.category) {
      return { statusCode: 422, headers: JSON_HEADERS, body: JSON.stringify({ error: 'incomplete result from model' }) };
    }

    const out = {
      name: parsed.name,
      address: parsed.address,
      category: parsed.category,
      note: parsed.note || '',
    };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      out.lat = lat;
      out.lng = lng;
    }
    if (typeof parsed.mapsUrl === 'string' && /^https?:\/\//i.test(parsed.mapsUrl)) {
      out.mapsUrl = parsed.mapsUrl;
    }

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(out) };
  } catch (err) {
    const msg = err.message || 'lookup failed';
    let code = 'error';
    if (/credit balance|Plans & Billing|billing/i.test(msg)) code = 'no_credits';
    else if (/rate.?limit|overloaded|\b429\b|\b529\b/i.test(msg)) code = 'busy';
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: msg, code }) };
  }
};
