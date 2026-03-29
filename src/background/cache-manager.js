import { STORAGE_KEYS, CACHE_MAX_AGE_MS, CACHE_MAX_SIZE_BYTES } from "../shared/constants.js";
import { getFromStorage, saveToStorage } from "./storage-manager.js";

export async function getCachedAnalysis(contentHash) {
  const cache = await getCache();
  const entry = cache[contentHash];

  if (!entry) return null;

  const age = Date.now() - new Date(entry.timestamp).getTime();
  if (age > CACHE_MAX_AGE_MS) {
    delete cache[contentHash];
    await saveCache(cache);
    return null;
  }

  return entry;
}

export async function cacheAnalysis(contentHash, result, meta = {}) {
  const cache = await getCache();

  cache[contentHash] = {
    result,
    jobUrl: meta.jobUrl || "",
    jobTitle: meta.jobTitle || "",
    timestamp: new Date().toISOString(),
    model: meta.model || "",
    tokensUsed: meta.tokensUsed || 0,
  };

  await evictIfNeeded(cache);
  await saveCache(cache);
}

export async function clearCache() {
  await saveToStorage(STORAGE_KEYS.ANALYSIS_CACHE, {});
}

export async function getCacheStats() {
  const cache = await getCache();
  const entries = Object.keys(cache).length;
  const sizeEstimate = JSON.stringify(cache).length;
  return { entries, sizeEstimate };
}

async function getCache() {
  return (await getFromStorage(STORAGE_KEYS.ANALYSIS_CACHE)) || {};
}

async function saveCache(cache) {
  await saveToStorage(STORAGE_KEYS.ANALYSIS_CACHE, cache);
}

async function evictIfNeeded(cache) {
  const serialized = JSON.stringify(cache);
  if (serialized.length <= CACHE_MAX_SIZE_BYTES) return;

  const entries = Object.entries(cache).sort(
    ([, a], [, b]) => new Date(a.timestamp) - new Date(b.timestamp),
  );

  while (JSON.stringify(cache).length > CACHE_MAX_SIZE_BYTES && entries.length > 0) {
    const [oldestKey] = entries.shift();
    delete cache[oldestKey];
  }
}
