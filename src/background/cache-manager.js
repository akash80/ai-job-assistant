import { STORAGE_KEYS, CACHE_MAX_AGE_MS, CACHE_MAX_SIZE_BYTES } from "../shared/constants.js";
import { getFromStorage, saveToStorage } from "./storage-manager.js";
import { normalizeJobPageUrl, buildJobPostingKey } from "../shared/utils.js";

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

/**
 * Fallback cache lookup by normalized job URL.
 * Makes cache more forgiving on dynamic pages where small text changes alter content hash.
 */
export async function getCachedAnalysisByUrl(pageUrl) {
  const normalized = normalizeJobPageUrl(pageUrl);
  if (!normalized) return null;

  const cache = await getCache();
  let newest = null;
  let mutated = false;

  for (const [key, entry] of Object.entries(cache)) {
    const age = Date.now() - new Date(entry.timestamp).getTime();
    if (age > CACHE_MAX_AGE_MS) {
      delete cache[key];
      mutated = true;
      continue;
    }
    const entryUrl = normalizeJobPageUrl(entry.jobUrl || "");
    if (entryUrl === normalized) {
      if (!newest || new Date(entry.timestamp) > new Date(newest.timestamp)) {
        newest = entry;
      }
    }
  }

  if (mutated) {
    await saveCache(cache);
  }
  return newest;
}

/**
 * When the content hash changes (dynamic page text) but the job posting is the same (LinkedIn job id, etc.).
 */
export async function getCachedAnalysisByPostingKey(postingKey) {
  if (!postingKey) return null;

  const cache = await getCache();
  let newest = null;
  let mutated = false;

  for (const [key, entry] of Object.entries(cache)) {
    const age = Date.now() - new Date(entry.timestamp).getTime();
    if (age > CACHE_MAX_AGE_MS) {
      delete cache[key];
      mutated = true;
      continue;
    }
    const entryKey = entry.jobPostingKey || buildJobPostingKey(entry.jobUrl || "");
    if (entryKey === postingKey) {
      if (!newest || new Date(entry.timestamp) > new Date(newest.timestamp)) {
        newest = entry;
      }
    }
  }

  if (mutated) await saveCache(cache);
  return newest;
}

export async function cacheAnalysis(contentHash, result, meta = {}) {
  const cache = await getCache();
  const jobUrl = meta.jobUrl || "";
  const jobPostingKey = meta.jobPostingKey || buildJobPostingKey(jobUrl);

  cache[contentHash] = {
    result,
    jobUrl,
    jobTitle: meta.jobTitle || "",
    timestamp: new Date().toISOString(),
    model: meta.model || "",
    tokensUsed: meta.tokensUsed || 0,
    jobPostingKey,
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

  while (JSON.stringify(cache).length > CACHE_MAX_SIZE_BYTES && entries.length > 1) {
    const [oldestKey] = entries.shift();
    delete cache[oldestKey];
  }
}
