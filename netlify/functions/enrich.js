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
  if (!name || !cityLabel || !Array.isArray(categories) || categories.length === 0) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'name, cityLabel, and categories are required' }) };
  }

  const styleExamples = (exampleNotes || []).slice(0, 3).map((n) => `- "${n}"`).join('\n')
    || '- "No-frills neighborhood spot — known for its brisket sandwich."';

  const system = `You help fill in details for a personal food-travel wishlist app. Given a place name and a destination, search the web to confirm the place exists and find its street address, then respond with ONLY a single JSON object — no markdown fences, no other text — in this exact shape:
{"name": "<corrected/canonical name>", "address": "<street address>", "category": "<one of the provided categories>", "note": "<one-line note>"}

Rules:
- "category" must be exactly one of these: ${categories.join(', ')}. Pick the closest fit.
- "note" is a single sentence, in this house style (dash-separated hook + detail, no fluff):
${styleExamples}
- If you cannot find the place with reasonable confidence, respond with {"error": "not found"} instead of guessing.`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
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

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
