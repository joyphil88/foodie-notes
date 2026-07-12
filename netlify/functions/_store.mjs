import { getStore } from '@netlify/blobs';

const STORE_NAME = 'foodie-notes';

// v2 Netlify Functions get the Blobs context automatically (no connectLambda),
// which crucially includes the uncachedEdgeURL that strong-consistency reads
// need. That's why v1/connectLambda couldn't do strong reads.
export function openStore() {
  return getStore(STORE_NAME);
}

// Read with strong consistency so every read returns the latest committed
// write. The local `netlify dev` sandbox doesn't support strong mode (no
// uncachedEdgeURL) but is immediately consistent anyway, so we fall back to a
// default read there.
export async function readMeta(store, key) {
  try {
    return await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  } catch (err) {
    if (/strong consistency|uncachedEdgeURL/i.test((err && err.message) || '')) {
      return await store.getWithMetadata(key, { type: 'json' });
    }
    throw err;
  }
}

export async function readJson(store, key) {
  const res = await readMeta(store, key);
  return res && res.data != null ? res.data : null;
}

// Read-modify-write with optimistic concurrency: read entry + ETag, apply
// `mutator(data)` (mutates in place, returns the response payload), write
// conditionally so a concurrent write can't be clobbered, retry on conflict.
export async function mutate(store, key, makeEmpty, mutator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await readMeta(store, key);
    const data = res && res.data != null ? res.data : makeEmpty();
    const payload = mutator(data);
    let opts;
    if (res && res.etag) opts = { onlyIfMatch: res.etag };
    else if (!res) opts = { onlyIfNew: true };
    else opts = null;
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
