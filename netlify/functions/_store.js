const { getStore, connectLambda } = require('@netlify/blobs');

const STORE_NAME = 'foodie-notes';

function openStore(event) {
  connectLambda(event);
  return getStore(STORE_NAME);
}

// Read with strong consistency so we always see the latest committed write.
// Production Netlify supports this; the local `netlify dev` sandbox does not
// (it has no uncachedEdgeURL) but is immediately consistent anyway, so we fall
// back to a default read there.
async function readMeta(store, key) {
  try {
    return await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  } catch (err) {
    if (/strong consistency|uncachedEdgeURL/i.test((err && err.message) || '')) {
      return await store.getWithMetadata(key, { type: 'json' });
    }
    throw err;
  }
}

async function readJson(store, key) {
  const res = await readMeta(store, key);
  return res && res.data != null ? res.data : null;
}

// Read-modify-write with optimistic concurrency. Reads the current entry + its
// ETag, applies `mutator(data)` (mutates in place, returns the response
// payload), then writes conditionally so a concurrent write can't be clobbered,
// retrying on conflict. Falls back to an unconditional write after repeated
// conflicts so a request never hard-fails.
async function mutate(store, key, makeEmpty, mutator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await readMeta(store, key);
    const data = res && res.data != null ? res.data : makeEmpty();
    const payload = mutator(data);
    let opts;
    if (res && res.etag) opts = { onlyIfMatch: res.etag };
    else if (!res) opts = { onlyIfNew: true };
    else opts = null; // entry exists but no ETag (sandbox) → write unconditionally
    const result = await store.setJSON(key, data, opts || undefined);
    const conflicted = opts && result && result.modified === false;
    if (!conflicted) return payload;
  }
  const res = await readMeta(store, key);
  const data = res && res.data != null ? res.data : makeEmpty();
  const payload = mutator(data);
  await store.setJSON(key, data);
  return payload;
}

module.exports = { openStore, readJson, mutate };
